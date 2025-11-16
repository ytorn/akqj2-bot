import {Scenes} from 'telegraf';
import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'
import {Event, Group} from "../db.js";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import {eventPreview} from "../messages/index.js";
import {logError} from "../utils/logError.js";
import config from "../config.js";

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat);

export const createEventWizard = new Scenes.WizardScene(
    'create_event',
    async (ctx) => {
        if (!ctx.chat || ctx.chat.type !== 'private') {
            await ctx.reply('❌ Please create events in private DM with me.');
            return ctx.scene.leave();
        }

        ctx.wizard.state.data = { user_id: ctx.from.id };

        await ctx.reply('🏁 Введіть назву події:');
        return ctx.wizard.next();
    },
    async (ctx) => {
        ctx.wizard.state.data.name = ctx.message.text;

        await ctx.reply('📍 Введіть локацію:');
        return ctx.wizard.next();
    },
    async (ctx) => {
        ctx.wizard.state.data.location = ctx.message.text;

        await ctx.reply('⏰ Введіть дату (формат: YYYY-MM-DD HH:mm)');
        return ctx.wizard.next();
    },
    async (ctx) => {
        const dateInput = ctx.message.text;

        const parsedDate = dayjs(dateInput, 'YYYY-MM-DD HH:mm', true);

        if (!parsedDate.isValid()) {
            return ctx.reply('❌ Неправильний формат дати. Спробуйте ще раз у форматі YYYY-MM-DD HH:mm');
        }

        ctx.wizard.state.data.time = dateInput

        await ctx.reply('👥 Введіть кількість гравців:');
        return ctx.wizard.next();
    },
    async (ctx) => {
        ctx.wizard.state.data.players = parseInt(ctx.message.text) || 0;
        await ctx.reply('💵 Введіть мінімальний бай-ін:');
        return ctx.wizard.next();
    },
    async (ctx) => {
        ctx.wizard.state.data.buyin = parseInt(ctx.message.text) || 0;
        await ctx.reply('📝 Введіть опис:');
        return ctx.wizard.next();
    },
    async (ctx) => {
        ctx.wizard.state.data.description = ctx.message.text;

        await ctx.reply('Хочеш додати зображення до події? Надішли фото або натисни "Пропустити".', {
            reply_markup: {
                keyboard: [['Пропустити']],
                resize_keyboard: true,
                one_time_keyboard: true,
            },
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.message?.photo) {
            const photoArray = ctx.message.photo;
            const bestPhoto = photoArray[photoArray.length - 1];
            ctx.wizard.state.data.image_url = bestPhoto.file_id;
        } else if (ctx.message?.text?.toLowerCase() === 'пропустити') {

        } else {
            return ctx.reply('Надішли фото або натисни "Пропустити".');
        }

        let group = await Group.findOne({ where: { telegram_chat_id: config.groupId } });

        if (!group) {
            try {
                group = await Group.create({
                    telegram_chat_id: config.groupId,
                    title: 'AKQJ2 Poker Club'
                });
            } catch (e) {
                if (e.name === 'SequelizeUniqueConstraintError') {
                    group = await Group.findOne({ where: { telegram_chat_id: config.groupId } });
                } else {
                    throw e;
                }
            }
        }

        try {
            await Event.create({
                ...ctx.wizard.state.data,
                time: dayjs.tz(ctx.wizard.state.data.time, 'YYYY-MM-DD HH:mm', 'Europe/Kyiv').utc().format(),
                groupId: group.id,
                is_draft: true
            });
        } catch (err) {
            logError('Failed to create event:', err);
        }

        const preview = ctx.wizard.state.data;

        const message = eventPreview(preview)

        if (preview.image_url) {
            await ctx.replyWithPhoto(preview.image_url, {
                caption: message,
                parse_mode: 'HTML',
                reply_markup: {
                    remove_keyboard: true
                }
            });
        } else {
            await ctx.replyWithHTML(message, {
                reply_markup: {
                    remove_keyboard: true
                }
            })
        }

        return ctx.scene.leave();
    }
);

createEventWizard.command('cancel', async (ctx) => {
    await ctx.reply('❌ Створення події скасовано.');
    return await ctx.scene.leave();
});
