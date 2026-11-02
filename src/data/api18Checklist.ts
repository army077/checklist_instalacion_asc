import type { QuestionPhase, ResponseType } from './catalog'

const API18_BASE = (import.meta.env.VITE_API18_URL as string | undefined)?.replace(/\/+$/, '')
  || 'https://desarrollotecnologicoar.com/api18'

type ApiChecklistPayload = {
  id?: number
  id_pregunta?: string
  sección?: string
  categoria?: string
  requisito?: string
  criterio?: string
  aplica_a?: string
  condicion_aplica?: string
  evidencia_requerida?: string
  fuente?: string
  conversation_id?: string
  boletin_id?: number | string
}

type ApiChecklistResponse = {
  success?: boolean
  error?: string
  data?: unknown
}

export interface ChecklistQuestion {
  id: string
  title: string
  prompt: string
  phase: QuestionPhase
  responseType: ResponseType
  options: string[]
  critical: boolean
  photo?: 'required'
  clientFacing: boolean
  line?: string
  gate?: string
  evidence?: string
  capture?: string
  validate?: string
  noPass?: string
  support?: string
  status?: string
  responsible?: string
  targetDate?: string
  comments?: string
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const parsePhase = (rawSection: string): QuestionPhase => {
  const value = normalize(rawSection)
  if (
    value.includes('logistica')
    || value.includes('entrega')
    || value.includes('maniobra')
    || value.includes('recepcion')
  ) return 'logistics'
  return 'installation'
}

const parsePhotoRequirement = (rawEvidence: string): 'required' | undefined => {
  const value = normalize(rawEvidence)
  return value.includes('foto') ? 'required' : undefined
}

const parseCritical = (rawCondition: string): boolean => {
  const value = normalize(rawCondition)
  return value.includes('critico') || value.includes('bloqueante') || value.includes('obligatorio')
}

const parseLine = (raw: string): string | undefined => {
  const value = normalize(raw)
  if (!value || value.includes('siempre') || value.includes('todas')) return undefined
  if (value.includes('shop pro')) return 'shoppro'
  if (value.includes('fiber') || value.includes('x0')) return 'fiberx0'
  if (value.includes('bendworx')) return 'bendworx'
  if (value.includes('graver')) return 'graver'
  if (value.includes('atc') || value.includes('works')) return 'atc'
  return undefined
}

const toQuestion = (row: ApiChecklistPayload, index: number): ChecklistQuestion => {
  const title = row.categoria?.trim() || row.id_pregunta?.trim() || `Punto ${index + 1}`
  const prompt = row.requisito?.trim() || row.criterio?.trim() || title
  const criteria = row.criterio?.trim()
  const evidenceRequired = row.evidencia_requerida?.trim()
  const section = row.sección?.trim()
  return {
    id: `api18-${row.id_pregunta?.trim() || row.id || index + 1}`,
    title,
    prompt,
    phase: parsePhase(section ?? ''),
    responseType: 'yes-no',
    options: [],
    critical: parseCritical(row.condicion_aplica ?? ''),
    photo: parsePhotoRequirement(evidenceRequired ?? ''),
    clientFacing: true,
    line: parseLine(row.aplica_a ?? ''),
    gate: section || undefined,
    evidence: criteria || undefined,
    capture: row.aplica_a?.trim() || undefined,
    validate: row.fuente?.trim() || undefined,
    noPass: row.condicion_aplica?.trim() || undefined,
    support: evidenceRequired || undefined,
    status: undefined,
    responsible: undefined,
    targetDate: undefined,
    comments: undefined,
  }
}

export async function fetchChecklistQuestions(boletinId: string, conversationId: string): Promise<ChecklistQuestion[]> {
  const endpoint = `${API18_BASE}/checklist/${encodeURIComponent(boletinId)}/${encodeURIComponent(conversationId)}`
  const response = await fetch(endpoint, { cache: 'no-store' })
  const payload = await response.json().catch(() => null) as ApiChecklistResponse | null
  if (!response.ok) {
    throw new Error(payload?.error || `No se pudo consultar checklist API18 (HTTP ${response.status}).`)
  }
  if (payload && payload.success === false) {
    throw new Error(payload.error || 'La API18 respondió success=false al consultar checklist.')
  }
  const rows = Array.isArray(payload?.data) ? payload.data as ApiChecklistPayload[] : []
  return rows.map(toQuestion)
}
