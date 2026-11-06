// Cliente para la persistencia de fotos del checklist en Google Drive.
// El backend (api_bot_experto) hace de proxy hacia api7/subir_foto_checklist
// y guarda la metadata (incluida la carpeta de Drive) en Postgres, porque
// api7 no expone un listado de fotos previas ni reutiliza la carpeta de
// forma fiable entre subidas casi simultáneas.

const API18_BASE = (import.meta.env.VITE_API18_URL as string | undefined)?.replace(/\/+$/, '')
  || 'https://desarrollotecnologicoar.com/api18'

export type ChecklistPhoto = {
  id: string
  conversation_id: string
  boletin_id: string | null
  titulo_instalacion: string | null
  drive_folder_id: string
  drive_folder_link: string | null
  drive_file_id: string
  drive_file_name: string | null
  drive_web_view_link: string | null
  drive_web_content_link: string | null
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

type UploadResponse = {
  ok: boolean
  error?: string
  folderId?: string
  folderLink?: string
  photos?: ChecklistPhoto[]
}

type ListResponse = {
  ok: boolean
  error?: string
  photos?: ChecklistPhoto[]
  folderId?: string | null
  folderLink?: string | null
}

// webContentLink (uc?...export=download) responde con un redirect 303 que
// un <img> no sigue de forma fiable (icono roto). Este formato de
// lh3.googleusercontent.com sí sirve los bytes de la imagen directamente
// (verificado: HTTP 200, Content-Type image/jpeg) para archivos de Drive
// compartidos públicamente, como los que crea api7.
export function driveThumbnailUrl(driveFileId: string, width = 600): string {
  return `https://lh3.googleusercontent.com/d/${encodeURIComponent(driveFileId)}=w${width}`
}

// titulo_instalacion se usa como clave estable para asociar cada foto a su
// pregunta de checklist (se envía el id de la pregunta, ej. "api18-ATC-I-3").
export async function uploadChecklistPhoto(
  conversationId: string,
  file: Blob,
  fileName: string,
  opts: { boletinId?: string; questionId?: string } = {},
): Promise<ChecklistPhoto> {
  const formData = new FormData()
  formData.append('photos', file, fileName)
  if (opts.boletinId) formData.append('boletin_id', opts.boletinId)
  if (opts.questionId) formData.append('titulo_instalacion', opts.questionId)

  const endpoint = `${API18_BASE}/checklist/${encodeURIComponent(conversationId)}/photos`
  const response = await fetch(endpoint, { method: 'POST', body: formData })
  const payload = await response.json().catch(() => null) as UploadResponse | null
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `No se pudo subir la foto (HTTP ${response.status}).`)
  }
  const photo = payload.photos?.[0]
  if (!photo) {
    throw new Error('El servidor no devolvió la foto subida.')
  }
  return photo
}

export async function listChecklistPhotos(conversationId: string): Promise<ChecklistPhoto[]> {
  const endpoint = `${API18_BASE}/checklist/${encodeURIComponent(conversationId)}/photos`
  const response = await fetch(endpoint, { cache: 'no-store' })
  const payload = await response.json().catch(() => null) as ListResponse | null
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `No se pudo consultar las fotos (HTTP ${response.status}).`)
  }
  return payload.photos ?? []
}

// Convierte el dataURL (JPEG comprimido por compressImage) a Blob para
// poder enviarlo como multipart/form-data.
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',')
  const mimeMatch = /data:(.*?);base64/.exec(header)
  const mime = mimeMatch?.[1] || 'image/jpeg'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
