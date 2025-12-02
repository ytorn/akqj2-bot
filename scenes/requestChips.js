import {ChipsLog, Event, RegistrationLog, User} from "../db.js";
import {Op} from "sequelize";
import dayjs from "dayjs";
import {logError} from "../utils/logError.js";
import {Scenes} from "telegraf";
import {notifyAdmins} from "../utils/notifyAdmins.js";

export const requestChips = new Scenes.BaseScene('request_chips');

requestChips.enter(async (ctx) => {
    try {
        const now = dayjs.utc().toDate();
        const twelveHours = 12 * 60 * 60 * 1000;

        const events = await Event.findAll({
            where: {
                is_draft: false,
                time: {
                    [Op.between]: [
                        new Date(now.getTime() - twelveHours),
                        new Date(now.getTime() + twelveHours)
                    ]
                }
            },
            order: [['time', 'ASC']]
        });

        if (!events || events.length === 0) {
            await ctx.reply('❌ Не вдалося знайти активні події.');
            return await ctx.scene.leave();
        }

        const eventButtons = events.map(event => {
            return [{
                text: event.name,
                callback_data: `request_chips_event_${event.id}`
            }];
        });

        eventButtons.push([{
            text: '❌ Скасувати',
            callback_data: 'request_chips_cancel'
        }]);

        await ctx.reply('📅 Оберіть подію:', {
            reply_markup: {
                inline_keyboard: eventButtons
            }
        });
    } catch (err) {
        logError('❌ Error in requestChips.enter', err);
        await ctx.reply('❌ Сталася помилка. Спробуйте пізніше.');
        return await ctx.scene.leave();
    }
});

requestChips.action(/^request_chips_event_(\d+)$/, async (ctx) => {
    try {
        const fromId = ctx.from.id;
        console.log(fromId)

        await ctx.answerCbQuery();

        const eventId = parseInt(ctx.match[1]);
        const event = await Event.findByPk(eventId);

        if (!event) {
            await ctx.reply('❌ Подію не знайдено.');
            return await ctx.scene.leave();
        }

        let user = await User.findOne({ where: { user_id: fromId }});

        if (!user) {
            await ctx.reply('❌ Користувача не знайдено.');
            return await ctx.scene.leave();
        }

        const registration = await RegistrationLog.findOne({
            where: {
                eventId: event.id,
                user_id: user.id,
                is_waiting: false,
                type: { [Op.in]: ['join', 'friend'] }
            }
        });

        if (!registration) {
            await ctx.reply('❌ Не вдалося знайти вашу реєстрацію на цю подію.');
            return await ctx.scene.leave();
        }

        ctx.scene.state.event = event;
        ctx.scene.state.regId = registration.id;
        ctx.scene.state.user = user;

        await ctx.editMessageText(
            `💵 Введіть кількість фішок, які хочете купити:`,
            { reply_markup: { inline_keyboard: [] } }
        );
    } catch (err) {
        logError('❌ Error in requestChips event selection', err);
        await ctx.reply('❌ Сталася помилка. Спробуйте пізніше.');
        return await ctx.scene.leave();
    }
});

requestChips.action('request_chips_cancel', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        await ctx.editMessageText('❌ Запит на покупку фішок скасовано.', {
            reply_markup: { inline_keyboard: [] }
        });
        return await ctx.scene.leave();
    } catch (err) {
        logError('❌ Error canceling request chips', err);
        return await ctx.scene.leave();
    }
});

requestChips.hears(/\/request_chips_cancel/, async (ctx) => {
    await ctx.reply('❌ Запит на покупку фішок скасовано.');
    return await ctx.scene.leave();
});

requestChips.on('text', async (ctx) => {
    try {
        const input = ctx.message.text.trim();

        if (input === '/request_chips_cancel' || input === 'request_chips_cancel') {
            await ctx.reply('❌ Запит на покупку фішок скасовано.');
            return await ctx.scene.leave();
        }

        const { event, user, regId } = ctx.scene.state;

        if (!event || !user || !regId) {
            await ctx.reply('❌ Помилка даних.');
            return;
        }

        const amount = Number(input);

        if (isNaN(amount) || amount <= 0 || !Number.isInteger(amount)) {
            return await ctx.reply('❌ Неправильний формат. Введіть додатне ціле число');
        }

        await ChipsLog.create({
            userId: user.id,
            eventId: event.id,
            regId: regId,
            amount: amount,
            confirmed: false,
            is_final: false
        });

        await ctx.reply(`✅ Заявка на покупку ${amount} фішок створена.`);
        return await ctx.scene.leave();
    } catch (err) {
        logError('❌ Error in buyChips text handler', err);
        await ctx.reply('❌ Сталася помилка при збереженні. Спробуйте пізніше.');
        return await ctx.scene.leave();
    }
});
