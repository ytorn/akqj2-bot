import { ChipsLog, User } from "../db.js";
import { logError } from "../utils/logError.js";
import { isUserAdminInGroup } from "../utils/isUserAdminInGroup.js";
import config from "../config.js";
import { safeSendMessage } from "../services/safeSend.js";
import { chipRequestConfirmed } from "../messages/index.js";

export const confirmChipRequest = () => {
    return async (ctx) => {
        try {
            const fromId = ctx.from.id;
            const isAdmin = await isUserAdminInGroup(ctx.telegram, config.groupId, fromId);
            if (!isAdmin) {
                await ctx.answerCbQuery('⛔ Тільки адміністратори можуть підтверджувати заявки.');
                return;
            }

            const chipsLogId = parseInt(ctx.match[1]);
            const chipsLog = await ChipsLog.findByPk(chipsLogId);

            if (!chipsLog) {
                await ctx.answerCbQuery('❌ Заявку не знайдено.');
                return;
            }

            if (chipsLog.confirmed) {
                await ctx.answerCbQuery('✅ Заявка вже підтверджена.');
                return;
            }

            chipsLog.confirmed = true;
            await chipsLog.save();

            await ctx.answerCbQuery('✅ Заявку підтверджено.');
            
            try {
                await ctx.editMessageReplyMarkup({
                    inline_keyboard: [[
                        { text: '✅ Підтверджено', callback_data: 'chips_already_confirmed' }
                    ]]
                });
            } catch (err) {
                logError('❌ Error in confirming chip request', err);
            }

            const user = await User.findByPk(chipsLog.userId);
            if (user && user.user_id) {
                try {
                    await safeSendMessage(
                        user.user_id,
                        chipRequestConfirmed(chipsLog.amount),
                        {},
                        {}
                    );
                } catch (err) {
                    logError('❌ Failed to notify user about chip request confirmation:', err);
                }
            }
        } catch (err) {
            logError('❌ Error confirming chip request:', err);
            await ctx.answerCbQuery('❌ Сталася помилка при підтвердженні.');
        }
    }
}

