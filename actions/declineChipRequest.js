import { ChipsLog, User } from "../db.js";
import { logError } from "../utils/logError.js";
import { isUserAdminInGroup } from "../utils/isUserAdminInGroup.js";
import config from "../config.js";
import { safeSendMessage } from "../services/safeSend.js";
import { chipRequestDeclined } from "../messages/index.js";

export const declineChipRequest = () => {
    return async (ctx) => {
        try {
            const fromId = ctx.from.id;
            const isAdmin = await isUserAdminInGroup(ctx.telegram, config.groupId, fromId);
            if (!isAdmin) {
                await ctx.answerCbQuery('⛔ Тільки адміністратори можуть відхиляти заявки.');
                return;
            }

            const chipsLogId = parseInt(ctx.match[1]);
            const chipsLog = await ChipsLog.findByPk(chipsLogId);

            if (!chipsLog) {
                await ctx.answerCbQuery('❌ Заявку не знайдено.');
                return;
            }

            if (chipsLog.confirmed) {
                await ctx.answerCbQuery('⚠️ Заявка вже підтверджена.');
                return;
            }

            await ctx.answerCbQuery('❌ Заявку відхилено.');

            try {
                await ctx.editMessageReplyMarkup({
                    inline_keyboard: [[
                        { text: '❌ Відхилено', callback_data: 'chips_already_declined' }
                    ]]
                });
            } catch (err) {
                logError('❌ Error in declining chip request', err);
            }

            const user = await User.findByPk(chipsLog.userId);
            if (user && user.user_id) {
                try {
                    await safeSendMessage(
                        user.user_id,
                        chipRequestDeclined(chipsLog.amount),
                        {},
                        {}
                    );
                } catch (err) {
                    logError('❌ Failed to notify user about chip request decline:', err);
                }
            }
        } catch (err) {
            logError('❌ Error declining chip request:', err);
            await ctx.answerCbQuery('❌ Сталася помилка при відхиленні.');
        }
    }
}

