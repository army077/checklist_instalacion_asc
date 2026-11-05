// Resuelve si una conversación tiene un checklist de instalación disponible
// para reenviar por WhatsApp, y arma la URL/mensaje correspondientes.
//
// Flujo: conversación -> boletín vinculado (conversation_boletines_bridge) ->
// responsable definitivo (puede haberse referido a otra conversación vía
// responsable_referrals) -> preguntas ya generadas en checklist_asc.
import {
  getConversationBoletines,
  getResponsableReferral,
  getResponsableReferralRole,
} from './api18'
import { fetchChecklistQuestions } from './api18Checklist'

const CHECKLIST_FORM_BASE = (import.meta.env.VITE_CHECKLIST_FORM_URL as string | undefined)?.replace(/\/+$/, '')
  || 'https://asc-seguimiento.desarrollotecnologicoar.com/confirm'

export type ChecklistAvailability = {
  available: boolean
  boletinId?: string
  targetConversationId?: string
  checklistUrl?: string
  reason?: string
}

export async function resolveChecklistAvailability(conversationId: string): Promise<ChecklistAvailability> {
  const bridges = await getConversationBoletines(conversationId)
  if (!bridges.length) {
    return { available: false, reason: 'Esta conversación no tiene un boletín de instalación vinculado.' }
  }

  // Si hay varios boletines vinculados (poco común), se prioriza el principal.
  const bridge = bridges.find((b) => b.es_principal) ?? bridges[0]

  // El responsable que confirmó puede ser distinto del contacto original
  // (referencia a un contacto alternativo); hay que enviar el checklist a
  // la conversación del responsable definitivo.
  let targetConversationId = conversationId
  try {
    const role = await getResponsableReferralRole(bridge.id)
    if (role.role === 'origin' && role.referralId) {
      const referral = await getResponsableReferral(role.referralId)
      if (referral.referred_conversation_id) {
        targetConversationId = referral.referred_conversation_id
      }
    }
  } catch {
    // Si no se puede resolver el rol, se usa la conversación actual como destino.
  }

  let questions
  try {
    questions = await fetchChecklistQuestions(bridge.boletin_id, targetConversationId)
  } catch (error) {
    return {
      available: false,
      boletinId: bridge.boletin_id,
      targetConversationId,
      reason: error instanceof Error ? error.message : 'No se pudo consultar el checklist en la API18.',
    }
  }

  if (!questions.length) {
    return {
      available: false,
      boletinId: bridge.boletin_id,
      targetConversationId,
      reason: 'Aún no se han generado preguntas de checklist para este boletín.',
    }
  }

  const checklistUrl = `${CHECKLIST_FORM_BASE}/${encodeURIComponent(bridge.boletin_id)}/${encodeURIComponent(targetConversationId)}?channel=whatsapp`

  return { available: true, boletinId: bridge.boletin_id, targetConversationId, checklistUrl }
}

export function buildChecklistMessage(checklistUrl: string): string {
  return `¡Gracias por confirmar tus datos! ✅\n\nPara continuar con la entrega e instalación de tu equipo, necesitamos que completes el siguiente checklist de requisitos:\n\n${checklistUrl}\n\nUna vez completado, nuestro equipo dará seguimiento al proceso.`
}

// Plantilla de WhatsApp aprobada por Meta para reabrir una conversación
// fuera de la ventana de 24 horas (Twilio Content API). El backend valida
// este ContentSid contra su propia lista blanca antes de enviarlo; no
// reutilizar este identificador para ningún otro texto.
export const REOPEN_WINDOW_TEMPLATE_SID = 'HXc177b545c0ea14d42c7aca67ca1c200f'

export function buildReopenTemplateVariables(contactName: string): Record<string, string> {
  return { '1': contactName.trim() || 'cliente' }
}

export function previewReopenTemplateMessage(contactName: string): string {
  return `¡Hola, ${buildReopenTemplateVariables(contactName)['1']}! 👋 Somos de Asia Robótica. ¿Cómo estás?`
}
