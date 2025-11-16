import { eventButtons } from './eventButtons.js';
import { formatEventMessage } from "./formatEvent.js";
import { getClickableName } from "./getClickableName.js";
import { RegistrationLog, User } from "../db.js";
import { logError } from "./logError.js";
import bot from "../index.js";
import config from "../config.js";

const messageLocks = new Set();

export const refreshEventMessage = async (event, isClosed) => {
    if (messageLocks.has(event.telegram_message_id)) return;

    messageLocks.add(event.telegram_message_id);

    try {
        const logs = await RegistrationLog.findAll({
            where: { event_id: event.id },
            order: [['join_time', 'ASC']],
        });

        const joined = [];
        const notGoing = [];
        const thinking = [];
        const friends = []

        for (const log of logs) {
            const user = await User.findByPk(log.userId)

            if (!user) {
                logError('❌ User not found')
            }

            if (log.type === 'join') {
                joined.push(`✅  ${getClickableName(user)}`);
            }

            if (log.type === 'not') {
                notGoing.push(`❌  ${getClickableName(user)}`);
            }

            if (log.type === 'maybe') {
                thinking.push(`🤔  ${getClickableName(user)}`);
            }

            if (log.type === 'friend') {
                joined.push(`➕ від  ${getClickableName(user)}`);
                friends.push(`➕ від  ${getClickableName(user)}`)
            }
        }

        const totalText = `\n\n=====================
<b>Всього йдуть:</b> 
✅     ${joined.length} (${joined.length - friends.length} + ${friends.length})
❌     ${notGoing.length}
🤔     ${thinking.length}

<b>Вільно слотів: ${event.players - joined.length >= 0 ? event.players - joined.length : 0} / ${event.players}</b>`

        const joinedText = joined.length > 0
            ? `\n\nЙдуть:\n${joined.join('\n')}`
            : '';

        const notGoingText = notGoing.length > 0
            ? `\n\nНе йдуть:\n${notGoing.join('\n')}`
            : '';

        const thinkingText = thinking.length > 0
            ? `\n\nМіркують/Резерв:\n${thinking.join('\n')}`
            : '';

        const message = formatEventMessage(event, isClosed) + joinedText + notGoingText + thinkingText + totalText;

        if (event.telegram_message_id) {
            const args = [
                config.groupId,
                event.telegram_message_id,
                null,
                message,
                {
                    parse_mode: 'HTML',
                    reply_markup: eventButtons(event.id, isClosed),
                },
            ];

            if (event.image_url) {
                await bot.telegram.editMessageCaption(...args);
            } else {
                await bot.telegram.editMessageText(...args);
            }
        }
    } catch (err) {
        logError(err, 'message not modified')
    } finally {
        messageLocks.delete(event.telegram_message_id);
    }
}
