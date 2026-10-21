import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getConversationContext,
  listConversations,
  type ConversationDetail,
  type ConversationStatus,
  type ConversationSummary,
} from '../data/api18'

const STATUS_FILTERS: { value: ConversationStatus | ''; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'open', label: 'Bot' },
  { value: 'human', label: 'Humano' },
  { value: 'closed', label: 'Cerradas' },
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

function contactName(c: { full_name: string | null; whatsapp_name: string | null; phone: string }) {
  return c.full_name || c.whatsapp_name || c.phone
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
  const [status, setStatus] = useState<ConversationStatus | ''>('')
  const [search, setSearch] = useState('')
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [listError, setListError] = useState('')
  const [listLoading, setListLoading] = useState(true)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [detailError, setDetailError] = useState('')
  const [detailLoading, setDetailLoading] = useState(false)

  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const rows = await listConversations({ status, search })
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
  }, [status, search])

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

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
  }, [detail])

  const selectedSummary = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  )

  return (
    <div className="admin conv-page">
      <header className="admin-head">
        <div>
          <h1>Conversaciones</h1>
          <small>Lectura en vivo del bot de WhatsApp (API18) · próximamente intervención humana</small>
        </div>
        <Link className="btn ghost" to="/admin">← Volver al panel</Link>
      </header>

      <p className="demo-note">
        Vista de solo lectura conectada a la base de datos de persistencia del bot. Por ahora no permite responder como
        agente humano; esa capacidad se añadirá más adelante.
      </p>

      <div className="conv-layout">
        <aside className="conv-list-pane">
          <div className="conv-filters">
            <input
              className="conv-search"
              type="search"
              placeholder="Buscar por nombre o teléfono…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="conv-status-tabs" role="tablist" aria-label="Filtrar por estado">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.value || 'all'}
                  className={`conv-tab ${status === filter.value ? 'active' : ''}`}
                  onClick={() => setStatus(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {listError && <p className="notice bad">⚠️ {listError}</p>}
          {!listError && listLoading && conversations.length === 0 && <p className="muted">Cargando conversaciones…</p>}
          {!listError && !listLoading && conversations.length === 0 && (
            <p className="muted">No hay conversaciones para este filtro.</p>
          )}

          <ul className="conv-list">
            {conversations.map((conversation) => {
              const name = contactName(conversation)
              const initials = name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase())
                .join('') || '#'
              const preview = conversation.last_message_body?.trim() || 'Sin mensajes todavía'
              const previewPrefix =
                conversation.last_message_direction === 'outbound'
                  ? `${SENT_BY_LABEL[conversation.last_message_sent_by ?? 'bot']}: `
                  : ''
              return (
                <li key={conversation.id}>
                  <button
                    className={`conv-item ${selectedId === conversation.id ? 'active' : ''}`}
                    onClick={() => setSelectedId(conversation.id)}
                  >
                    <span className="conv-avatar">{initials}</span>
                    <span className="conv-item-body">
                      <span className="conv-item-top">
                        <b>{name}</b>
                        <small>{relativeTime(conversation.last_message_at ?? conversation.started_at)}</small>
                      </span>
                      <span className="conv-item-preview">{previewPrefix}{preview}</span>
                      <span className="conv-item-bottom">
                        <span className={`pill conv-status-${conversation.status}`}>{STATUS_LABEL[conversation.status]}</span>
                        <small>{conversation.message_count} mensaje(s)</small>
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        <section className="conv-thread-pane">
          {!selectedSummary && (
            <div className="conv-empty">
              <p>Selecciona una conversación para ver el historial.</p>
            </div>
          )}

          {selectedSummary && (
            <>
              <header className="conv-thread-head">
                <div>
                  <b>{contactName(selectedSummary)}</b>
                  <small>
                    {detail?.contact?.phone ?? selectedSummary.phone}
                    {detail?.contact?.company ? ` · ${detail.contact.company}` : ''}
                  </small>
                </div>
                <span className={`pill conv-status-${selectedSummary.status}`}>{STATUS_LABEL[selectedSummary.status]}</span>
              </header>

              {detailError && <p className="notice bad">⚠️ {detailError}</p>}
              {!detailError && detailLoading && !detail && <p className="muted">Cargando historial…</p>}

              <div className="conv-thread" ref={threadRef}>
                {detail?.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`conv-bubble ${message.direction === 'inbound' ? 'in' : 'out'} sent-${message.sent_by}`}
                    title={fullTimestamp(message.created_at)}
                  >
                    {message.direction === 'outbound' && (
                      <span className="conv-bubble-sender">{SENT_BY_LABEL[message.sent_by] ?? message.sent_by}</span>
                    )}
                    <p>{message.body || `(${message.message_type})`}</p>
                    <span className="conv-bubble-time">{relativeTime(message.created_at)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
