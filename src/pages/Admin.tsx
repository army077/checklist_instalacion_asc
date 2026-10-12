import { Fragment, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import logo from '../assets/logo_ar.png'
import { lineById } from '../data/catalog'
import { fmtSlot, getVars, resetDemo, statusOf, updateOrder, useOrder, useOrders, visibleQuestions } from '../data/store'

const LABEL = { incomplete: 'En proceso', ready: 'Listo', issues: 'Con pendientes', blocked: 'Bloqueado' } as const

export function AdminList() {
  const orders = useOrders()
  const [copied, setCopied] = useState('')
  const link = (t: string) => `${location.origin}/c/${t}`
  return (
    <div className="admin">
      <header className="admin-head">
        <h1><img className="logo" src={logo} alt="" style={{ verticalAlign: 'middle', marginRight: 10 }} />Panel de instalaciones</h1>
        <button className="btn ghost" onClick={() => confirm('¿Reiniciar los datos de demo?') && resetDemo()}>Reiniciar demo</button>
      </header>
      <div className="table">
        {orders.map((o) => {
          const st = statusOf(o)
          const line = lineById(o.line)
          return (
            <div className="row" key={o.token}>
              <span className={`pill ${st.state}`}>{LABEL[st.state]}</span>
              <div className="grow">
                <b>{o.folio} · {o.cliente}</b>
                <small>{line.icon} {line.name} {o.entry.modelo ?? o.entry.potencia} · {o.empresa} · {o.ciudad}</small>
                <small>{st.answered}/{st.total} respondidas{o.schedule.status === 'confirmed' ? ` · 📅 ${fmtSlot(o.schedule.slot!).day}` : o.schedule.status === 'proposed' ? ' · 📅 propuesta de cliente' : ''}{o.techRequested ? ' · 🔧 técnico solicitado' : ''}</small>
              </div>
              <a className="btn ghost" href={`/c/${o.token}`} target="_blank" rel="noreferrer">Vista cliente</a>
              <button className="btn ghost" onClick={() => { navigator.clipboard?.writeText(link(o.token)); setCopied(o.token) }}>{copied === o.token ? '¡Copiado!' : 'Copiar enlace'}</button>
              <a className="btn ghost" href={`https://wa.me/?text=${encodeURIComponent(`Hola ${o.cliente}, confirma la preparación de tu equipo aquí: ${link(o.token)}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
              <Link className="btn primary" to={`/admin/${o.token}`}>Detalle</Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function AdminDetail() {
  const { token } = useParams()
  const o = useOrder(token)
  if (!o) return <div className="admin"><Link to="/admin">← Volver</Link><p>Pedido no encontrado.</p></div>
  const st = statusOf(o)
  const vars = getVars(o)
  return (
    <div className="admin">
      <Link to="/admin">← Volver</Link>
      <header className="admin-head">
        <div><h1>{o.folio} · {o.cliente}</h1><small>{o.empresa} · {o.ciudad}</small></div>
        <span className={`pill ${st.state}`}>{LABEL[st.state]}</span>
      </header>
      <section className="panel">
        <h3>Equipo</h3>
        <dl className="facts">
          {lineById(o.line).entryFields.map((f) => <Fragment key={f.key}><dt>{f.label}</dt><dd>{o.entry[f.key]}</dd></Fragment>)}
          {Object.entries(vars).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
        </dl>
      </section>
      <section className="panel">
        <h3>Respuestas</h3>
        {visibleQuestions(o).map((q) => {
          const a = o.answers[q.id]
          return (
            <div key={q.id} className={`ans ${a ? a.ans : 'none'}`}>
              <b>{a ? (a.ans === 'si' ? '✓' : '✗') : '·'} {q.title}{q.critical ? ' (crítico)' : ''}</b>
              <small>{q.text(vars, o.entry)}</small>
              {a?.photo && <img src={a.photo} alt={q.title} />}
            </div>
          )
        })}
      </section>
      <section className="panel">
        <h3>Agenda</h3>
        <p>{o.schedule.status === 'confirmed' ? `Confirmada: ${fmtSlot(o.schedule.slot!).day}, ${fmtSlot(o.schedule.slot!).time} h` : o.schedule.status === 'proposed' ? `El cliente propone: ${o.schedule.proposedDate}. ${o.schedule.note ?? ''}` : 'Sin confirmar'}</p>
        <button className="btn primary" disabled={o.techRequested || !['ready', 'issues'].includes(st.state)} onClick={() => updateOrder(o.token, (x) => ({ ...x, techRequested: true }))}>
          {o.techRequested ? '🔧 Técnico solicitado' : 'Solicitar técnico'}
        </button>
      </section>
    </div>
  )
}
