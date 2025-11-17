import {ChipsLog, Event, RegistrationLog, User} from "../db.js";
import {Op} from "sequelize";
import { noOngoingEvents } from "../messages/index.js";
import dayjs from "dayjs";
import {logError} from "../utils/logError.js";
import {Scenes} from "telegraf";

export const buyChips = new Scenes.BaseScene('buy_chips', (e) => {
    console.log(e)
});

buyChips.enter(async (ctx, next) => {
    try {
        const now = dayjs.utc().toDate()
        const twelveHours = 12 * 60 * 60 * 1000;

        const event = await Event.findOne({
            where: {
                is_draft: false,
                time: {
                    [Op.between]: [
                        new Date(now.getTime() - twelveHours),
                        new Date(now.getTime() + twelveHours)
                    ]
                }
            }
        });

        if (!event) {
            return ctx.reply('❌ Не вдалося знайти активні події.');
        }

        const telegramUserId = ctx.from.id;

        let user = await User.findOne({ where: { user_id: telegramUserId } });
        if (!user) {
            logError(`❌ User not found for buying chips`);
            return ctx.reply('❌ Сталася невідома помилка.');
        }

        const registration = await RegistrationLog.findOne({
            where: {
                eventId: event.id,
                userId: user.id,
            }
        });

        if (!registration) {
            return ctx.reply(noOngoingEvents);
        }

        ctx.scene.state.event = event;
        ctx.scene.state.user = user;

        await ctx.reply('💵 Введіть кількість куплених фішок');
        return await next();
    } catch (err) {
        logError('❌ Error in buyChips.enter', err);
        return ctx.reply('❌ Сталася помилка. Спробуйте пізніше.');
    }
});

buyChips.hears(/\/buy_chips_cancel/, async (ctx) => {
    await ctx.reply('❌ Купівлю фішок скасовано.');
    return await ctx.scene.leave();
});

buyChips.on('text', async (ctx) => {
    try {
        const input = ctx.message.text;

        // Check if it's the cancel command
        if (input === '/buy_chips_cancel' || input === 'buy_chips_cancel') {
            await ctx.reply('❌ Купівлю фішок скасовано.');
            return await ctx.scene.leave();
        }

        const amount = Number(input);

        if (isNaN(amount) || amount <= 0) {
            return ctx.reply('❌ Неправильний формат. Введіть додатне число');
        }

        const { event, user } = ctx.scene.state;

        if (!event || !user) {
            logError(`❌ Event or user not found in the scene response for buying chips`);
            return ctx.reply('❌ Помилка: дані події не знайдено. Спробуйте спочатку.');
        }

        await ChipsLog.create({
            userId: user.id,
            eventId: event.id,
            amount: amount,
            confirmed: false
        });

        await ctx.reply(`✅ Запис про покупку ${amount} фішок створено.`);
        return ctx.scene.leave();
    } catch (err) {
        logError('❌ Error in buyChips text handler', err);
        return ctx.reply('❌ Сталася помилка при збереженні. Спробуйте пізніше.');
    }
});
