import { useSyncExternalStore } from 'react'
import { lineById, type Question } from './catalog'
import { fetchSheetQuestions, type SheetQuestion } from './googleSheets'

export type Phase = 'logistics' | 'installation'
export type ResponseType = 'yes-no' | 'text' | 'number' | 'choice'
export interface Answer { ans: string; photo?: string }
export interface Appointment {
  status: 'pending' | 'confirmed' | 'proposed'
  slot?: string
  proposedDate?: string
  note?: string
}
export interface Order {
  token: string
  orderId: string
  conversationId: string
  folio: string
  cliente: string
  empresa: string
  ciudad: string
  line: string
  entry: Record<string, string>
  deliverySlots: string[]
  installationSlots: string[]
  answers: Record<string, Answer>
  submitted: boolean
  appointments: { delivery: Appointment; installation: Appointment }
  techRequested: boolean
}

export interface QuestionConfig {
  title?: string
  prompt?: string
  phase?: Phase
  responseType?: ResponseType
  options?: string[]
  critical?: boolean
}

interface ModelConfig {
  questions: Record<string, QuestionConfig>
  regulator?: string
}

const ORDER_KEY = 'asc-orders-v2'
const CONFIG_KEY = 'asc-question-config-v1'
const SHEETS_CSV_URL = (import.meta.env.VITE_GOOGLE_SHEETS_CSV_URL as string | undefined)?.trim()
const SHEETS_MODE = (import.meta.env.VITE_GOOGLE_SHEETS_MODE as string | undefined)?.trim().toLowerCase() === 'replace'
  ? 'replace'
  : 'append'
const conversations = {
  shoppro: '09af8a9fb95a8b091a8c02a3828e589c6408c1d672856',
  fiberx0: '2d14ac7c-1b7f-42c3-9b23-4f3af6201001',
  bendworx: '2d14ac7c-1b7f-42c3-9b23-4f3af6201002',
  graver: '2d14ac7c-1b7f-42c3-9b23-4f3af6201003',
  atc: '2d14ac7c-1b7f-42c3-9b23-4f3af6201004',
}

const day = (n: number, h: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(h, 0, 0, 0)
  return d.toISOString()
}
const slots = (a: number) => [day(a, 9), day(a + 1, 9), day(a + 3, 14)]
const blankAppointments = () => ({
  delivery: { status: 'pending' as const },
  installation: { status: 'pending' as const },
})

const seed = (): Order[] => [
  { token: 'demo-shoppro', orderId: '72856', conversationId: conversations.shoppro, folio: 'PED-10482', cliente: 'Carlos Ramírez', empresa: 'Muebles Ramírez', ciudad: 'Guadalajara, Jal.', line: 'shoppro', entry: { modelo: '1325', motor: '7HP', bomba: 'Sí, de 10HP', chiller: 'No', neumatico: 'Sí' }, deliverySlots: slots(10), installationSlots: slots(14), answers: {}, submitted: false, appointments: blankAppointments(), techRequested: false },
  { token: 'demo-fiberx0', orderId: '72857', conversationId: conversations.fiberx0, folio: 'PED-10517', cliente: 'Laura Medina', empresa: 'Aceros del Norte', ciudad: 'Monterrey, N.L.', line: 'fiberx0', entry: { modelo: 'FiberBlade X0R3', potencia: '6000W', voltaje: 'Trifásico 220V', gas: 'Nitrógeno', neumatico: 'No' }, deliverySlots: slots(14), installationSlots: slots(18), answers: {}, submitted: false, appointments: blankAppointments(), techRequested: false },
  { token: 'demo-bendworx', orderId: '72858', conversationId: conversations.bendworx, folio: 'PED-10533', cliente: 'Jorge Salinas', empresa: 'Metalmecánica JS', ciudad: 'Querétaro, Qro.', line: 'bendworx', entry: { modelo: '125T 3200mm' }, deliverySlots: slots(21), installationSlots: slots(25), answers: {}, submitted: false, appointments: blankAppointments(), techRequested: false },
  { token: 'demo-graver', orderId: '72859', conversationId: conversations.graver, folio: 'PED-10540', cliente: 'Ana Torres', empresa: 'Joyería Torres', ciudad: 'CDMX', line: 'graver', entry: { potencia: '50W' }, deliverySlots: slots(7), installationSlots: slots(11), answers: {}, submitted: false, appointments: blankAppointments(), techRequested: false },
  { token: 'demo-atc', orderId: '72860', conversationId: conversations.atc, folio: 'PED-10551', cliente: 'Miguel Ortega', empresa: 'Carpintería Ortega', ciudad: 'Puebla, Pue.', line: 'atc', entry: { modelo: 'Works ATC 1325', perifericos: 'Sí' }, deliverySlots: slots(12), installationSlots: slots(16), answers: {}, submitted: false, appointments: blankAppointments(), techRequested: false },
]

const readOrders = (): Order[] => {
  try {
    const raw = localStorage.getItem(ORDER_KEY)
    if (raw) return JSON.parse(raw) as Order[]
  } catch {
    alert('No fue posible leer los datos guardados de la demo; se cargarán los pedidos de ejemplo.')
  }
  return seed()
}

let orders = readOrders()
let modelConfigs: Record<string, ModelConfig> = {}
let sheetQuestions: SheetQuestion[] = []
let sheetStatus: {
  state: 'disabled' | 'loading' | 'ready' | 'error'
  questionCount: number
  mode: 'append' | 'replace'
  source?: string
  error?: string
} = {
  state: SHEETS_CSV_URL ? 'loading' : 'disabled',
  questionCount: 0,
  mode: SHEETS_MODE,
  source: SHEETS_CSV_URL,
}
try {
  const raw = localStorage.getItem(CONFIG_KEY)
  if (raw) modelConfigs = JSON.parse(raw) as Record<string, ModelConfig>
} catch {
  alert('No fue posible leer la configuración guardada; se usarán las preguntas de ejemplo.')
}

const listeners = new Set<() => void>()
const persistOrders = () => {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(orders))
  } catch {
    alert('No hay espacio para guardar los cambios o fotos de esta demo.')
  }
  listeners.forEach((listener) => listener())
}
const persistConfig = () => {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(modelConfigs))
  } catch {
    alert('No hay espacio para guardar la configuración de esta demo.')
  }
  listeners.forEach((listener) => listener())
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
const publish = () => listeners.forEach((listener) => listener())

const matchesLine = (line: string | undefined, orderLine: string) => !line || line === orderLine
const toQuestion = (question: SheetQuestion): Question => ({
  id: question.id,
  title: question.title,
  text: () => question.prompt,
  phase: question.phase,
  responseType: question.responseType,
  options: question.options,
  critical: question.critical,
  photo: question.photo,
  checklistMeta: {
    clientFacing: question.clientFacing,
    gate: question.gate,
    evidence: question.evidence,
    capture: question.capture,
    validate: question.validate,
    noPass: question.noPass,
    support: question.support,
    status: question.status,
    responsible: question.responsible,
    targetDate: question.targetDate,
    comments: question.comments,
  },
})

const sheetQuestionsForOrder = (order: Order): Question[] =>
  sheetQuestions
    .filter((question) => matchesLine(question.line, order.line))
    .map(toQuestion)

export const refreshSheetQuestions = async () => {
  if (!SHEETS_CSV_URL) return
  sheetStatus = { ...sheetStatus, state: 'loading', error: undefined }
  publish()
  try {
    const loaded = await fetchSheetQuestions(SHEETS_CSV_URL)
    sheetQuestions = loaded
    sheetStatus = {
      ...sheetStatus,
      state: 'ready',
      questionCount: loaded.length,
      error: undefined,
    }
  } catch (error) {
    sheetQuestions = []
    sheetStatus = {
      ...sheetStatus,
      state: 'error',
      questionCount: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
  publish()
}

if (SHEETS_CSV_URL) {
  void refreshSheetQuestions()
}

export const useOrders = () => useSyncExternalStore(subscribe, () => orders)
export const useQuestionConfigs = () => useSyncExternalStore(subscribe, () => modelConfigs)
export const useSheetSourceStatus = () => useSyncExternalStore(subscribe, () => sheetStatus)
export const useOrder = (token?: string) => {
  useSyncExternalStore(subscribe, () => modelConfigs)
  useSyncExternalStore(subscribe, () => sheetStatus)
  return useOrders().find((order) => order.token === token)
}
export const findOrderById = (orderId?: string) => {
  useSyncExternalStore(subscribe, () => orders)
  useSyncExternalStore(subscribe, () => modelConfigs)
  return orders.find((order) => order.orderId === orderId)
}

export const updateOrder = (token: string, patch: (order: Order) => Order) => {
  orders = orders.map((order) => (order.token === token ? patch(order) : order))
  persistOrders()
}
export const resetDemo = () => {
  orders = seed()
  modelConfigs = {}
  persistConfig()
  persistOrders()
}

// Inserta o actualiza pedidos que vienen de la API, conservando
// respuestas, citas y slots locales si el pedido ya existía.
export const upsertApiOrders = (remote: Order[]) => {
  if (!remote.length) return
  const existingByToken = new Map(orders.map((order) => [order.token, order]))
  const merged = remote.map((incoming) => {
    const existing = existingByToken.get(incoming.token)
    if (!existing) return incoming
    return {
      ...incoming,
      answers: existing.answers,
      submitted: existing.submitted,
      appointments: existing.appointments,
      deliverySlots: existing.deliverySlots,
      installationSlots: existing.installationSlots,
      techRequested: existing.techRequested,
    }
  })
  const remoteTokens = new Set(remote.map((order) => order.token))
  orders = [...merged, ...orders.filter((order) => !remoteTokens.has(order.token))]
  persistOrders()
}

export const configurationKey = (order: Order) =>
  [order.line, ...Object.entries(order.entry).sort(([left], [right]) => left.localeCompare(right)).flat()].join('|')

const modelConfig = (order: Order) => modelConfigs[configurationKey(order)]
const logisticsQuestionIds: Record<string, string[]> = {
  shoppro: ['espacio', 'dist'],
  fiberx0: ['maniobra', 'transito'],
  bendworx: ['descarga', 'transito'],
  graver: ['mesa'],
  atc: ['transito', 'descarga'],
}

export const visibleQuestions = (order: Order, phase?: Phase): Question[] => {
  const config = modelConfig(order)
  const baseQuestions = lineById(order.line).questions
    .filter((question) => !question.when || question.when(order.entry))
    .map((question) => {
      const override = config?.questions[question.id]
      const defaultPhase: Phase = logisticsQuestionIds[order.line]?.includes(question.id) ? 'logistics' : 'installation'
      return {
        ...question,
        title: override?.title ?? question.title,
        text: override?.prompt ? () => override.prompt! : question.text,
        phase: override?.phase ?? defaultPhase,
        responseType: override?.responseType ?? 'yes-no',
        options: override?.options ?? [],
        critical: override?.critical ?? question.critical,
      }
    })
  const externalQuestions = sheetQuestionsForOrder(order)
  const combined = sheetStatus.state === 'ready' && SHEETS_MODE === 'replace'
    ? externalQuestions
    : [...externalQuestions, ...baseQuestions]
  return combined.filter((question) => !phase || question.phase === phase)
}

export const saveQuestionConfig = (order: Order, questionId: string, config: QuestionConfig) => {
  const key = configurationKey(order)
  const current = modelConfigs[key] ?? { questions: {} }
  modelConfigs = { ...modelConfigs, [key]: { ...current, questions: { ...current.questions, [questionId]: config } } }
  persistConfig()
}

export const saveRegulator = (order: Order, regulator: string) => {
  const key = configurationKey(order)
  modelConfigs = { ...modelConfigs, [key]: { ...(modelConfigs[key] ?? { questions: {} }), regulator } }
  persistConfig()
}

export const getVars = (order: Order) => {
  const vars = lineById(order.line).derive(order.entry)
  const regulator = modelConfig(order)?.regulator
  return regulator ? { ...vars, REGULADOR: regulator } : vars
}

export interface Status {
  total: number
  answered: number
  unanswered: Question[]
  pending: Question[]
  criticalPending: Question[]
  state: 'incomplete' | 'ready' | 'issues' | 'blocked'
}

export const statusOf = (order: Order, phase?: Phase): Status => {
  const questions = visibleQuestions(order, phase)
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
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo procesar la imagen.'))
    }
    img.src = url
  })
