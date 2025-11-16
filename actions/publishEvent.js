import {Event} from "../db.js";
import { formatEventMessage } from "../utils/formatEvent.js";
import { eventButtons } from "../utils/eventButtons.js";
import { adminControlButtons } from "../utils/adminControlButtons.js";
import { refreshEventMessage } from "../utils/refreshEventMessage.js";
import {logError} from "../utils/logError.js";
import config from "../config.js";
import {safeSendMessage, safeSendPhoto} from "../services/safeSend.js";

export const publishEvent = ({ isScheduled, id }) => {
    return async (ctx) => {
        try {
            const eventId = isScheduled ? id : parseInt(ctx.match[1]);
            const event = await Event.findByPk(eventId);

            if (!event) {
                logError('❌ Event not found:', new Error(`Event ID ${eventId} not found`));
                if (!isScheduled) {
                    ctx.reply('❌ Подію не знайдено.');
                }
                return;
            }

            let message
            if (event.image_url) {
                message = await safeSendPhoto(config.groupId, event.image_url, {
                    caption: formatEventMessage(event, false),
                    reply_markup: eventButtons(event.id, false),
                }, {
                    eventId: event.id
                });
            } else {
                message = await safeSendMessage(config.groupId, formatEventMessage(event, false), {
                    reply_markup: eventButtons(event.id, false)
                }, {
                    eventId: event.id
                });
            }

            await Event.update(
                { is_draft: false, telegram_message_id: message.message_id, scheduled_publish_at: null },
                { where: { id: event.id } }
            );

            await refreshEventMessage(event, false);

            if (!isScheduled) {
                await ctx.answerCbQuery('📤 Подію опубліковано!');
                await ctx.editMessageReplyMarkup(adminControlButtons(event.id, false, false, Boolean(event.scheduled_publish_at)));
            }
        } catch (err) {
            logError(`Error in publish event ID ${isScheduled ? id : parseInt(ctx.match[1])}:`, err);
            if (!isScheduled) {
                ctx.reply('❌ Не вдалося опублікувати.');
            }
        }
    }
}
