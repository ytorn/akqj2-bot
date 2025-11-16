import { Event } from "../db.js";
import {logError} from "../utils/logError.js";
import {safeEditCaption} from "../services/safeEditCaption.js";
import {safeEditMessage} from "../services/safeEditMessage.js";
import {eventItem} from "../messages/index.js";
import {adminControlButtons} from "../utils/adminControlButtons.js";

export const schedulePublish = () => {
    return async (ctx) => {
        try {
            const type = ctx.match[1];
            const eventId = Number(ctx.match[2]);

            if (type !== 'on' && type !== 'off') {
                await ctx.answerCbQuery('❌ Помилка запиту');
                return;
            }

            const event = await Event.findByPk(eventId);
            if (!event) {
                logError(`❌ Event not found for deleting a draft`);
                await ctx.answerCbQuery('❌ Подію не знайдено');
                return;
            }

            const isScheduled = type === 'on'

            try {
                if (isScheduled) {
                    await ctx.answerCbQuery()
                    await ctx.scene.enter('schedule_publish', {
                        eventId: event.id,
                    });
                } else {
                    await Event.update({ scheduled_publish_at: null }, { where: { id: event.id } });
                    await ctx.answerCbQuery('✅ Заплановану публікацію скасовано');
                }

                if (event.image_url) {
                    await safeEditCaption(
                        ctx.update.callback_query.message.chat.id,
                        ctx.update.callback_query.message.message_id,
                        eventItem(event),
                        adminControlButtons(event.id, false, true, isScheduled, true)
                    )
                } else {
                    await safeEditMessage(
                        ctx.update.callback_query.message.chat.id,
                        ctx.update.callback_query.message.message_id,
                        eventItem(event),
                        adminControlButtons(event.id, false, true, isScheduled, true)
                    );
                }
            } catch (err) {
                logError('Error in scheduled publish:', err, user.id);
                ctx.reply('❌ Не вдалося запланувати публікацію.');
            }
        } catch (err) {
            logError('❌ Error in voting for the event', err);
        }
    }
}
