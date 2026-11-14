import { buildCompletedText, buildMissingText } from './messages.js';
import { WhatsAppUnavailableError } from '../whatsapp/errors.js';

/**
 * Sends squad notices to the WhatsApp group. Never throws: returns
 * { ok: true } or { ok: false, reason, message }.
 */
export function createSquadNotifier({ manager, whatsapp, logger = console }) {
  async function send(text) {
    try {
      await whatsapp.avisarGrupo(text);
      return { ok: true };
    } catch (err) {
      if (err instanceof WhatsAppUnavailableError) {
        logger.warn(`[whatsapp] Aviso no enviado: ${err.message}`);
        return { ok: false, reason: 'unavailable', message: err.message };
      }
      logger.error('[whatsapp] Error al enviar aviso:', err);
      return { ok: false, reason: 'error', message: 'Ocurrió un error al enviar el mensaje por WhatsApp.' };
    }
  }

  async function notifyMissing(squad) {
    if (squad.notifying) {
      return { ok: false, reason: 'in_progress', message: 'Ya se está enviando un aviso para esta squad.' };
    }
    const remaining = manager.cooldownRemaining(squad);
    if (remaining > 0) {
      return { ok: false, reason: 'cooldown', remainingMs: remaining };
    }
    squad.notifying = true;
    try {
      const result = await send(buildMissingText(squad));
      if (result.ok) manager.markNotified(squad.id);
      return result;
    } finally {
      squad.notifying = false;
    }
  }

  async function notifyCompleted(squad) {
    if (squad.completionNotified) return { ok: true };
    squad.completionNotified = true;
    return send(buildCompletedText(squad));
  }

  return { notifyMissing, notifyCompleted };
}
