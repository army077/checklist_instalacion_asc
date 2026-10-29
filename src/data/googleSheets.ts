import type { QuestionPhase, ResponseType } from './catalog'

export interface SheetQuestion {
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

const parseCsv = (content: string): string[][] => {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i]
    if (char === '"') {
      if (inQuotes && content[i + 1] === '"') {
        cell += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (char === ',' && !inQuotes) {
      row.push(cell.trim())
      cell = ''
      continue
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && content[i + 1] === '\n') i += 1
      row.push(cell.trim())
      cell = ''
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
      continue
    }
    cell += char
  }

  row.push(cell.trim())
  if (row.some((value) => value !== '')) rows.push(row)
  return rows
}

const findColumn = (headers: string[], candidates: string[]): number =>
  headers.findIndex((header) => candidates.includes(normalize(header)))

const valueAt = (row: string[], index: number): string => (index >= 0 ? (row[index] ?? '').trim() : '')
const hasAny = (headers: string[], candidates: string[]) =>
  headers.some((header) => candidates.includes(normalize(header)))
const findHeaderRowIndex = (rows: string[][]): number =>
  rows.findIndex((row) => {
    const hasId = hasAny(row, ['id'])
    const hasControl = hasAny(row, ['control', 'pregunta', 'titulo', 'title'])
    const hasGate = hasAny(row, ['compuerta', 'fase', 'phase'])
    return hasId && hasControl && hasGate
  })

const parsePhase = (raw: string): QuestionPhase => {
  const value = normalize(raw)
  if (/^a\b/.test(value) || /^b\b/.test(value)) return 'logistics'
  if (/^c\b/.test(value)) return 'installation'
  if (
    value.includes('antes de la entrega')
    || value.includes('liberacion')
    || value.includes('carga')
    || value.includes('logistica')
    || value.includes('maniobra')
    || value.includes('entrega')
  ) return 'logistics'
  if (
    value.includes('instalacion')
    || value.includes('capacitacion')
    || value.includes('puesta en marcha')
  ) return 'installation'
  return 'installation'
}

const parseResponseType = (rawTipo: string, rawEvidence: string, options: string[]): ResponseType => {
  if (options.length > 0) return 'choice'
  const value = normalize(rawTipo)
  const evidence = normalize(rawEvidence)
  if (evidence.includes('si o no') || evidence.includes('sí o no')) return 'yes-no'
  if (evidence.includes('nombre') || evidence.includes('telefono') || evidence.includes('teléfono') || evidence.includes('comentario')) return 'text'
  if (value.includes('numero') || value.includes('number')) return 'number'
  if (value.includes('texto') || value.includes('text')) return 'text'
  if (value.includes('opcion') || value.includes('seleccion') || value.includes('choice')) return 'choice'
  return 'yes-no'
}

const parseBool = (raw: string): boolean => {
  const value = normalize(raw)
  return ['si', 'sí', 'yes', 'true', '1', 'x'].includes(value)
}

const parseCritical = (rawTipo: string, rawCritical: string): boolean => {
  const tipo = normalize(rawTipo)
  if (tipo.includes('bloqueante') || tipo.includes('critico') || tipo.includes('crítico')) return true
  return parseBool(rawCritical)
}

const parsePhotoRequirement = (rawEvidence: string): 'required' | undefined => {
  const value = normalize(rawEvidence)
  return value.includes('foto') ? 'required' : undefined
}

const parseClientFacing = (rawCapture: string): boolean => {
  const value = normalize(rawCapture)
  if (!value) return true
  return value.includes('cliente')
    || value.includes('chofer')
}

const slug = (value: string) =>
  normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const toGoogleCsvUrl = (source: string): string => {
  let parsed: URL
  try {
    parsed = new URL(source)
  } catch {
    return source
  }
  if (!parsed.hostname.includes('docs.google.com')) return source

  const pathMatch = parsed.pathname.match(/\/spreadsheets\/d\/([^/]+)/)
  if (!pathMatch?.[1]) return source

  const sheetId = pathMatch[1]
  const gid = parsed.searchParams.get('gid') ?? '0'
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`
}

export async function fetchSheetQuestions(csvUrl: string): Promise<SheetQuestion[]> {
  const resolvedUrl = toGoogleCsvUrl(csvUrl)
  const response = await fetch(resolvedUrl, { cache: 'no-store' })
  const finalUrl = response.url || resolvedUrl
  if (finalUrl.includes('accounts.google.com')) {
    throw new Error('La hoja requiere inicio de sesión. Publica la pestaña como CSV o habilita acceso público de solo lectura.')
  }
  if (!response.ok) throw new Error(`No se pudo leer Google Sheets (HTTP ${response.status}).`)

  const csv = await response.text()
  if (/servicelogin|accounts\.google\.com/i.test(csv)) {
    throw new Error('Google devolvió una página de login. Usa el enlace CSV público de la hoja.')
  }
  const rows = parseCsv(csv)
  if (rows.length < 2) return []

  const headerRowIndex = findHeaderRowIndex(rows)
  if (headerRowIndex < 0) {
    throw new Error('No se encontró la fila de encabezados (ID, Compuerta, Control) en el CSV de Google Sheets.')
  }

  const headers = rows[headerRowIndex]
  const idCol = findColumn(headers, ['id'])
  const lineCol = findColumn(headers, ['linea', 'linea de equipo', 'linea_equipo', 'line'])
  const gateCol = findColumn(headers, ['compuerta', 'fase', 'phase'])
  const controlCol = findColumn(headers, ['control', 'pregunta', 'titulo', 'title'])
  const evidenceCol = findColumn(headers, ['evidencia o dato', 'evidencia', 'dato', 'texto', 'prompt'])
  const typeCol = findColumn(headers, ['tipo', 'tipo de respuesta', 'response type', 'response_type'])
  const optionsCol = findColumn(headers, ['opciones', 'options'])
  const statusCol = findColumn(headers, ['estatus', 'estado', 'status'])
  const criticalCol = findColumn(headers, ['critica', 'crítica', 'critical', 'bloqueante'])
  const captureCol = findColumn(headers, ['captura'])
  const validateCol = findColumn(headers, ['valida', 'validador', 'quien valida'])
  const noPassCol = findColumn(headers, ['si no pasa (por definir)', 'si no pasa', 'si_no_pasa'])
  const supportCol = findColumn(headers, ['sustento (encuestas)', 'sustento', 'encuestas'])
  const responsibleCol = findColumn(headers, ['responsable de implementar', 'responsable'])
  const targetDateCol = findColumn(headers, ['fecha objetivo', 'fecha'])
  const commentsCol = findColumn(headers, ['comentarios', 'comentario'])

  const questions = rows
    .slice(headerRowIndex + 1)
    .map<SheetQuestion | null>((row, index) => {
      const title = valueAt(row, controlCol)
      const prompt = valueAt(row, evidenceCol)
      const estatus = normalize(valueAt(row, statusCol))
      if (!title || estatus === 'inactivo') return null

      const rawId = valueAt(row, idCol)
      const gate = valueAt(row, gateCol)
      const evidence = valueAt(row, evidenceCol)
      const capture = valueAt(row, captureCol)
      const validate = valueAt(row, validateCol)
      const noPass = valueAt(row, noPassCol)
      const support = valueAt(row, supportCol)
      const status = valueAt(row, statusCol)
      const responsible = valueAt(row, responsibleCol)
      const targetDate = valueAt(row, targetDateCol)
      const comments = valueAt(row, commentsCol)
      const id = `gs-${rawId || slug(title) || String(index + 1)}`
      const options = valueAt(row, optionsCol).split('|').map((item) => item.trim()).filter(Boolean)
      const line = valueAt(row, lineCol)

      return {
        id,
        title,
        prompt: prompt || title,
        phase: parsePhase(gate),
        responseType: parseResponseType(valueAt(row, typeCol), evidence, options),
        options,
        critical: parseCritical(valueAt(row, typeCol), valueAt(row, criticalCol)),
        photo: parsePhotoRequirement(evidence),
        clientFacing: parseClientFacing(capture),
        line: line ? slug(line) : undefined,
        gate: gate || undefined,
        evidence: evidence || undefined,
        capture: capture || undefined,
        validate: validate || undefined,
        noPass: noPass || undefined,
        support: support || undefined,
        status: status || undefined,
        responsible: responsible || undefined,
        targetDate: targetDate || undefined,
        comments: comments || undefined,
      }
    })
    .filter((question): question is SheetQuestion => question !== null)

  return questions
}
