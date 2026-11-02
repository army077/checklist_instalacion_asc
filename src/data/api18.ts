// Cliente de solo lectura para la API18 (atención al cliente por WhatsApp).
// Documentación de endpoints: ver ENDPOINTS.md en el repo api_bot_experto.

const API18_BASE = (import.meta.env.VITE_API18_URL as string | undefined)?.replace(/\/+$/, '')
  || 'https://desarrollotecnologicoar.com/api18'

export type ConversationStatus = 'open' | 'human' | 'closed'
export type MessageDirection = 'inbound' | 'outbound'
export type SentBy = 'customer' | 'bot' | 'human' | 'system'

export type ConversationSummary = {
  id: string
  status: ConversationStatus
  channel: string
  assigned_to: string | null
  started_at: string
  last_message_at: string | null
  closed_at: string | null
  contact_id: string
  phone: string
  whatsapp_name: string | null
  full_name: string | null
  company: string | null
  last_message_body: string | null
  last_message_direction: MessageDirection | null
  last_message_sent_by: SentBy | null
  last_message_created_at: string | null
  message_count: number
}

export type ConversationMessage = {
  id: string
  external_message_id: string | null
  direction: MessageDirection
  sender: string | null
  recipient: string | null
  message_type: string
  body: string | null
  media_url: string | null
  delivery_status: string | null
  sent_by: SentBy
  created_at: string
}

export type ConversationContact = {
  id: string
  phone: string
  whatsapp_name: string | null
  full_name: string | null
  email: string | null
  company: string | null
  customer_code: string | null
  source: string
}

export type ConversationDetail = {
  conversation: {
    id: string
    contact_id: string
    channel: string
    status: ConversationStatus
    assigned_to: string | null
    started_at: string
    last_message_at: string | null
    closed_at: string | null
    created_at: string
    updated_at: string
  }
  contact: ConversationContact | null
  messages: ConversationMessage[]
}

export type boletinesConversationBridge = {
  id: string,
  conversation_id: string,
  boletin_id: string,
  es_principal: boolean,
  estado_proceso: string,
  created_at: string,
  updated_at: string
}


async function request<T>(path: string, options: { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown } = {}): Promise<T> {
  const { method = 'GET', body } = options
  const response = await fetch(`${API18_BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Error ${response.status} al consultar ${path}`)
  }
  return payload as T
}

export async function listConversations(params: { status?: ConversationStatus | ''; search?: string } = {}) {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.search) query.set('search', params.search)
  query.set('limit', '50')
  const payload = await request<{ conversations: ConversationSummary[] }>(`/conversations?${query.toString()}`)
  return payload.conversations
}

export async function getConversationContext(conversationId: string) {
  const payload = await request<ConversationDetail>(`/conversations/${conversationId}/context?limit=100`)
  return payload
}

export type ContactEditableFields = Partial<Pick<ConversationContact, 'full_name' | 'email' | 'company' | 'customer_code'>>

export async function updateContact(contactId: string, patch: ContactEditableFields) {
  const response = await fetch(`${API18_BASE}/contacts/id/${encodeURIComponent(contactId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Error ${response.status} al actualizar el contacto`)
  }
  return payload.contact as ConversationContact
}

export async function listBoletinesConversationBridge(params: { conversation_id?: string } = {}) {
  const query = new URLSearchParams()
  if (params.conversation_id) query.set('conversation_id', params.conversation_id)
  const payload = await request<{ bridges: boletinesConversationBridge[] }>(`/boletines_conversation_bridge?${query.toString()}`)
  return payload.bridges
}

// ---- Intervención humana (solo conversaciones sobre el número habilitado) ----
// Ver api_bot_experto/services/humanReplyService.js. Escribe en el mismo
// esquema que el resto de esta API (no es un canal aislado).

export type ReplyStatus = {
  enabled: boolean
  isEligibleNumber?: boolean
  canReply?: boolean
}

export async function getReplyStatus(conversationId: string) {
  return request<ReplyStatus & { ok: true }>(`/conversations/${conversationId}/reply-status`)
}

export async function changeConversationStatus(conversationId: string, status: ConversationStatus) {
  const payload = await request<{ conversation: { id: string; status: ConversationStatus } }>(
    `/conversations/${conversationId}/status`,
    { method: 'PATCH', body: { status } },
  )
  return payload.conversation
}

export async function sendHumanMessage(conversationId: string, body: string, clientMessageId: string) {
  const payload = await request<{ duplicate: boolean; message: ConversationMessage }>(
    `/conversations/${conversationId}/messages`,
    { method: 'POST', body: { body, clientMessageId } },
  )
  return payload.message
}

