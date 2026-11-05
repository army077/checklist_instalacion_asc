import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAdminAuth } from '../auth/AdminAuth'
import {
  changeConversationStatus,
  getConversationContext,
  getReplyStatus,
  listConversations,
  sendHumanMessage,
  updateContact,
  type ConversationDetail,
  type ConversationStatus,
  type ConversationSummary,
  type ReplyStatus,
  sendTemplateMessage,
} from '../data/api18'
import {
  buildChecklistMessage,
  previewReopenTemplateMessage,
  buildReopenTemplateVariables,
  resolveChecklistAvailability,
  REOPEN_WINDOW_TEMPLATE_SID,
  type ChecklistAvailability,
} from '../data/checklistSend'

const STATUS_FOLDERS: { value: ConversationStatus | ''; label: string; icon: string }[] = [
  { value: '', label: 'Todas', icon: '🗂️' },
  { value: 'open', label: 'Bot', icon: '🤖' },
  { value: 'human', label: 'Humano', icon: '🧑' },
  { value: 'closed', label: 'Cerradas', icon: '✅' },
]

const STATUS_LABEL: Record<ConversationStatus, string> = {
  open: 'Atendida por bot',
  human: 'Con agente humano',
  closed: 'Cerrada',
}

const SENT_BY_LABEL: Record<string, string> = {
  customer: 'Cliente',
  bot: 'Bot',
  human: 'Agente',
  system: 'Sistema',
}

const LIST_POLL_MS = 10_000
const DETAIL_POLL_MS = 5_000

type InfoTab = 'info' | 'adjuntos' | 'actividades'

function contactName(c: { full_name: string | null; whatsapp_name: string | null; phone: string }) {
  return c.full_name || c.whatsapp_name || c.phone
}

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '#'
  )
}

function relativeTime(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return 'ahora'
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `hace ${diffH} h`
  const diffD = Math.round(diffH / 24)
  if (diffD < 7) return `hace ${diffD} d`
  return date.toLocaleDateString()
}

function fullTimestamp(iso: string) {
  return new Date(iso).toLocaleString()
}

export default function Conversations() {
  const { logout } = useAdminAuth()
  const [status, setStatus] = useState<ConversationStatus | ''>('')
  const [search, setSearch] = useState('')
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [listError, setListError] = useState('')
  const [listLoading, setListLoading] = useState(true)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [detailError, setDetailError] = useState('')
  const [detailLoading, setDetailLoading] = useState(false)
  const [infoTab, setInfoTab] = useState<InfoTab>('info')
  const [editingField, setEditingField] = useState<'full_name' | 'company' | 'email' | 'customer_code' | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [savingField, setSavingField] = useState(false)
  const [fieldError, setFieldError] = useState('')

  // Intervención humana (solo conversaciones sobre el número habilitado)
  const [replyStatus, setReplyStatus] = useState<ReplyStatus | null>(null)
  const [statusBusy, setStatusBusy] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [draft, setDraft] = useState('')
  const [sendBusy, setSendBusy] = useState(false)
  const [sendError, setSendError] = useState('')

  // Plantilla aprobada por Meta para reabrir la ventana de 24h cuando ya
  // está cerrada (ver sendTemplateMessage / whatsappTemplates.js).
  const [templateSending, setTemplateSending] = useState(false)
  const [templateError, setTemplateError] = useState('')

  // «Enviar checklist»: disponibilidad (boletín + responsable definitivo +
  // preguntas generadas en checklist_asc) y estado del modal de vista previa.
  const [checklistInfo, setChecklistInfo] = useState<ChecklistAvailability | null>(null)
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [checklistModalOpen, setChecklistModalOpen] = useState(false)
  const [checklistReplyStatus, setChecklistReplyStatus] = useState<ReplyStatus | null>(null)
  const [checklistSending, setChecklistSending] = useState(false)
  const [checklistError, setChecklistError] = useState('')

  const threadRef = useRef<HTMLDivElement>(null)

  // Se trae siempre el listado completo (solo filtrado por búsqueda) para poder
  // mostrar contadores por carpeta/estado; el filtro de estado se aplica en cliente.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const rows = await listConversations({ search })
        if (cancelled) return
        setConversations(rows)
        setListError('')
      } catch (error) {
        if (!cancelled) setListError(error instanceof Error ? error.message : 'No se pudo conectar con la API18')
      } finally {
        if (!cancelled) setListLoading(false)
      }
    }
    setListLoading(true)
    load()
    const interval = window.setInterval(load, LIST_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [search])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const data = await getConversationContext(selectedId)
        if (cancelled) return
        setDetail(data)
        setDetailError('')
      } catch (error) {
        if (!cancelled) setDetailError(error instanceof Error ? error.message : 'No se pudo cargar la conversación')
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    }
    setDetailLoading(true)
    load()
    const interval = window.setInterval(load, DETAIL_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [selectedId])

  // Estado de intervención (habilitada / número elegible / ventana de 24h).
  useEffect(() => {
    if (!selectedId) {
      setReplyStatus(null)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const data = await getReplyStatus(selectedId)
        if (!cancelled) setReplyStatus(data)
      } catch {
        // Silencioso: no es crítico para ver el historial, solo para responder.
        if (!cancelled) setReplyStatus({ enabled: false })
      }
    }
    load()
    const interval = window.setInterval(load, DETAIL_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [selectedId])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
  }, [detail])

  useEffect(() => {
    setInfoTab('info')
    setEditingField(null)
    setFieldError('')
    setDraft('')
    setSendError('')
    setStatusError('')
    setTemplateError('')
    setChecklistModalOpen(false)
    setChecklistError('')
    setChecklistReplyStatus(null)
  }, [selectedId])

  // Disponibilidad del checklist para la conversación seleccionada: boletín
  // vinculado, responsable definitivo (incluye referencias a un contacto
  // alternativo) y preguntas ya generadas en checklist_asc.
  useEffect(() => {
    if (!selectedId) {
      setChecklistInfo(null)
      return
    }
    let cancelled = false
    setChecklistLoading(true)
    resolveChecklistAvailability(selectedId)
      .then((info) => {
        if (!cancelled) setChecklistInfo(info)
      })
      .catch((error) => {
        if (!cancelled) {
          setChecklistInfo({
            available: false,
            reason: error instanceof Error ? error.message : 'No se pudo verificar el checklist.',
          })
        }
      })
      .finally(() => {
        if (!cancelled) setChecklistLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  // Ventana de 24h / elegibilidad del número para la conversación destino
  // (puede ser distinta de la seleccionada si hubo un responsable alternativo).
  useEffect(() => {
    if (!checklistModalOpen || !checklistInfo?.targetConversationId) return
    let cancelled = false
    getReplyStatus(checklistInfo.targetConversationId)
      .then((data) => {
        if (!cancelled) setChecklistReplyStatus(data)
      })
      .catch(() => {
        if (!cancelled) setChecklistReplyStatus({ enabled: false })
      })
    return () => {
      cancelled = true
    }
  }, [checklistModalOpen, checklistInfo?.targetConversationId])

  const startEdit = (field: typeof editingField, currentValue: string) => {
    setEditingField(field)
    setEditDraft(currentValue)
    setFieldError('')
  }

  const cancelEdit = () => {
    setEditingField(null)
    setFieldError('')
  }

  const saveEdit = async () => {
    if (!editingField || !detail?.contact) return
    const contactId = detail.contact.id
    const field = editingField
    const value = editDraft.trim()
    setSavingField(true)
    setFieldError('')
    try {
      const updated = await updateContact(contactId, { [field]: value || null })
      setDetail((current) => (current ? { ...current, contact: updated } : current))
      setEditingField(null)
    } catch (error) {
      setFieldError(error instanceof Error ? error.message : 'No se pudo guardar el cambio.')
    } finally {
      setSavingField(false)
    }
  }

  // Marca localmente el nuevo estado (lista + detalle) para feedback inmediato;
  // el siguiente ciclo de polling confirma contra el servidor.
  const patchLocalStatus = (conversationId: string, nextStatus: ConversationStatus) => {
    setConversations((current) => current.map((c) => (c.id === conversationId ? { ...c, status: nextStatus } : c)))
    setDetail((current) => (current && current.conversation.id === conversationId
      ? { ...current, conversation: { ...current.conversation, status: nextStatus } }
      : current))
  }

  const handleChangeStatus = async (nextStatus: ConversationStatus) => {
    if (!selectedId) return
    setStatusBusy(true)
    setStatusError('')
    try {
      const updated = await changeConversationStatus(selectedId, nextStatus)
      patchLocalStatus(selectedId, updated.status)
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'No se pudo cambiar el estado.')
    } finally {
      setStatusBusy(false)
    }
  }

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedId || !draft.trim() || sendBusy) return
    setSendBusy(true)
    setSendError('')
    const body = draft.trim()
    try {
      const message = await sendHumanMessage(selectedId, body, crypto.randomUUID())
      setDetail((current) => (current ? { ...current, messages: [...current.messages, message] } : current))
      setDraft('')
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'No se pudo enviar el mensaje.')
    } finally {
      setSendBusy(false)
    }
  }

  const handleSendChecklist = async () => {
    if (checklistSending) return // evita clics duplicados mientras hay un envío en curso
    if (!checklistInfo?.available || !checklistInfo.checklistUrl || !checklistInfo.targetConversationId) return
    setChecklistSending(true)
    setChecklistError('')
    try {
      const message = await sendHumanMessage(
        checklistInfo.targetConversationId,
        buildChecklistMessage(checklistInfo.checklistUrl),
        crypto.randomUUID(),
      )
      if (checklistInfo.targetConversationId === selectedId) {
        setDetail((current) => (current ? { ...current, messages: [...current.messages, message] } : current))
      }
      setChecklistModalOpen(false)
    } catch (error) {
      setChecklistError(error instanceof Error ? error.message : 'No se pudo enviar el checklist.')
    } finally {
      setChecklistSending(false)
    }
  }

  const handleSendReopenTemplate = async () => {
    if (!selectedId || templateSending) return // evita clics duplicados
    const name = selectedSummary ? contactName(selectedSummary) : 'cliente'
    setTemplateSending(true)
    setTemplateError('')
    try {
      const message = await sendTemplateMessage(
        selectedId,
        REOPEN_WINDOW_TEMPLATE_SID,
        buildReopenTemplateVariables(name),
        crypto.randomUUID(),
      )
      setDetail((current) => (current ? { ...current, messages: [...current.messages, message] } : current))
    } catch (error) {
      setTemplateError(error instanceof Error ? error.message : 'No se pudo enviar la plantilla.')
    } finally {
      setTemplateSending(false)
    }
  }

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = { '': conversations.length }
    for (const c of conversations) counts[c.status] = (counts[c.status] ?? 0) + 1
    return counts
  }, [conversations])

  const filteredConversations = useMemo(
    () => (status ? conversations.filter((c) => c.status === status) : conversations),
    [conversations, status],
  )

  const selectedSummary = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  )

  const attachments = useMemo(
    () => (detail?.messages ?? []).filter((m) => m.media_url),
    [detail],
  )

  const renderEditableField = (
    field: 'full_name' | 'company' | 'email' | 'customer_code',
    label: string,
    value: string | null | undefined,
    placeholder: string,
  ) => {
    const isEditing = editingField === field
    return (
      <div className="cd-info-field">
        <span className="cd-info-field-label">{label}</span>
        {isEditing ? (
          <div className="cd-info-field-edit">
            <input
              autoFocus
              type={field === 'email' ? 'email' : 'text'}
              value={editDraft}
              disabled={savingField}
              onChange={(event) => setEditDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void saveEdit()
                if (event.key === 'Escape') cancelEdit()
              }}
            />
            <button type="button" className="cd-info-field-btn" disabled={savingField} onClick={() => void saveEdit()}>
              {savingField ? '…' : '✓'}
            </button>
            <button type="button" className="cd-info-field-btn" disabled={savingField} onClick={cancelEdit}>✕</button>
          </div>
        ) : (
          <span
            className={`cd-info-field-value editable ${value ? '' : 'empty'}`}
            onClick={() => startEdit(field, value ?? '')}
            title="Clic para editar"
          >
            {value || placeholder}
          </span>
        )}
        {isEditing && fieldError && <small className="cd-info-field-error">⚠️ {fieldError}</small>}
      </div>
    )
  }

  return (
    <div className="conv-dark">
      {/* Rail de navegación principal */}
      <aside className="cd-rail">
        <div className="cd-rail-logo">A</div>
        <button className="cd-rail-btn active" type="button" title="Conversaciones">💬</button>
        <div className="cd-rail-spacer" />
        <Link className="cd-rail-btn" to="/admin" title="Volver al panel">🏠</Link>
        <button className="cd-rail-btn" type="button" title="Cerrar sesión" onClick={() => { void logout() }}>⏻</button>
      </aside>

      {/* Columna de carpetas / estado */}
      <aside className="cd-folders">
        <span className="cd-folders-title">Buzón</span>
        <div className="cd-folder-group">
          <span className="cd-folder-group-label">Bandeja</span>
          {STATUS_FOLDERS.map((folder) => (
            <button
              key={folder.value || 'all'}
              type="button"
              className={`cd-folder ${status === folder.value ? 'active' : ''}`}
              onClick={() => setStatus(folder.value)}
            >
              <span className="cd-folder-icon">{folder.icon}</span>
              <span className="cd-folder-label">{folder.label}</span>
              <span className="cd-folder-count">{folderCounts[folder.value] ?? 0}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Lista de chats */}
      <section className="cd-list">
        <header className="cd-list-head">
          <span className="cd-list-head-title">Chats</span>
          <span className="cd-list-head-icons">
            <span title="Buscar">🔍</span>
          </span>
        </header>
        <div className="cd-list-search">
          <input
            type="search"
            placeholder="Buscar por nombre o teléfono…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="cd-list-scroll">
          {listError && <p className="notice bad" style={{ margin: 12 }}>⚠️ {listError}</p>}
          {!listError && listLoading && conversations.length === 0 && (
            <p className="muted" style={{ margin: 12 }}>Cargando conversaciones…</p>
          )}
          {!listError && !listLoading && filteredConversations.length === 0 && (
            <p className="muted" style={{ margin: 12 }}>No hay conversaciones para este filtro.</p>
          )}

          <ul className="cd-chat-list">
            {filteredConversations.map((conversation) => {
              const name = contactName(conversation)
              const preview = conversation.last_message_body?.trim() || 'Sin mensajes todavía'
              const previewPrefix =
                conversation.last_message_direction === 'outbound'
                  ? `${SENT_BY_LABEL[conversation.last_message_sent_by ?? 'bot']}: `
                  : ''
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    className={`cd-chat-item ${selectedId === conversation.id ? 'active' : ''}`}
                    onClick={() => setSelectedId(conversation.id)}
                  >
                    <span className="cd-chat-avatar-wrap">
                      <span className="cd-chat-avatar">{initialsOf(name)}</span>
                      <span className={`cd-chat-dot ${conversation.status}`} />
                    </span>
                    <span className="cd-chat-body">
                      <span className="cd-chat-top">
                        <span className="cd-chat-name">{name}</span>
                        <span className="cd-chat-time">{relativeTime(conversation.last_message_at ?? conversation.started_at)}</span>
                      </span>
                      <span className="cd-chat-preview">{previewPrefix}{preview}</span>
                      <span className="cd-chat-bottom">
                        <span className={`cd-tag ${conversation.status}`}>{STATUS_LABEL[conversation.status]}</span>
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      {/* Hilo de la conversación */}
      <section className="cd-thread">
        {!selectedSummary && (
          <div className="cd-thread-empty">
            <div className="cd-thread-empty-inner">
              <span className="cd-thread-empty-icon">💬</span>
              <p>Selecciona una conversación para ver el historial.</p>
            </div>
          </div>
        )}

        {selectedSummary && (
          <>
            <header className="cd-thread-head">
              <div className="cd-thread-head-left">
                <span className="cd-thread-avatar">{initialsOf(contactName(selectedSummary))}</span>
                <div className="cd-thread-title">
                  <b>{contactName(selectedSummary)}</b>
                  <span className="cd-thread-breadcrumb">
                    {detail?.contact?.phone ?? selectedSummary.phone}
                    {detail?.contact?.company ? ` · ${detail.contact.company}` : ''}
                    <span className={`cd-tag ${selectedSummary.status}`}>{STATUS_LABEL[selectedSummary.status]}</span>
                  </span>
                </div>
              </div>
              <div className="cd-thread-head-right">
                <button
                  className="btn ghost checklist-send-btn"
                  type="button"
                  disabled={checklistLoading || !checklistInfo?.available}
                  title={checklistLoading
                    ? 'Verificando checklist…'
                    : checklistInfo?.available
                      ? 'Enviar el checklist de instalación por WhatsApp'
                      : checklistInfo?.reason || 'Checklist no disponible para esta conversación'}
                  onClick={() => setChecklistModalOpen(true)}
                >
                  📋 Enviar checklist
                </button>
                <button className="btn-icon" type="button" title="Buscar en la conversación">🔍</button>
                <button className="btn-icon" type="button" title="Historial">🕑</button>
                <button className="btn-logout" type="button" onClick={() => { void logout() }}>
                  ⏻ Cerrar sesión
                </button>
              </div>
            </header>

            {replyStatus?.enabled && selectedSummary.status !== 'closed' && (
              <div className="cd-status-bar">
                <span className={`cd-tag ${selectedSummary.status}`}>{STATUS_LABEL[selectedSummary.status]}</span>
                <div className="cd-status-actions">
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={statusBusy}
                    onClick={() => handleChangeStatus(selectedSummary.status === 'human' ? 'open' : 'human')}
                  >
                    {selectedSummary.status === 'human' ? 'Liberar' : 'Tomar conversación'}
                  </button>
                  <button className="btn ghost" type="button" disabled={statusBusy} onClick={() => handleChangeStatus('closed')}>
                    Cerrar
                  </button>
                </div>
              </div>
            )}
            {statusError && <p className="notice bad" style={{ margin: 12 }}>⚠️ {statusError}</p>}

            {detailError && <p className="notice bad" style={{ margin: 12 }}>⚠️ {detailError}</p>}
            {!detailError && detailLoading && !detail && <p className="muted" style={{ margin: 12 }}>Cargando historial…</p>}

            <div className="cd-thread-scroll" ref={threadRef}>
              {detail?.messages.map((message) => (
                <div
                  key={message.id}
                  className={`cd-bubble ${message.direction === 'inbound' ? 'in' : 'out'} sent-${message.sent_by}`}
                  title={fullTimestamp(message.created_at)}
                >
                  {message.direction === 'outbound' && (
                    <span className="cd-bubble-sender">{SENT_BY_LABEL[message.sent_by] ?? message.sent_by}</span>
                  )}
                  <p>{message.body || `(${message.message_type})`}</p>
                  <span className="cd-bubble-time">{relativeTime(message.created_at)}</span>
                </div>
              ))}
            </div>

            <div className="cd-composer">
              <div className="cd-composer-channel">💬 WhatsApp Business · para: {detail?.contact?.phone ?? selectedSummary.phone}</div>
              {sendError && <p className="notice bad">⚠️ {sendError}</p>}
              <p className="cd-reply-hint">
                {selectedSummary.status === 'closed'
                  ? 'Conversación cerrada. Un nuevo mensaje del cliente abrirá otra.'
                  : !replyStatus?.enabled
                    ? 'La intervención humana no está configurada en el servidor.'
                    : !replyStatus.isEligibleNumber
                      ? 'Esta conversación no usa el número habilitado para intervención.'
                      : selectedSummary.status !== 'human'
                        ? 'Toma la conversación para responder. El bot sigue respondiendo mientras tanto.'
                        : !replyStatus.canReply
                          ? 'Ventana de 24 horas cerrada: espera un nuevo mensaje del cliente.'
                          : 'Respuesta por WhatsApp · Solo texto · Ventana de atención de 24 horas'}
              </p>
              {replyStatus?.enabled && replyStatus.isEligibleNumber && selectedSummary.status === 'human' && !replyStatus.canReply && (
                <div className="cd-reopen-template">
                  {templateError && <p className="notice bad">⚠️ {templateError}</p>}
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={templateSending}
                    onClick={() => void handleSendReopenTemplate()}
                    title={previewReopenTemplateMessage(contactName(selectedSummary))}
                  >
                    {templateSending ? 'Enviando…' : '👋 Enviar plantilla de reapertura (Meta)'}
                  </button>
                </div>
              )}
              <form onSubmit={handleSend}>
                <div className="cd-composer-box">
                  <textarea
                    rows={1}
                    maxLength={1600}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    disabled={sendBusy || !replyStatus?.enabled || !replyStatus.isEligibleNumber || selectedSummary.status !== 'human' || !replyStatus.canReply}
                    placeholder="Escribe tu respuesta…"
                  />
                  <button
                    type="submit"
                    className="cd-composer-send enabled"
                    disabled={sendBusy || !draft.trim() || !replyStatus?.enabled || !replyStatus.isEligibleNumber || selectedSummary.status !== 'human' || !replyStatus.canReply}
                  >
                    {sendBusy ? '…' : '➤'}
                  </button>
                </div>
              </form>
            </div>
          </>
        )}
      </section>

      {/* Panel de información de contacto */}
      <aside className="cd-info">
        <div className="cd-info-content">
          {!selectedSummary && (
            <div className="cd-info-empty">
              <span className="cd-info-empty-icon">👤</span>
              <b>Sin selección</b>
              <span>Elige un chat para ver los datos del contacto.</span>
            </div>
          )}

          {selectedSummary && infoTab === 'info' && (
            <>
              <div className="cd-info-head">Información de contacto</div>
              <div className="cd-info-avatar-row">
                <span className="cd-info-avatar">{initialsOf(contactName(selectedSummary))}</span>
                <div>
                  <b>{contactName(selectedSummary)}</b>
                  <small>{detail?.contact?.id ?? selectedSummary.contact_id}</small>
                </div>
              </div>

              <div className="cd-info-field">
                <span className="cd-info-field-label">Número de teléfono</span>
                <span className="cd-info-field-value">{detail?.contact?.phone ?? selectedSummary.phone}</span>
              </div>
              {renderEditableField('company', 'Empresa', detail?.contact?.company, 'Añadir empresa')}
              {renderEditableField('email', 'Correo', detail?.contact?.email, 'Añadir correo')}
              {renderEditableField('customer_code', 'Código de cliente', detail?.contact?.customer_code, 'Sin asignar')}
              <div className="cd-info-field">
                <span className="cd-info-field-label">Origen</span>
                <span className="cd-info-field-value">{detail?.contact?.source ?? '—'}</span>
              </div>
              <div className="cd-info-field">
                <span className="cd-info-field-label">Canal</span>
                <span className="cd-info-field-value">{selectedSummary.channel}</span>
              </div>
              <div className="cd-info-field">
                <span className="cd-info-field-label">Estado</span>
                <span className={`cd-tag ${selectedSummary.status}`}>{STATUS_LABEL[selectedSummary.status]}</span>
              </div>
              <div className="cd-info-field">
                <span className="cd-info-field-label">Mensajes</span>
                <span className="cd-info-field-value">{selectedSummary.message_count}</span>
              </div>
            </>
          )}

          {selectedSummary && infoTab === 'adjuntos' && (
            <>
              <div className="cd-info-head">Adjuntos</div>
              {attachments.length === 0 && (
                <div className="cd-info-empty">
                  <span className="cd-info-empty-icon">📎</span>
                  <b>Aún no hay archivos adjuntos</b>
                  <span>Los archivos compartidos en esta conversación aparecerán aquí.</span>
                </div>
              )}
              {attachments.map((m) => (
                <div className="cd-activity-item" key={m.id}>
                  <div className="cd-activity-item-title">📎 {m.message_type}</div>
                  <div className="cd-activity-item-desc">
                    <a href={m.media_url ?? '#'} target="_blank" rel="noreferrer" style={{ color: 'var(--cd-accent)' }}>
                      {m.media_url}
                    </a>
                  </div>
                  <div className="cd-activity-item-time">{fullTimestamp(m.created_at)}</div>
                </div>
              ))}
            </>
          )}

          {selectedSummary && infoTab === 'actividades' && (
            <>
              <div className="cd-info-head">Actividades</div>
              <div className="cd-activity-item">
                <div className="cd-activity-item-title">💬 Conversación iniciada</div>
                <div className="cd-activity-item-desc">Canal: {selectedSummary.channel}</div>
                <div className="cd-activity-item-time">{fullTimestamp(selectedSummary.started_at)}</div>
              </div>
              {selectedSummary.assigned_to && (
                <div className="cd-activity-item">
                  <div className="cd-activity-item-title">👤 Asignado</div>
                  <div className="cd-activity-item-desc">Asignado a {selectedSummary.assigned_to}</div>
                </div>
              )}
              {selectedSummary.last_message_at && (
                <div className="cd-activity-item">
                  <div className="cd-activity-item-title">🕑 Último mensaje</div>
                  <div className="cd-activity-item-time">{fullTimestamp(selectedSummary.last_message_at)}</div>
                </div>
              )}
              {selectedSummary.closed_at && (
                <div className="cd-activity-item">
                  <div className="cd-activity-item-title">✅ Conversación cerrada</div>
                  <div className="cd-activity-item-time">{fullTimestamp(selectedSummary.closed_at)}</div>
                </div>
              )}
            </>
          )}
        </div>

        {selectedSummary && (
          <div className="cd-info-rail">
            <button
              className={`cd-info-tab ${infoTab === 'info' ? 'active' : ''}`}
              type="button"
              title="Información de contacto"
              onClick={() => setInfoTab('info')}
            >
              👤
            </button>
            <button
              className={`cd-info-tab ${infoTab === 'adjuntos' ? 'active' : ''}`}
              type="button"
              title="Adjuntos"
              onClick={() => setInfoTab('adjuntos')}
            >
              📎
            </button>
            <button
              className={`cd-info-tab ${infoTab === 'actividades' ? 'active' : ''}`}
              type="button"
              title="Actividades"
              onClick={() => setInfoTab('actividades')}
            >
              🕑
            </button>
          </div>
        )}
      </aside>

      {checklistModalOpen && checklistInfo?.available && checklistInfo.checklistUrl && (
        <div className="checklist-modal-overlay" role="dialog" aria-modal="true">
          <div className="checklist-modal">
            <h3>Enviar checklist de instalación</h3>
            <p className="checklist-modal-sub">
              Se enviará por WhatsApp al responsable confirmado
              {checklistInfo.targetConversationId !== selectedId ? ' (contacto alternativo, en otra conversación)' : ''}.
            </p>
            <pre className="checklist-modal-preview">{buildChecklistMessage(checklistInfo.checklistUrl)}</pre>
            {checklistReplyStatus && checklistReplyStatus.enabled && !checklistReplyStatus.canReply && (
              <p className="notice bad">
                ⚠️ Fuera de la ventana de 24 horas de WhatsApp. El backend aún no soporta plantillas
                (ContentSid/ContentVariables) para este caso; el envío de texto libre será rechazado.
              </p>
            )}
            {checklistError && <p className="notice bad">⚠️ {checklistError}</p>}
            <div className="checklist-modal-actions">
              <button
                type="button"
                className="btn ghost"
                disabled={checklistSending}
                onClick={() => setChecklistModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn ghost checklist-send-btn"
                disabled={checklistSending}
                onClick={() => void handleSendChecklist()}
              >
                {checklistSending ? 'Enviando…' : 'Enviar por WhatsApp'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
