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
