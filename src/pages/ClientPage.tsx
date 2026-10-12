import { Fragment, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import logo from '../assets/logo_ar.png'
import { lineById } from '../data/catalog'
import { compressImage, fmtSlot, getVars, statusOf, updateOrder, useOrder, visibleQuestions, type Answer, type Order } from '../data/store'

type Step = 'welcome' | 'q' | 'summary' | 'schedule'

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
  const { token } = useParams()
  const order = useOrder(token)
  const [step, setStep] = useState<Step>('welcome')
  const [idx, setIdx] = useState(0)

  if (!order) {
    return (
      <Shell>
        <div className="notice info"><h2>Enlace no válido</h2><p>Este enlace no existe o expiró. Pide a tu asesor que te envíe uno nuevo.</p></div>
      </Shell>
    )
  }
  if (order.schedule.status === 'confirmed') return <Confirmed order={order} />
  if (order.schedule.status === 'proposed') return <Proposed order={order} />

  const qs = visibleQuestions(order)
  const st = statusOf(order)

  if (step === 'welcome') {
    const line = lineById(order.line)
    return (
      <Shell>
        <p className="eyebrow">{line.icon} {line.name}</p>
        <h1>¡Hola, {order.cliente.split(' ')[0]}!</h1>
        <p>Vamos a confirmar que todo esté listo para entregar e instalar tu equipo. Son <b>{qs.length} preguntas cortas</b> (unos 5 minutos). Algunas piden una foto.</p>
        <dl className="facts">
          <dt>Pedido</dt><dd>{order.folio}</dd>
          {line.entryFields.map((f) => <Fragment key={f.key}><dt>{f.label}</dt><dd>{order.entry[f.key]}</dd></Fragment>)}
        </dl>
        <button className="btn primary" onClick={() => { setIdx(Math.min(st.answered, qs.length - 1)); setStep(st.answered === qs.length ? 'summary' : 'q') }}>
          {st.answered ? 'Continuar' : 'Comenzar'}
        </button>
      </Shell>
    )
  }

  if (step === 'q') {
    return <QuestionStep order={order} idx={idx} setIdx={setIdx} done={() => setStep('summary')} back={() => setStep('welcome')} />
  }

  if (step === 'schedule') return <Schedule order={order} back={() => setStep('summary')} />

  return (
    <Shell progress={1}>
      <h1>Resumen</h1>
      <ul className="summary">
        {qs.map((q, i) => {
          const a = order.answers[q.id]
          return (
            <li key={q.id} className={a?.ans === 'si' ? 'ok' : 'no'}>
              <span className="dot">{a?.ans === 'si' ? '✓' : '!'}</span>
              <span>{q.title}</span>
              <button className="link" onClick={() => { setIdx(i); setStep('q') }}>Editar</button>
            </li>
          )
        })}
      </ul>
      {st.state === 'ready' || st.state === 'issues' ? (
        <>
          <div className={`notice ${st.state === 'ready' ? 'good' : 'warn'}`}>
            {st.state === 'ready' ? '¡Todo listo! Ya puedes elegir la fecha de entrega.' : `Tienes ${st.pending.length} punto(s) pendiente(s) que no impiden la entrega. Tu asesor te dará seguimiento.`}
          </div>
          <button className="btn primary" onClick={() => { updateOrder(order.token, (o) => ({ ...o, submitted: true })); setStep('schedule') }}>Elegir fecha de entrega</button>
        </>
      ) : (
        <>
          <div className="notice bad">
            <b>Aún no podemos agendar.</b> Falta resolver:
            <ul>{st.criticalPending.map((q) => <li key={q.id}>{q.title}</li>)}</ul>
            Cuando lo tengas listo, vuelve a este enlace y actualiza tu respuesta.
          </div>
          <button className="btn primary" onClick={() => updateOrder(order.token, (o) => ({ ...o, submitted: true }))}>
            {order.submitted ? '✓ Pendientes enviados a mi asesor' : 'Avisar a mi asesor'}
          </button>
        </>
      )}
    </Shell>
  )
}

function QuestionStep({ order, idx, setIdx, done, back }: { order: Order; idx: number; setIdx: (n: number) => void; done: () => void; back: () => void }) {
  const qs = visibleQuestions(order)
  const q = qs[idx]
  const vars = getVars(order)
  const a = order.answers[q.id]
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const set = (patch: Partial<Answer>) =>
    updateOrder(order.token, (o) => ({ ...o, answers: { ...o.answers, [q.id]: { ...o.answers[q.id], ...patch } as Answer } }))

  const onFile = async (f?: File) => {
    if (!f) return
    setBusy(true)
    try { set({ photo: await compressImage(f) }) } finally { setBusy(false) }
  }

  const needsPhoto = q.photo === 'required' && a?.ans === 'si' && !a.photo
  const canNext = !!a && !needsPhoto && !busy

  return (
    <Shell progress={idx / qs.length}>
      <p className="eyebrow">Pregunta {idx + 1} de {qs.length}</p>
      <h1>{q.title}</h1>
      <p className="qtext">{q.text(vars, order.entry)}</p>
      {q.bullets && <ul className="bullets">{q.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
      {q.why && <p className="why">💡 {q.why}</p>}

      <div className="choices">
        <button className={`choice yes ${a?.ans === 'si' ? 'sel' : ''}`} onClick={() => set({ ans: 'si' })}>Sí, ya lo tengo</button>
        <button className={`choice no ${a?.ans === 'no' ? 'sel' : ''}`} onClick={() => set({ ans: 'no' })}>Todavía no</button>
      </div>

      {a?.ans === 'no' && (
        <div className={`notice ${q.critical ? 'bad' : 'warn'}`}>
          {q.critical ? 'Este punto es necesario para poder instalar. Lo marcaremos como pendiente y tu asesor te ayudará.' : 'No te preocupes, lo anotamos como pendiente.'}
        </div>
      )}

      {q.photo && a?.ans === 'si' && (
        <div className="photo">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          {a.photo ? <img src={a.photo} alt="Evidencia" /> : null}
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>
            📷 {a.photo ? 'Cambiar foto' : q.photo === 'required' ? 'Tomar o subir foto (obligatoria)' : 'Agregar foto (opcional)'}
          </button>
          {needsPhoto && <small>Necesitamos la foto para validar este punto.</small>}
        </div>
      )}

      <div className="nav">
        <button className="btn ghost" onClick={() => (idx === 0 ? back() : setIdx(idx - 1))}>← Atrás</button>
        <button className="btn primary" disabled={!canNext} onClick={() => (idx === qs.length - 1 ? done() : setIdx(idx + 1))}>
          {idx === qs.length - 1 ? 'Ver resumen' : 'Siguiente →'}
        </button>
      </div>
    </Shell>
  )
}

function Schedule({ order, back }: { order: Order; back: () => void }) {
  const [sel, setSel] = useState<string>()
  const [other, setOther] = useState(false)
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')

  return (
    <Shell progress={1}>
      <h1>Elige tu fecha de entrega</h1>
      <p>Estas son las fechas disponibles para entrega e instalación en {order.ciudad}. El técnico llegará en el horario indicado.</p>
      <div className="slots">
        {order.slots.map((s) => {
          const f = fmtSlot(s)
          return (
            <button key={s} className={`slot ${sel === s && !other ? 'sel' : ''}`} onClick={() => { setSel(s); setOther(false) }}>
              <b>{f.day}</b><span>{f.time} h</span>
            </button>
          )
        })}
        <button className={`slot ${other ? 'sel' : ''}`} onClick={() => setOther(true)}><b>Ninguna me funciona</b><span>Proponer otra fecha</span></button>
      </div>
      {other && (
        <div className="propose">
          <label>Fecha preferida<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>Comentarios<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Horario, acceso, contacto en sitio…" /></label>
        </div>
      )}
      <div className="nav">
        <button className="btn ghost" onClick={back}>← Atrás</button>
        {other ? (
          <button className="btn primary" disabled={!date} onClick={() => updateOrder(order.token, (o) => ({ ...o, schedule: { status: 'proposed', proposedDate: date, note } }))}>Enviar propuesta</button>
        ) : (
          <button className="btn primary" disabled={!sel} onClick={() => updateOrder(order.token, (o) => ({ ...o, techRequested: true, schedule: { status: 'confirmed', slot: sel } }))}>Confirmar fecha</button>
        )}
      </div>
    </Shell>
  )
}

function Confirmed({ order }: { order: Order }) {
  const f = fmtSlot(order.schedule.slot!)
  return (
    <Shell>
      <div className="done">
        <div className="check">✓</div>
        <h1>¡Entrega confirmada!</h1>
        <p className="big">{f.day}<br />{f.time} h</p>
        <p>{order.folio} · {order.ciudad}</p>
        <p className="muted">Esta cita ya fue validada. Un técnico llegará a instalar tu equipo. Si necesitas cambiarla, contacta a tu asesor.</p>
      </div>
    </Shell>
  )
}

function Proposed({ order }: { order: Order }) {
  return (
    <Shell>
      <div className="done">
        <div className="check wait">⏳</div>
        <h1>Propuesta enviada</h1>
        <p>Tu fecha preferida es <b>{order.schedule.proposedDate}</b>. Tu asesor te confirmará en breve.</p>
      </div>
    </Shell>
  )
}
