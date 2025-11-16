import { Event } from "../db.js";
import {logError} from "../utils/logError.js";
import {refreshEventMessage} from "../utils/refreshEventMessage.js";
import {adminControlButtons} from "../utils/adminControlButtons.js";

export const toggleEventStatus = () => {
    return async (ctx) => {
        try {
            const type = ctx.match[1];
            const eventId = Number(ctx.match[2]);

            const event = await Event.findByPk(eventId);
            if (!event) {
                logError(`❌ Event not found for voting`);
                await ctx.answerCbQuery('❌ Подію не знайдено');
                return;
            }

            const isCloseAction = type === 'close';

            event.is_closed = isCloseAction;
            await event.save();

            if (event.telegram_message_id) {
                await refreshEventMessage(event, isCloseAction);
            }
            await ctx.answerCbQuery(`✅ Реєстрація ${isCloseAction ? 'закрита' : 'відкрита'}`);
            await ctx.editMessageReplyMarkup(adminControlButtons(event.id, isCloseAction, event.is_draft, Boolean(event.scheduled_publish_at)));
        } catch (err) {
            logError('❌ Error in changing event status', err);
        }
    }
}
