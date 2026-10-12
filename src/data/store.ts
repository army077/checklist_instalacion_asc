import { useSyncExternalStore } from 'react'
import { lineById, type Question } from './catalog'

export interface Answer { ans: 'si' | 'no'; photo?: string }
export interface Schedule {
  status: 'pending' | 'confirmed' | 'proposed'
  slot?: string
  proposedDate?: string
  note?: string
}
export interface Order {
  token: string
  folio: string
  cliente: string
  empresa: string
  ciudad: string
  line: string
  entry: Record<string, string>
  slots: string[]
  answers: Record<string, Answer>
  submitted: boolean
  schedule: Schedule
  techRequested: boolean
}

const KEY = 'asc-orders-v1'

const day = (n: number, h: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(h, 0, 0, 0)
  return d.toISOString()
}
const slots = (a: number) => [day(a, 9), day(a + 1, 9), day(a + 3, 14)]
const base = { answers: {}, submitted: false, schedule: { status: 'pending' as const }, techRequested: false }

const seed = (): Order[] => [
  { ...base, token: 'demo-shoppro', folio: 'PED-10482', cliente: 'Carlos Ramírez', empresa: 'Muebles Ramírez', ciudad: 'Guadalajara, Jal.', line: 'shoppro', entry: { modelo: '1325', motor: '7HP', bomba: 'Sí, de 10HP', chiller: 'No', neumatico: 'Sí' }, slots: slots(10) },
  { ...base, token: 'demo-fiberx0', folio: 'PED-10517', cliente: 'Laura Medina', empresa: 'Aceros del Norte', ciudad: 'Monterrey, N.L.', line: 'fiberx0', entry: { modelo: 'FiberBlade X0R3', potencia: '6000W', voltaje: 'Trifásico 220V', gas: 'Nitrógeno', neumatico: 'No' }, slots: slots(14) },
  { ...base, token: 'demo-bendworx', folio: 'PED-10533', cliente: 'Jorge Salinas', empresa: 'Metalmecánica JS', ciudad: 'Querétaro, Qro.', line: 'bendworx', entry: { modelo: '125T 3200mm' }, slots: slots(21) },
  { ...base, token: 'demo-graver', folio: 'PED-10540', cliente: 'Ana Torres', empresa: 'Joyería Torres', ciudad: 'CDMX', line: 'graver', entry: { potencia: '50W' }, slots: slots(7) },
  { ...base, token: 'demo-atc', folio: 'PED-10551', cliente: 'Miguel Ortega', empresa: 'Carpintería Ortega', ciudad: 'Puebla, Pue.', line: 'atc', entry: { modelo: 'Works ATC 1325', perifericos: 'Sí' }, slots: slots(12) },
]

let orders: Order[] = (() => {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* datos corruptos: se reinicia con el ejemplo */ }
  return seed()
})()

const listeners = new Set<() => void>()
const persist = () => {
  try { localStorage.setItem(KEY, JSON.stringify(orders)) } catch { alert('No hay espacio para guardar más fotos en esta demo.') }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export const useOrders = () => useSyncExternalStore(subscribe, () => orders)
export const useOrder = (token?: string) => useOrders().find((o) => o.token === token)

export const updateOrder = (token: string, patch: (o: Order) => Order) => {
  orders = orders.map((o) => (o.token === token ? patch(o) : o))
  persist()
}
export const resetDemo = () => { orders = seed(); persist() }

export const visibleQuestions = (o: Order): Question[] =>
  lineById(o.line).questions.filter((q) => !q.when || q.when(o.entry))

export const getVars = (o: Order) => lineById(o.line).derive(o.entry)

export interface Status {
  total: number
  answered: number
  pending: Question[]
  criticalPending: Question[]
  state: 'incomplete' | 'ready' | 'issues' | 'blocked'
}

export const statusOf = (o: Order): Status => {
  const qs = visibleQuestions(o)
  const answered = qs.filter((q) => o.answers[q.id]).length
  const pending = qs.filter((q) => o.answers[q.id]?.ans === 'no')
  const criticalPending = pending.filter((q) => q.critical)
  const state = answered < qs.length ? 'incomplete' : criticalPending.length ? 'blocked' : pending.length ? 'issues' : 'ready'
  return { total: qs.length, answered, pending, criticalPending, state }
}

export const fmtSlot = (iso: string) => {
  const d = new Date(iso)
  return {
    day: d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }),
    time: d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
  }
}

export const compressImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const s = Math.min(1, 720 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = img.width * s
      c.height = img.height * s
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.6))
    }
    img.onerror = reject
    img.src = url
  })
