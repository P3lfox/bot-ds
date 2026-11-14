import { escapeMarkdown } from 'discord.js';
import { classifyReply, ReplyIntent } from '../squads/replyIntent.js';
import { fill, T } from '../texts.js';

export const DISCORD_MESSAGE_LIMIT = 2000;
const ELLIPSIS = '…';

/**
 * Escapes `text` and cuts it (by code points, never splitting an emoji) so that
 * `prefix + escaped` fits in `limit`. Escaping happens before measuring because it
 * can add a backslash per markdown character.
 */
function fitEscaped(prefix, text, limit) {
  const chars = Array.from(text);
  let full = prefix + escapeMarkdown(text);
  if (full.length <= limit) return full;

  let keep = chars.length;
  while (keep > 0) {
    full = prefix + escapeMarkdown(chars.slice(0, keep).join('')).replace(/\\$/, '') + ELLIPSIS;
    const overflow = full.length - limit;
    if (overflow <= 0) return full;
    keep -= overflow;
  }
  return prefix + ELLIPSIS;
}

function intentLabel({ intent, minutes }) {
  switch (intent) {
    case ReplyIntent.COMING:
      return { emoji: '✅', label: T.relay.coming };
    case ReplyIntent.LATE:
      return { emoji: '🕒', label: minutes ? fill(T.relay.lateMinutes, { minutes }) : T.relay.late };
    case ReplyIntent.NOT_COMING:
      return { emoji: '❌', label: T.relay.notComing };
    default:
      return { emoji: '💬', label: '' };
  }
}

/**
 * Discord message for a WhatsApp reply, labelled with the detected intent and posted
 * as a reply to the squad message without pinging anyone. The original text is always shown.
 */
export function buildRelayPayload({ senderName, text, messageId }) {
  const { emoji, label } = intentLabel(classifyReply(text));
  const prefix = `${emoji} **${escapeMarkdown(senderName)}**${label} ${T.relay.source}: `;
  return {
    content: fitEscaped(prefix, text, DISCORD_MESSAGE_LIMIT),
    reply: messageId ? { messageReference: messageId, failIfNotExists: false } : undefined,
    allowedMentions: { parse: [], repliedUser: false },
  };
}

/**
 * Returns relay(reply): posts a WhatsApp reply in the channel of the notice it quotes.
 * `fetchChannel(id)` resolves a Discord channel or null. Never throws.
 */
export function createReplyRelay({ findNotice, fetchChannel, logger = console }) {
  return async function relay({ quotedId, text, senderName }) {
    const target = findNotice(quotedId);
    if (!target?.channelId) return;
    try {
      const channel = await fetchChannel(target.channelId);
      if (!channel?.isSendable()) return;
      await channel.send(buildRelayPayload({ senderName, text, messageId: target.messageId }));
    } catch (err) {
      logger.error('[discord] No se pudo reenviar la respuesta de WhatsApp:', err.message ?? err);
    }
  };
}
