import { Fragment, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import logo from '../assets/logo_ar.png'
import { lineById } from '../data/catalog'
import { compressImage, findOrderById, fmtSlot, getVars, statusOf, updateOrder, useOrder, visibleQuestions, type Order, type Phase } from '../data/store'

type View = 'home' | 'questions' | 'summary' | 'schedule'
type AppointmentKind = 'delivery' | 'installation'

function Shell({ children, progress }: { children: React.ReactNode; progress?: number }) {
  return (
    <div className="client">
      <header className="brand">
        <img className="logo" src={logo} alt="Asia Robótica" />
        <span>Asia Robótica · Preparación de instalación</span>
      </header>
      {progress !== undefined && <div className="bar"><i style={{ width: `${progress * 100}%` }} /></div>}
      <main className="card">{children}</main>
      <footer className="foot">¿Dudas? Escríbenos por WhatsApp y con gusto te ayudamos.</footer>
    </div>
  )
}

export default function ClientPage() {
  const { token, orderId, conversationId } = useParams()
  const tokenOrder = useOrder(token)
  const idOrder = findOrderById(orderId)
  const order = token ? tokenOrder : idOrder
  const [view, setView] = useState<View>('home')
  const [phase, setPhase] = useState<Phase>('logistics')
  const [appointmentKind, setAppointmentKind] = useState<AppointmentKind>('delivery')
  const [idx, setIdx] = useState(0)
  const validConversation = !conversationId || order?.conversationId === conversationId

  if (!order || !validConversation) {
    return (
      <Shell>
        <div className="notice info"><h2>Enlace no válido</h2><p>Este enlace no existe o expiró. Pide a tu asesor que te envíe uno nuevo.</p></div>
      </Shell>
    )
  }

  const line = lineById(order.line)
  const logisticsStatus = statusOf(order, 'logistics')
  const installationStatus = statusOf(order, 'installation')
  const currentStatus = phase === 'logistics' ? logisticsStatus : installationStatus

  const startPhase = (nextPhase: Phase) => {
    const questions = visibleQuestions(order, nextPhase)
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
        <p>Confirma por separado que el sitio está listo para recibir tu equipo y para instalarlo. Puedes agendar la entrega aunque todavía haya preparativos de instalación pendientes.</p>
        <dl className="facts">
          <dt>Empresa</dt><dd>{order.empresa}</dd>
          <dt>Ciudad</dt><dd>{order.ciudad}</dd>
          {line.entryFields.map((field) => <Fragment key={field.key}><dt>{field.label}</dt><dd>{order.entry[field.key]}</dd></Fragment>)}
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
        <p className="demo-note">Demo local: cambios y citas guardados en este navegador.</p>
      </Shell>
    )
  }

  if (view === 'questions') {
    return (
      <QuestionStep
        order={order}
        phase={phase}
        idx={idx}
        setIdx={setIdx}
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

  const questions = visibleQuestions(order, phase)
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
          <button className="btn primary" onClick={() => schedule(phase === 'logistics' ? 'delivery' : 'installation')}>
            Agendar {phase === 'logistics' ? 'entrega' : 'instalación'}
          </button>
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

function PhaseCard({ title, description, status, appointment, onChecklist, onSchedule }: {
  title: string
  description: string
  status: ReturnType<typeof statusOf>
  appointment: Order['appointments']['delivery']
  onChecklist: () => void
  onSchedule: () => void
}) {
  const label = { incomplete: 'En proceso', ready: 'Listo', issues: 'Con pendientes', blocked: 'Bloqueado' }[status.state]
  const canSchedule = status.state === 'ready' || status.state === 'issues'
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
        <button className="btn primary" disabled={!canSchedule} onClick={onSchedule}>
          {appointment.status === 'confirmed' ? 'Cambiar cita' : `Agendar ${title.startsWith('1.') ? 'entrega' : 'instalación'}`}
        </button>
      </div>
    </section>
  )
}

function QuestionStep({ order, phase, idx, setIdx, done, back }: {
  order: Order
  phase: Phase
  idx: number
  setIdx: (n: number) => void
  done: () => void
  back: () => void
}) {
  const questions = visibleQuestions(order, phase)
  const question = questions[idx]
  const vars = getVars(order)
  const answer = order.answers[question.id]
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')

  const setAnswer = (value: string) =>
    updateOrder(order.token, (current) => ({ ...current, answers: { ...current.answers, [question.id]: { ...current.answers[question.id], ans: value } } }))

  const onFile = async (file?: File) => {
    if (!file) return
    setBusy(true)
    setPhotoError('')
    try {
      const photo = await compressImage(file)
      updateOrder(order.token, (current) => ({ ...current, answers: { ...current.answers, [question.id]: { ...current.answers[question.id], ans: current.answers[question.id]?.ans ?? '', photo } } }))
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'No se pudo procesar la imagen.')
    } finally {
      setBusy(false)
    }
  }

  const needsPhoto = question.photo === 'required' && answer?.ans !== 'no' && !answer?.photo
  const canContinue = !!answer?.ans && !needsPhoto && !busy
  const responseType = question.responseType ?? 'yes-no'
  const responseOptions = question.options ?? []

  return (
    <Shell progress={(idx + 1) / questions.length}>
      <p className="eyebrow">{phase === 'logistics' ? 'Logística y maniobras' : 'Instalación y capacitación'} · Pregunta {idx + 1} de {questions.length}</p>
      <h1>{question.title}</h1>
      <p className="qtext">{question.text(vars, order.entry)}</p>
      {question.bullets && <ul className="bullets">{question.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}
      {question.why && <p className="why">💡 {question.why}</p>}

      {responseType === 'yes-no' ? (
        <div className="choices">
          <button className={`choice yes ${answer?.ans === 'si' ? 'sel' : ''}`} onClick={() => setAnswer('si')}>Sí, ya lo tengo</button>
          <button className={`choice no ${answer?.ans === 'no' ? 'sel' : ''}`} onClick={() => setAnswer('no')}>Todavía no</button>
        </div>
      ) : responseType === 'choice' ? (
        <div className="choices response-options">
          {responseOptions.map((option) => (
            <button key={option} className={`choice ${answer?.ans === option ? 'sel' : ''}`} onClick={() => setAnswer(option)}>{option}</button>
          ))}
        </div>
      ) : (
        <label className="response-field">
          {responseType === 'number' ? 'Respuesta numérica' : 'Respuesta'}
          <input type={responseType === 'number' ? 'number' : 'text'} value={answer?.ans ?? ''} onChange={(event) => setAnswer(event.target.value)} />
        </label>
      )}

      {answer?.ans === 'no' && (
        <div className={`notice ${question.critical ? 'bad' : 'warn'}`}>
          {question.critical ? 'Este punto es necesario para esta fase. Puedes agendar entrega si la logística está lista, aunque la instalación tenga pendientes.' : 'Lo anotamos como pendiente para dar seguimiento.'}
        </div>
      )}

      {question.photo && answer?.ans && answer.ans !== 'no' && (
        <div className="photo">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => onFile(event.target.files?.[0])} />
          {answer.photo && <img src={answer.photo} alt="Evidencia" />}
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>
            📷 {answer.photo ? 'Cambiar foto' : question.photo === 'required' ? 'Tomar o subir foto (obligatoria)' : 'Agregar foto (opcional)'}
          </button>
          {needsPhoto && <small>Necesitamos la foto para validar este punto.</small>}
          {photoError && <small role="alert">{photoError}</small>}
        </div>
      )}

      <div className="nav">
        <button className="btn ghost" onClick={() => (idx === 0 ? back() : setIdx(idx - 1))}>← Atrás</button>
        <button className="btn primary" disabled={!canContinue} onClick={() => (idx === questions.length - 1 ? done() : setIdx(idx + 1))}>
          {idx === questions.length - 1 ? 'Ver resumen' : 'Siguiente →'}
        </button>
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
