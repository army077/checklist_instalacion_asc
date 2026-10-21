import { Fragment, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import logo from '../assets/logo_ar.png'
import { LINES, lineById } from '../data/catalog'
import { fmtSlot, getVars, resetDemo, saveQuestionConfig, saveRegulator, statusOf, updateOrder, useOrder, useOrders, useQuestionConfigs, visibleQuestions, type Appointment, type Phase, type ResponseType } from '../data/store'

const LABEL = { incomplete: 'En proceso', ready: 'Listo', issues: 'Con pendientes', blocked: 'Bloqueado' } as const

const appointmentSummary = (appointment: { status: string; slot?: string; proposedDate?: string; note?: string }) => {
  if (appointment.status === 'confirmed' && appointment.slot) {
    const formatted = fmtSlot(appointment.slot)
    return `Confirmada: ${formatted.day}, ${formatted.time} h`
  }
  if (appointment.status === 'proposed') return `Propuesta: ${appointment.proposedDate}. ${appointment.note ?? ''}`
  return 'Sin agendar'
}

const phaseSummary = (
  status: ReturnType<typeof statusOf>,
  appointment: Appointment,
) => {
  const preparation = status.state === 'ready'
    ? 'Preparación lista'
    : status.state === 'issues'
      ? `Preparación lista · ${status.pending.length} pendiente(s) no crítico(s)`
      : status.state === 'blocked'
        ? 'Bloqueada · resolver puntos críticos'
        : `En preparación · ${status.unanswered.length} pregunta(s) sin responder`

  if (appointment.status === 'confirmed') {
    return {
      text: `${preparation} · ${appointmentSummary(appointment)}`,
      className: status.state === 'blocked' || status.state === 'incomplete' ? status.state : 'confirmed',
    }
  }
  if (appointment.status === 'proposed') {
    return {
      text: `${preparation} · ${appointmentSummary(appointment)}`,
      className: status.state === 'blocked' ? 'blocked' : 'proposed',
    }
  }
  if (status.state === 'ready' || status.state === 'issues') {
    return { text: `${preparation} · falta agendar`, className: 'needs-booking' }
  }
  return { text: `${preparation} · sin agendar`, className: status.state }
}

const orderColor = (
  logistics: ReturnType<typeof statusOf>,
  installation: ReturnType<typeof statusOf>,
  deliveryAppointment: Appointment,
  installationAppointment: Appointment,
) => {
  const needsBooking = (status: ReturnType<typeof statusOf>, appointment: Appointment) =>
    (status.state === 'ready' || status.state === 'issues') && appointment.status === 'pending'

  if (needsBooking(logistics, deliveryAppointment) || needsBooking(installation, installationAppointment)) return 'needs-booking'
  if (logistics.state === 'blocked' || installation.state === 'blocked') return 'blocked'
  if (deliveryAppointment.status === 'proposed' || installationAppointment.status === 'proposed') return 'proposed'
  if (logistics.state === 'incomplete' || installation.state === 'incomplete') return 'incomplete'
  if (deliveryAppointment.status === 'confirmed' && installationAppointment.status === 'confirmed') return 'complete'
  return 'in-progress'
}

export function AdminList() {
  const orders = useOrders()
  const [copied, setCopied] = useState('')
  const link = (order: (typeof orders)[number]) => `${location.origin}/confirm/${order.orderId}/${order.conversationId}?channel=whatsapp`
  return (
    <div className="admin">
      <header className="admin-head">
        <h1><img className="logo" src={logo} alt="" style={{ verticalAlign: 'middle', marginRight: 10 }} />Panel de instalaciones</h1>
        <div className="header-actions">
          <Link className="btn ghost" to="/admin/conversaciones">Conversaciones</Link>
          <Link className="btn ghost" to="/admin/config">Configurar preguntas</Link>
          <button className="btn ghost" onClick={() => confirm('¿Reiniciar los datos de demo?') && resetDemo()}>Reiniciar demo</button>
        </div>
      </header>
      <div className="table">
        {orders.map((order) => {
          const logistics = statusOf(order, 'logistics')
          const installation = statusOf(order, 'installation')
          const line = lineById(order.line)
          const logisticsSummary = phaseSummary(logistics, order.appointments.delivery)
          const installationSummary = phaseSummary(installation, order.appointments.installation)
          const rowState = orderColor(logistics, installation, order.appointments.delivery, order.appointments.installation)
          return (
            <div className={`row ${rowState}`} key={order.token} title={`Estado del pedido: ${rowState === 'needs-booking' ? 'preparación lista, falta agendar' : rowState === 'complete' ? 'citas confirmadas' : rowState}`}>
              <div className="grow">
                <b>{order.folio} · {order.cliente}</b>
                <small>{line.icon} {line.name} {order.entry.modelo ?? order.entry.potencia} · {order.empresa} · {order.ciudad}</small>
                <small className={`phase-line ${logisticsSummary.className}`}>
                  <b>Logística: {logistics.answered}/{logistics.total}</b> · {logisticsSummary.text}
                </small>
                <small className={`phase-line ${installationSummary.className}`}>
                  <b>Instalación: {installation.answered}/{installation.total}</b> · {installationSummary.text}
                </small>
              </div>
              <a className="btn ghost" href={link(order)} target="_blank" rel="noreferrer">Vista cliente</a>
              <button className="btn ghost" onClick={() => { navigator.clipboard?.writeText(link(order)); setCopied(order.token) }}>{copied === order.token ? '¡Copiado!' : 'Copiar enlace'}</button>
              <a className="btn ghost" href={`https://wa.me/?text=${encodeURIComponent(`Hola ${order.cliente}, agenda la entrega o instalación de tu equipo aquí: ${link(order)}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
              <Link className="btn primary" to={`/admin/${order.token}`}>Detalle</Link>
            </div>
          )
        })}
      </div>
      <p className="demo-note">Enlace de demostración: /confirm/{'{pedido}'}/{'{conversationId}'}?channel=whatsapp. No está conectado al servicio real.</p>
    </div>
  )
}

export function AdminDetail() {
  const { token } = useParams()
  const order = useOrder(token)
  if (!order) return <div className="admin"><Link to="/admin">← Volver</Link><p>Pedido no encontrado.</p></div>
  const line = lineById(order.line)
  const vars = getVars(order)
  const logistics = statusOf(order, 'logistics')
  const installation = statusOf(order, 'installation')
  return (
    <div className="admin">
      <Link to="/admin">← Volver</Link>
      <header className="admin-head">
        <div><h1>{order.folio} · {order.cliente}</h1><small>{order.empresa} · {order.ciudad}</small></div>
        <Link className="btn ghost" to="/admin/config">Editar checklist</Link>
      </header>
      <section className="panel">
        <h3>Equipo</h3>
        <dl className="facts">
          {line.entryFields.map((field) => <Fragment key={field.key}><dt>{field.label}</dt><dd>{order.entry[field.key]}</dd></Fragment>)}
          {Object.entries(vars).map(([key, value]) => <Fragment key={key}><dt>{key}</dt><dd>{value}</dd></Fragment>)}
        </dl>
      </section>
      {(['logistics', 'installation'] as const).map((phase) => {
        const questions = visibleQuestions(order, phase)
        const status = phase === 'logistics' ? logistics : installation
        const title = phase === 'logistics' ? 'Logística y maniobras' : 'Instalación y capacitación'
        return (
          <section className="panel" key={phase}>
            <h3>{title} · {LABEL[status.state]} · {status.answered}/{status.total}</h3>
            {questions.map((question) => {
              const answer = order.answers[question.id]
              return (
                <div key={question.id} className={`ans ${answer?.ans === 'no' ? 'no' : answer ? 'si' : 'none'}`}>
                  <b>{answer ? `${answer.ans === 'no' ? '✗' : '✓'} ${answer.ans}` : '· Sin responder'} · {question.title}{question.critical ? ' (crítico)' : ''}</b>
                  <small>{question.text(vars, order.entry)}</small>
                  {answer?.photo && <img src={answer.photo} alt={question.title} />}
                </div>
              )
            })}
          </section>
        )
      })}
      <section className="panel">
        <h3>Citas independientes</h3>
        <p><b>Entrega:</b> {appointmentSummary(order.appointments.delivery)}</p>
        <p><b>Instalación:</b> {appointmentSummary(order.appointments.installation)}</p>
        <button
          className="btn primary"
          disabled={order.techRequested || !['ready', 'issues'].includes(installation.state) || order.appointments.installation.status !== 'confirmed'}
          onClick={() => updateOrder(order.token, (current) => ({ ...current, techRequested: true }))}
        >
          {order.techRequested ? '🔧 Técnico solicitado' : 'Solicitar técnico'}
        </button>
        {!['ready', 'issues'].includes(installation.state) && <small className="block">La logística puede estar lista aunque la fase de instalación siga bloqueada.</small>}
      </section>
    </div>
  )
}

export function AdminConfig() {
  const orders = useOrders()
  useQuestionConfigs()
  const [role, setRole] = useState<'logistics' | 'engineering'>('logistics')
  const [lineId, setLineId] = useState(orders[0]?.line ?? '')
  const [entry, setEntry] = useState<Record<string, string>>(orders[0]?.entry ?? {})
  const templateOrder = orders.find((item) => item.line === lineId) ?? orders[0]
  const order = templateOrder ? { ...templateOrder, line: lineId, entry } : undefined
  const phase: Phase = role === 'logistics' ? 'logistics' : 'installation'
  const questions = order ? visibleQuestions(order, phase) : []
  const vars = order ? getVars(order) : {}
  const [regulator, setRegulator] = useState(vars.REGULADOR ?? '')

  useEffect(() => { setRegulator(vars.REGULADOR ?? '') }, [lineId, entry.modelo, entry.potencia, entry.motor])

  if (!order) return <div className="admin"><Link to="/admin">← Volver al panel</Link><p>No hay pedidos demo para editar.</p></div>

  return (
    <div className="admin">
      <Link to="/admin">← Volver al panel</Link>
      <header className="admin-head">
        <div><h1>Configuración de checklist</h1><small>La edición es una simulación local de permisos por área.</small></div>
      </header>
      <div className="role-switch" aria-label="Área que configura">
        <button className={`btn ${role === 'logistics' ? 'primary' : 'ghost'}`} onClick={() => setRole('logistics')}>Área de Logística</button>
        <button className={`btn ${role === 'engineering' ? 'primary' : 'ghost'}`} onClick={() => setRole('engineering')}>Área de Ingeniería</button>
      </div>
      <div className="config-grid">
        <div>
          <label className="response-field">Línea de equipo
            <select value={lineId} onChange={(event) => {
              const nextLineId = event.target.value
              const nextLine = LINES.find((item) => item.id === nextLineId)
              const template = orders.find((item) => item.line === nextLineId)
              if (!nextLine) return
              setEntry(Object.fromEntries(nextLine.entryFields.map((field) => [
                field.key,
                template?.entry[field.key] ?? field.options[0] ?? '',
              ])))
              setLineId(nextLineId)
            }}>
              {LINES.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}
            </select>
          </label>
          {lineById(lineId).entryFields.map((field) => (
            <label className="response-field" key={field.key}>{field.label}
              <select value={entry[field.key] ?? ''} onChange={(event) => setEntry((current) => ({ ...current, [field.key]: event.target.value }))}>
                {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          ))}
        </div>
        <section className="panel">
          <h3>Preguntas por modelo</h3>
          <p><b>{lineById(order.line).name} {order.entry.modelo ?? order.entry.potencia}{order.entry.potencia ? ` · ${order.entry.potencia}` : ''}{order.entry.motor ? ` · ${order.entry.motor}` : ''}</b></p>
          <p>Logística y maniobras: {visibleQuestions(order, 'logistics').length} preguntas</p>
          <p>Instalación y capacitación: {visibleQuestions(order, 'installation').length} preguntas</p>
          <p>Total para esta configuración: {visibleQuestions(order).length} preguntas</p>
        </section>
      </div>
      {role === 'engineering' && vars.REGULADOR && (
        <section className="panel regulator-editor">
          <h3>Regulador de esta configuración</h3>
          <p>Valor derivado actual: {vars.REGULADOR}. La potencia del módulo se muestra en los datos del modelo.</p>
          <label className="response-field">Regulador requerido
            <input value={regulator} onChange={(event) => setRegulator(event.target.value)} />
          </label>
          <button className="btn primary" onClick={() => saveRegulator(order, regulator)}>Guardar regulador</button>
        </section>
      )}
      <section className="panel">
        <h3>{role === 'logistics' ? 'Preguntas logísticas y maniobras' : 'Preguntas de instalación y capacitación'}</h3>
        <p>{role === 'logistics'
          ? 'Logística puede mantener los requisitos de acceso, descarga y coordinación de recepción.'
          : 'Ingeniería puede mantener los requisitos técnicos, potencias, regulador y evidencias de instalación.'}</p>
        <div className="question-table-wrap">
          <table className="question-table">
            <thead>
              <tr><th>Pregunta</th><th>Texto para el cliente</th><th>Tipo de respuesta</th><th>Opciones (separadas por coma)</th><th>Crítica</th><th></th></tr>
            </thead>
            <tbody>
              {questions.map((question) => (
                <QuestionEditor
                  key={`${lineId}-${Object.values(entry).join('-')}-${question.id}`}
                  question={question}
                  order={order}
                  phase={phase}
                  vars={vars}
                />
              ))}
            </tbody>
          </table>
        </div>
        {!questions.length && <p>No hay preguntas configuradas para esta fase y equipo.</p>}
      </section>
      <p className="demo-note">Los cambios se guardan en el almacenamiento local de este navegador; los roles no son permisos de seguridad reales.</p>
    </div>
  )
}

function QuestionEditor({ question, order, phase, vars }: {
  question: ReturnType<typeof visibleQuestions>[number]
  order: (ReturnType<typeof useOrders>)[number]
  phase: Phase
  vars: Record<string, string>
}) {
  const [title, setTitle] = useState(question.title)
  const [prompt, setPrompt] = useState(question.text(vars, order.entry))
  const [responseType, setResponseType] = useState<ResponseType>(question.responseType ?? 'yes-no')
  const [options, setOptions] = useState((question.options ?? []).join(', '))
  const [critical, setCritical] = useState(!!question.critical)
  const [saved, setSaved] = useState(false)
  const [optionError, setOptionError] = useState('')

  useEffect(() => {
    setTitle(question.title)
    setPrompt(question.text(vars, order.entry))
    setResponseType(question.responseType ?? 'yes-no')
    setOptions((question.options ?? []).join(', '))
    setCritical(!!question.critical)
    setSaved(false)
    setOptionError('')
  }, [question, vars, order])

  const save = () => {
    const parsedOptions = options.split(',').map((option) => option.trim()).filter(Boolean)
    if (responseType === 'choice' && parsedOptions.length === 0) {
      setOptionError('Agrega al menos una opción, separada por coma.')
      setSaved(false)
      return
    }
    saveQuestionConfig(order, question.id, {
      title,
      prompt,
      phase,
      responseType,
      options: parsedOptions,
      critical,
    })
    setOptionError('')
    setSaved(true)
  }

  return (
    <tr>
      <td><input aria-label="Nombre de la pregunta" value={title} onChange={(event) => setTitle(event.target.value)} /></td>
      <td><textarea aria-label="Texto de la pregunta" rows={3} value={prompt} onChange={(event) => setPrompt(event.target.value)} /></td>
      <td>
        <select aria-label="Tipo de respuesta" value={responseType} onChange={(event) => {
          const nextType = event.target.value as ResponseType
          setResponseType(nextType)
          if (nextType === 'choice' && !options.trim()) setOptions('Sí, No')
          setOptionError('')
        }}>
          <option value="yes-no">Sí / No</option>
          <option value="choice">Selección</option>
          <option value="text">Texto</option>
          <option value="number">Número</option>
        </select>
      </td>
      <td>{responseType === 'choice' ? (
        <>
          <input aria-label="Opciones" value={options} onChange={(event) => { setOptions(event.target.value); setOptionError('') }} placeholder="Sí, No, No aplica" />
          {optionError && <small role="alert">{optionError}</small>}
        </>
      ) : '—'}</td>
      <td><input aria-label="Pregunta crítica" type="checkbox" checked={critical} onChange={(event) => setCritical(event.target.checked)} /></td>
      <td><button className="btn primary" onClick={save}>{saved ? 'Guardado' : 'Guardar'}</button></td>
    </tr>
  )
}
