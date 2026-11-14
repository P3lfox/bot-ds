import { getContentType, normalizeMessageContent } from '@whiskeysockets/baileys';

/**
 * Returns { quotedId, text, senderName } when `msg` is someone else's reply (quote)
 * inside `groupId`, or null otherwise.
 */
export function extractGroupReply(msg, groupId) {
  if (!msg?.message || msg.key?.fromMe || msg.key?.remoteJid !== groupId) return null;

  // Unwraps disappearing / view-once wrappers.
  const content = normalizeMessageContent(msg.message);
  const type = getContentType(content);
  if (!type) return null;
  const inner = content[type];

  const quotedId = inner?.contextInfo?.stanzaId;
  if (!quotedId) return null;

  const raw = typeof inner === 'string' ? inner : (inner?.text ?? inner?.caption ?? '');
  const text = raw.trim();
  if (!text) return null;

  return { quotedId, text, senderName: msg.pushName?.trim() || 'Alguien' };
}

/** Handles a Baileys 'messages.upsert' event: forwards replies from live ('notify') messages. Never throws. */
export function routeGroupReplies({ messages, type }, groupId, onGroupReply, logger = console) {
  if (type !== 'notify' || !groupId) return;
  for (const msg of messages ?? []) {
    try {
      const reply = extractGroupReply(msg, groupId);
      if (!reply) continue;
      Promise.resolve()
        .then(() => onGroupReply(reply))
        .catch((err) => logger.error('[whatsapp] Error reenviando respuesta:', err));
    } catch (err) {
      logger.error('[whatsapp] Error leyendo un mensaje del grupo:', err);
    }
  }
}
