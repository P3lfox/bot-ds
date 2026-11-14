import { buildCompletedText, buildMissingText } from './messages.js';
import { WhatsAppUnavailableError } from '../whatsapp/errors.js';

const NOTICE_TTL_MS = 2 * 60 * 60_000;
const MAX_NOTICES = 500;

/**
 * Sends squad notices to the WhatsApp group. Never throws: returns
 * { ok: true } or { ok: false, reason, message }.
 *
 * Each sent notice is remembered for a while (by WhatsApp message id) so that
 * replies quoting it can be routed back to the squad's Discord message.
 */
export function createSquadNotifier({ manager, whatsapp, logger = console, now = Date.now, noticeTtlMs = NOTICE_TTL_MS }) {
  const notices = new Map();

  function remember(sent, squad) {
    if (!sent?.id) return;
    for (const [id, notice] of notices) {
      if (notice.expiresAt <= now() || notices.size >= MAX_NOTICES) notices.delete(id);
    }
    notices.set(sent.id, {
      squadId: squad.id,
      game: squad.game,
      channelId: squad.channelId,
      messageId: squad.messageId,
      expiresAt: now() + noticeTtlMs,
    });
  }

  /** Squad target for a WhatsApp notice id: { squadId, game, channelId, messageId } or undefined. */
  function findNotice(id) {
    const notice = notices.get(id);
    if (!notice) return undefined;
    if (notice.expiresAt <= now()) {
      notices.delete(id);
      return undefined;
    }
    const { expiresAt, ...target } = notice;
    return target;
  }

  async function send(text, squad) {
    try {
      remember(await whatsapp.avisarGrupo(text), squad);
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
      const result = await send(buildMissingText(squad), squad);
      if (result.ok) manager.markNotified(squad.id);
      return result;
    } finally {
      squad.notifying = false;
    }
  }

  async function notifyCompleted(squad) {
    if (squad.completionNotified) return { ok: true };
    squad.completionNotified = true;
    return send(buildCompletedText(squad), squad);
  }

  return { notifyMissing, notifyCompleted, findNotice };
}
