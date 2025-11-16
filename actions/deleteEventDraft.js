import { Event } from "../db.js";
import {logError} from "../utils/logError.js";

export const deleteEventDraft = () => {
    return async (ctx) => {
        try {
            const eventId = Number(ctx.match[1]);

            const event = await Event.findByPk(eventId);
            if (!event) {
                logError(`❌ Event not found for deleting a draft`);
                await ctx.answerCbQuery('❌ Подію не знайдено');
                return;
            }

            ctx.deleteMessage()
            await event.destroy();
            await ctx.answerCbQuery(`✅ Драфт видалено`);
        } catch (err) {
            logError('❌ Error in deleting event draft', err);
        }
    }
}
