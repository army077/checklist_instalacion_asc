import { Fragment, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import logo from '../assets/ar_logo.png'
import { lineById, type Question } from '../data/catalog'
import { boletinToOrder, fetchBoletinEmitido } from '../data/api19'
import { compressImage, fmtSlot, getVars, updateOrder, upsertApiOrders, useOrder, useSheetSourceStatus, visibleQuestions, type Order, type Phase } from '../data/store'

const API_TOKEN_PREFIX = 'api19-'

type View = 'home' | 'questions' | 'summary' | 'schedule'
type AppointmentKind = 'delivery' | 'installation'
type ChecklistStatus = {
  total: number
  answered: number
  unanswered: Question[]
  pending: Question[]
  criticalPending: Question[]
  state: 'incomplete' | 'ready' | 'issues' | 'blocked'
}

const isClientFacingQuestion = (question: Question) => question.checklistMeta?.clientFacing !== false
const isSheetQuestion = (question: Question) => question.id.startsWith('gs-')
const statusFromQuestions = (order: Order, questions: Question[]): ChecklistStatus => {
  const answered = questions.filter((question) => !!order.answers[question.id]?.ans).length
  const unanswered = questions.filter((question) => !order.answers[question.id]?.ans)
  const pending = questions.filter((question) => {
    const type = question.responseType ?? 'yes-no'
    const answer = order.answers[question.id]?.ans.trim().toLocaleLowerCase('es-MX')
    return (type === 'yes-no' || type === 'choice') && (answer === 'no' || answer === 'todavía no')
  })
  const criticalPending = pending.filter((question) => question.critical)
  const state = unanswered.length ? 'incomplete' : criticalPending.length ? 'blocked' : pending.length ? 'issues' : 'ready'
  return { total: questions.length, answered, unanswered, pending, criticalPending, state }
}

function Shell({ children, progress }: { children: React.ReactNode; progress?: number }) {
  return (
    <div className="client">
      <header className="brand">
        <img className="logo" src={logo} alt="Asia Robótica" />
        <span>Preparación de entrega e instalación</span>
      </header>
      {progress !== undefined && <div className="bar"><i style={{ width: `${progress * 100}%` }} /></div>}
      <main className="card">{children}</main>
      <footer className="foot">¿Dudas? Escríbenos por WhatsApp y con gusto te ayudamos.</footer>
    </div>
  )
}

export default function ClientPage() {
  const { token, orderId, conversationId } = useParams()
  const boletinId = orderId ?? (token?.startsWith(API_TOKEN_PREFIX) ? token.slice(API_TOKEN_PREFIX.length) : undefined)
  const order = useOrder(boletinId ? `${API_TOKEN_PREFIX}${boletinId}` : undefined)
  const sheetSource = useSheetSourceStatus()
  const [load, setLoad] = useState<{ id?: string; error?: string }>({})
  const [view, setView] = useState<View>('home')
  const [phase, setPhase] = useState<Phase>('logistics')
  const [appointmentKind, setAppointmentKind] = useState<AppointmentKind>('delivery')
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (!boletinId) return
    let cancelled = false
    fetchBoletinEmitido(boletinId)
      .then((boletin) => {
        if (cancelled) return
        upsertApiOrders([boletinToOrder(boletin)])
        setLoad({ id: boletinId })
      })
      .catch((error) => {
        if (!cancelled) setLoad({ id: boletinId, error: error instanceof Error ? error.message : 'No se pudo consultar el pedido.' })
      })
    return () => { cancelled = true }
  }, [boletinId])

  if (boletinId && load.id !== boletinId) {
    return (
      <Shell>
        <p>Cargando información de tu pedido…</p>
      </Shell>
    )
  }

  const validConversation = !conversationId || order?.conversationId === conversationId

  if (!order || !validConversation) {
    return (
      <Shell>
        <div className="notice info">
          <h2>Enlace no válido</h2>
          <p>{load.error ? `No pudimos consultar tu pedido (${load.error}).` : 'Este enlace no existe o expiró.'} Pide a tu asesor que te envíe uno nuevo.</p>
        </div>
      </Shell>
    )
  }

  const line = lineById(order.line)
  const allLogisticsQuestions = visibleQuestions(order, 'logistics')
  const allInstallationQuestions = visibleQuestions(order, 'installation')
  const questionsForClient = (questions: Question[]) => {
    const scoped = sheetSource.state === 'ready' ? questions.filter(isSheetQuestion) : questions
    const clientFacing = scoped.filter(isClientFacingQuestion)
    if (clientFacing.length > 0) return clientFacing
    if (scoped.length > 0) return scoped
    return questions
  }
  const logisticsQuestions = questionsForClient(allLogisticsQuestions)
  const installationQuestions = questionsForClient(allInstallationQuestions)
  const logisticsStatus = statusFromQuestions(order, logisticsQuestions)
  const installationStatus = statusFromQuestions(order, installationQuestions)
  const currentStatus = phase === 'logistics' ? logisticsStatus : installationStatus

  const startPhase = (nextPhase: Phase) => {
    const questions = nextPhase === 'logistics' ? logisticsQuestions : installationQuestions
    const firstUnanswered = questions.findIndex((question) => !order.answers[question.id]?.ans)
    setPhase(nextPhase)
    setIdx(firstUnanswered < 0 ? Math.max(0, questions.length - 1) : firstUnanswered)
    setView(firstUnanswered < 0 ? 'summary' : 'questions')
  }

  const schedule = (kind: AppointmentKind) => {
    setAppointmentKind(kind)
    setView('schedule')
  }

  if (view === 'home') {
    return (
      <Shell>
        <p className="eyebrow">{line.icon} {line.name} · {order.folio}</p>
        <h1>¡Hola, {order.cliente.split(' ')[0]}!</h1>
        {sheetSource.state === 'error' && <div className="notice warn">Estamos usando las preguntas base porque no pudimos sincronizar Google Sheets.</div>}
        <p>Confirma por separado que el sitio está listo para recibir tu equipo y para instalarlo. Puedes agendar la entrega aunque todavía haya preparativos de instalación pendientes.</p>
        <dl className="facts">
          <dt>Empresa</dt><dd>{order.empresa}</dd>
          <dt>Ciudad</dt><dd>{order.ciudad}</dd>
          <dt>Equipo</dt><dd>{order.entry.modelo}</dd>
          {line.entryFields.filter((field) => order.entry[field.key]).map((field) => <Fragment key={field.key}><dt>{field.label}</dt><dd>{order.entry[field.key]}</dd></Fragment>)}
          {order.entry.accesorios && <><dt>Accesorios</dt><dd>{order.entry.accesorios}</dd></>}
        </dl>
        <PhaseCard
          title="1. Logística y maniobras"
          description="Acceso, espacio, descarga y recepción."
          status={logisticsStatus}
          appointment={order.appointments.delivery}
          onChecklist={() => startPhase('logistics')}
          onSchedule={() => schedule('delivery')}
        />
        <PhaseCard
          title="2. Instalación y capacitación"
          description="Servicios, condiciones técnicas e insumos para capacitación."
          status={installationStatus}
          appointment={order.appointments.installation}
          onChecklist={() => startPhase('installation')}
          onSchedule={() => schedule('installation')}
        />
        {/* <p className="demo-note">Demo local: cambios y citas guardados en este navegador.</p> */}
      </Shell>
    )
  }

  if (view === 'questions') {
    return (
      <ChecklistStep
        order={order}
        phase={phase}
        questions={phase === 'logistics' ? logisticsQuestions : installationQuestions}
        idx={idx}
        back={() => setView('home')}
        done={() => setView('summary')}
      />
    )
  }

  if (view === 'schedule') {
    return (
      <Schedule
        order={order}
        kind={appointmentKind}
        back={() => setView('home')}
        onSaved={() => setView('home')}
      />
    )
  }

  const questions = phase === 'logistics' ? logisticsQuestions : installationQuestions
  return (
    <Shell progress={1}>
      <p className="eyebrow">{phase === 'logistics' ? 'Logística y maniobras' : 'Instalación y capacitación'}</p>
      <h1>Resumen</h1>
      <ul className="summary">
        {questions.map((question, i) => {
          const answer = order.answers[question.id]
          return (
            <li key={question.id} className={answer?.ans === 'no' ? 'no' : answer ? 'ok' : 'no'}>
              <span className="dot">{answer?.ans === 'no' ? '!' : answer ? '✓' : '·'}</span>
              <span>{question.title}: {answer?.ans || 'Sin responder'}</span>
              <button className="link" onClick={() => { setIdx(i); setView('questions') }}>Editar</button>
            </li>
          )
        })}
      </ul>
      {currentStatus.state === 'ready' || currentStatus.state === 'issues' ? (
        <>
          <div className={`notice ${currentStatus.state === 'ready' ? 'good' : 'warn'}`}>
            {currentStatus.state === 'ready'
              ? 'Esta fase está lista.'
              : `Hay ${currentStatus.pending.length} punto(s) pendiente(s) no crítico(s). La cita puede solicitarse y el equipo dará seguimiento.`}
          </div>
          {/* <button className="btn primary" onClick={() => schedule(phase === 'logistics' ? 'delivery' : 'installation')}>
            Agendar {phase === 'logistics' ? 'entrega' : 'instalación'}
          </button> */}
        </>
      ) : (
        <div className="notice bad">
          <b>Aún no es posible agendar esta fase.</b>
          {currentStatus.unanswered.length > 0 && <> Preguntas sin responder: {currentStatus.unanswered.map((question) => question.title).join(', ')}.</>}
          {currentStatus.criticalPending.length > 0 && <> Pendientes críticos: {currentStatus.criticalPending.map((question) => question.title).join(', ')}.</>}
          {' '}Responde las preguntas pendientes y resuelve los puntos críticos.
          La disponibilidad para entrega y para instalación se evalúa de forma independiente.
        </div>
      )}
      <button className="btn ghost full-width" onClick={() => setView('home')}>Volver a mis fases</button>
    </Shell>
  )
}

function PhaseCard({ title, description, status, appointment, onChecklist, onSchedule: _onSchedule }: {
  title: string
  description: string
  status: ChecklistStatus
  appointment: Order['appointments']['delivery']
  onChecklist: () => void
  onSchedule: () => void
}) {
  const label = { incomplete: 'En proceso', ready: 'Listo', issues: 'Con pendientes', blocked: 'Bloqueado' }[status.state]
  const date = appointment.status === 'confirmed' && appointment.slot ? fmtSlot(appointment.slot) : undefined
  return (
    <section className="phase-card">
      <div className="phase-heading">
        <h2>{title}</h2>
        <span className={`pill ${status.state}`}>{label}</span>
      </div>
      <p>{description} · {status.answered}/{status.total} preguntas respondidas.</p>
      {date && <p className="notice good">Cita confirmada: {date.day}, {date.time} h.</p>}
      {appointment.status === 'proposed' && <p className="notice warn">Propuesta enviada: {appointment.proposedDate}. {appointment.note}</p>}
      <div className="phase-actions">
        <button className="btn ghost" onClick={onChecklist}>Revisar requisitos</button>
        {/* <button className="btn primary" disabled={!canSchedule} onClick={onSchedule}>
          {appointment.status === 'confirmed' ? 'Cambiar cita' : `Agendar ${title.startsWith('1.') ? 'entrega' : 'instalación'}`}
        </button> */}
      </div>
    </section>
  )
}

function ChecklistStep({ order, phase, questions, idx, done, back }: {
  order: Order
  phase: Phase
  questions: Question[]
  idx: number
  done: () => void
  back: () => void
}) {
  const vars = getVars(order)
  const [busyById, setBusyById] = useState<Record<string, boolean>>({})
  const [photoErrorById, setPhotoErrorById] = useState<Record<string, string>>({})
  const answered = questions.filter((question) => !!order.answers[question.id]?.ans).length

  useEffect(() => {
    const targetId = questions[idx]?.id
    if (!targetId) return
    const target = document.getElementById(`check-${targetId}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [idx, questions])

  const setAnswer = (questionId: string, value: string) =>
    updateOrder(order.token, (current) => ({ ...current, answers: { ...current.answers, [questionId]: { ...current.answers[questionId], ans: value } } }))

  const onFile = async (questionId: string, file?: File) => {
    if (!file) return
    setBusyById((current) => ({ ...current, [questionId]: true }))
    setPhotoErrorById((current) => ({ ...current, [questionId]: '' }))
    try {
      const photo = await compressImage(file)
      updateOrder(order.token, (current) => ({ ...current, answers: { ...current.answers, [questionId]: { ...current.answers[questionId], ans: current.answers[questionId]?.ans ?? '', photo } } }))
    } catch (error) {
      setPhotoErrorById((current) => ({ ...current, [questionId]: error instanceof Error ? error.message : 'No se pudo procesar la imagen.' }))
    } finally {
      setBusyById((current) => ({ ...current, [questionId]: false }))
    }
  }

  const canContinue = questions.every((question) => {
    const answer = order.answers[question.id]
    const needsPhoto = question.photo === 'required' && answer?.ans !== 'no' && !answer?.photo
    const busy = !!busyById[question.id]
    return !!answer?.ans && !needsPhoto && !busy
  })
  const pendingCount = questions.filter((question) => {
    const answer = order.answers[question.id]
    const needsPhoto = question.photo === 'required' && answer?.ans !== 'no' && !answer?.photo
    return !answer?.ans || needsPhoto
  }).length

  return (
    <Shell progress={questions.length ? answered / questions.length : 0}>
      <p className="eyebrow">{phase === 'logistics' ? 'Logística y maniobras' : 'Instalación y capacitación'} · Checklist</p>
      <h1>Checklist de preparación</h1>
      <p>Marca cada punto según tu avance. Este checklist corresponde a la tabla de Google Sheets.</p>
      <div className="notice info">Avance: {answered}/{questions.length} puntos respondidos.</div>

      <ul className="checklist">
        {questions.map((question, index) => {
          const answer = order.answers[question.id]
          const responseType = question.responseType ?? 'yes-no'
          const responseOptions = question.options ?? []
          const needsPhoto = question.photo === 'required' && answer?.ans !== 'no' && !answer?.photo
          const busy = !!busyById[question.id]
          const meta = question.checklistMeta

          return (
            <li key={question.id} id={`check-${question.id}`} className={`check-item ${answer?.ans ? 'answered' : 'pending'}`}>
              <p className="eyebrow">Punto {index + 1}{meta?.gate ? ` · ${meta.gate}` : ''}</p>
              <h2>{question.title}</h2>
              <p className="qtext">{question.text(vars, order.entry)}</p>
              {question.bullets && <ul className="bullets">{question.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
              {question.why && <p className="why">💡 {question.why}</p>}

              {/* {(meta?.capture || meta?.validate || meta?.status || meta?.targetDate) && (
                <dl className="check-meta">
                  {meta.capture && <><dt>Captura</dt><dd>{meta.capture}</dd></>}
                  {meta.validate && <><dt>Valida</dt><dd>{meta.validate}</dd></>}
                  {meta.status && <><dt>Estatus</dt><dd>{meta.status}</dd></>}
                  {meta.targetDate && <><dt>Fecha objetivo</dt><dd>{meta.targetDate}</dd></>}
                </dl>
              )} */}

              {responseType === 'yes-no' ? (
                <div className="choices">
                  <button className={`choice yes ${answer?.ans === 'si' ? 'sel' : ''}`} onClick={() => setAnswer(question.id, 'si')}>Sí, ya lo tengo</button>
                  <button className={`choice no ${answer?.ans === 'no' ? 'sel' : ''}`} onClick={() => setAnswer(question.id, 'no')}>Todavía no</button>
                </div>
              ) : responseType === 'choice' ? (
                <div className="choices response-options">
                  {responseOptions.map((option) => (
                    <button key={option} className={`choice ${answer?.ans === option ? 'sel' : ''}`} onClick={() => setAnswer(question.id, option)}>{option}</button>
                  ))}
                </div>
              ) : (
                <label className="response-field">
                  {responseType === 'number' ? 'Respuesta numérica' : 'Respuesta'}
                  <input type={responseType === 'number' ? 'number' : 'text'} value={answer?.ans ?? ''} onChange={(event) => setAnswer(question.id, event.target.value)} />
                </label>
              )}

              {answer?.ans === 'no' && (
                <div className={`notice ${question.critical ? 'bad' : 'warn'}`}>
                  {question.critical ? 'Este punto es crítico para esta fase.' : 'Lo anotamos como pendiente para dar seguimiento.'}
                  {meta?.noPass && <> Acción si no pasa: {meta.noPass}</>}
                </div>
              )}

              {question.photo && answer?.ans && answer.ans !== 'no' && (
                <div className="photo">
                  {answer.photo && <img src={answer.photo} alt="Evidencia" />}
                  <label className="btn ghost">
                    📷 {answer.photo ? 'Cambiar foto' : question.photo === 'required' ? 'Tomar o subir foto (obligatoria)' : 'Agregar foto (opcional)'}
                    <input type="file" accept="image/*" capture="environment" hidden onChange={(event) => onFile(question.id, event.target.files?.[0])} />
                  </label>
                  {needsPhoto && <small>Necesitamos la foto para validar este punto.</small>}
                  {busy && <small>Procesando imagen…</small>}
                  {photoErrorById[question.id] && <small role="alert">{photoErrorById[question.id]}</small>}
                </div>
              )}

              {/* {(meta?.support || meta?.responsible || meta?.comments) && (
                <p className="muted">
                  {meta.support && <>Sustento: {meta.support}. </>}
                  {meta.responsible && <>Responsable: {meta.responsible}. </>}
                  {meta.comments && <>Comentarios: {meta.comments}.</>}
                </p>
              )} */}
            </li>
          )
        })}
      </ul>

      {pendingCount > 0 && <div className="notice warn">Faltan {pendingCount} punto(s) por completar para cerrar esta fase.</div>}
      <div className="nav">
        <button className="btn ghost" onClick={back}>← Volver</button>
        <button className="btn primary" disabled={!canContinue} onClick={done}>Ver resumen</button>
      </div>
    </Shell>
  )
}

function Schedule({ order, kind, back, onSaved }: { order: Order; kind: AppointmentKind; back: () => void; onSaved: () => void }) {
  const [selected, setSelected] = useState<string>()
  const [other, setOther] = useState(false)
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const isDelivery = kind === 'delivery'
  const title = isDelivery ? 'entrega' : 'instalación'
  const availableSlots = isDelivery ? order.deliverySlots : order.installationSlots

  const saveAppointment = (appointment: Order['appointments']['delivery']) => {
    updateOrder(order.token, (current) => ({
      ...current,
      appointments: { ...current.appointments, [kind]: appointment },
    }))
    onSaved()
  }

  return (
    <Shell progress={1}>
      <p className="eyebrow">Cita independiente · {order.folio}</p>
      <h1>Agenda tu {title}</h1>
      <p>Elige una fecha para la {title} de tu equipo en {order.ciudad}. La cita de entrega no confirma la instalación; cada una se agenda por separado.</p>
      <div className="slots">
        {availableSlots.map((slot) => {
          const formatted = fmtSlot(slot)
          return (
            <button key={slot} className={`slot ${selected === slot && !other ? 'sel' : ''}`} onClick={() => { setSelected(slot); setOther(false) }}>
              <b>{formatted.day}</b><span>{formatted.time} h</span>
            </button>
          )
        })}
        <button className={`slot ${other ? 'sel' : ''}`} onClick={() => setOther(true)}><b>Ninguna me funciona</b><span>Proponer otra fecha</span></button>
      </div>
      {other && (
        <div className="propose">
          <label>Fecha preferida<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label>Comentarios<textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Horario, acceso, contacto en sitio…" /></label>
        </div>
      )}
      <div className="nav">
        <button className="btn ghost" onClick={back}>← Volver a mis fases</button>
        {other ? (
          <button className="btn primary" disabled={!date} onClick={() => saveAppointment({ status: 'proposed', proposedDate: date, note })}>Enviar propuesta</button>
        ) : (
          <button className="btn primary" disabled={!selected} onClick={() => saveAppointment({ status: 'confirmed', slot: selected })}>Confirmar {title}</button>
        )}
      </div>
    </Shell>
  )
}
