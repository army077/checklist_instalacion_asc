// Cliente de solo lectura para la API19 (boletines emitidos).
import type { Order } from './store'

const API19_BASE = (import.meta.env.VITE_API19_URL as string | undefined)?.replace(/\/+$/, '')
  || 'https://desarrollotecnologicoar.com/api19'

export type BoletinItem = {
  id: number
  cotizacion_id: number
  tipo: string
  codigo: string
  descripcion: string
  cantidad: number
  precio_unitario: string
  descuento: string
  total: string
  activo: boolean
  accion: string | null
  parent_item_id: number | null
  dimension_x: number | null
  dimension_y: number | null
  nomenclatura: string | null
}

export type Boletin = {
  id: string
  folio: string
  cliente_id: string
  sucursal_origen_id: string
  contacto_nombre: string | null
  contacto_email: string | null
  telefono: string | null
  descripcion: string | null
  estatus: string
  created_by: string
  created_at: string
  ticket: string | null
  ticket_id: string | null
  boletin_emitido_id: string | null
  boletinNumber: string
  saleDate: string | null
  clientName: string | null
  contactPerson: string | null
  originBranch: string | null
  salesRep: string | null
  status: string
  cotizacion_id: number | null
  vendedor_email: string | null
  items: BoletinItem[]
  ciudad: string | null
  estado?: string | null
  pais?: string | null
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API19_BASE}${path}`)
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error || `Error ${response.status} al consultar ${path}`)
  }
  return payload as T
}

export async function fetchBoletinesEmitidos(params: { page?: number; limit?: number; search?: string } = {}): Promise<Boletin[]> {
  const query = new URLSearchParams()
  query.set('page', String(params.page ?? 1))
  query.set('limit', String(params.limit ?? 50))
  if (params.search) query.set('search', params.search)
  const payload = await request<unknown>(`/boletines/emitidos?${query.toString()}`)
  if (Array.isArray(payload)) return payload as Boletin[]
  const container = payload as Record<string, unknown> | null
  const list = container?.boletines ?? container?.data ?? container?.rows ?? []
  return (Array.isArray(list) ? list : []) as Boletin[]
}

export async function fetchBoletinEmitido(boletinEmitidoId: string): Promise<Boletin> {
  const payload = await request<unknown>(`/boletines/emitido/${encodeURIComponent(boletinEmitidoId)}`)
  const container = payload as Record<string, unknown> | null
  const boletin = (container && typeof container.boletin === 'object' ? container.boletin : container) as Boletin | null
  if (!boletin || !boletin.id) throw new Error('Boletín no encontrado.')
  return boletin
}

// ---- Mapeo de boletín a pedido del checklist ----

const day = (n: number, h: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(h, 0, 0, 0)
  return d.toISOString()
}
const slots = (a: number) => [day(a, 9), day(a + 1, 9), day(a + 3, 14)]

// Ajusta estos patrones al catálogo real de códigos para clasificar cada boletín.
const LINE_PATTERNS: [RegExp, string][] = [
  [/fiber\s?blade|fiber\s?x|x0r|t6l/i, 'fiberx0'],
  [/bendworx|dobladora/i, 'bendworx'],
  [/graver/i, 'graver'],
  [/works|atc/i, 'atc'],
  [/shop\s?pro/i, 'shoppro'],
]
const DEFAULT_LINE = 'shoppro'

const inferLine = (maquina?: BoletinItem): string => {
  const haystack = `${maquina?.codigo ?? ''} ${maquina?.descripcion ?? ''} ${maquina?.nomenclatura ?? ''}`
  const match = LINE_PATTERNS.find(([pattern]) => pattern.test(haystack))
  return match?.[1] ?? DEFAULT_LINE
}

const itemDetail = (item: BoletinItem) =>
  [item.codigo, item.descripcion, item.nomenclatura]
    .filter((value): value is string => !!value && value.trim().length > 0)
    .join(' · ')

export const boletinToOrder = (boletin: Boletin): Order => {
  const items = boletin.items ?? []
  const maquina = items.find((item) => item.tipo === 'MAQUINA' && item.activo) ?? items[0]
  const accesorios = items.filter((item) => item !== maquina && item.activo)
  const entry: Record<string, string> = {}
  if (maquina) {
    entry.modelo = maquina.codigo || maquina.descripcion || maquina.nomenclatura || '—'
    const equipo = itemDetail(maquina)
    if (equipo) entry.equipo = equipo
  }
  if (accesorios.length) {
    const accesoriosDetalle = accesorios
      .map(itemDetail)
      .filter((item) => item.length > 0)
      .join(' | ')
    if (accesoriosDetalle) entry.accesorios = accesoriosDetalle
  }
  const folio = boletin.folio || boletin.boletinNumber || boletin.id
  const emitidoId = boletin.boletin_emitido_id || boletin.id
  return {
    token: `api19-${emitidoId}`,
    orderId: emitidoId,
    conversationId: boletin.ticket_id || `api19-${emitidoId}`,
    folio,
    cliente: boletin.contactPerson || boletin.contacto_nombre || boletin.clientName || 'Sin contacto',
    empresa: boletin.clientName || '—',
    ciudad: boletin.ciudad || '—',
    line: inferLine(maquina),
    entry,
    deliverySlots: slots(10),
    installationSlots: slots(14),
    answers: {},
    submitted: false,
    appointments: {
      delivery: { status: 'pending' },
      installation: { status: 'pending' },
    },
    techRequested: false,
  }
}
