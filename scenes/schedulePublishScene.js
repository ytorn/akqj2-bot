import { Scenes } from 'telegraf';
import dayjs from "dayjs";
import 'dayjs/locale/uk.js'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'
import {Event} from '../db.js';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import {logError} from "../utils/logError.js";

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat);
dayjs.locale('uk')

export const schedulePublishScene = new Scenes.BaseScene('schedule_publish', (e) => {
    console.log(e)
});

schedulePublishScene.enter(async (ctx, next) => {
    await ctx.reply('🕒 Введіть дату та час публікації (формат: YYYY-MM-DD HH:mm)');
    return await next();
});

schedulePublishScene.on('text', async (ctx) => {
    const input = ctx.message.text;
    const parsedDate = dayjs(input, 'YYYY-MM-DD HH:mm', true);

    if (!parsedDate.isValid()) {
        return ctx.reply('❌ Неправильний формат дати. Спробуйте ще раз у форматі YYYY-MM-DD HH:mm');
    }

    const { eventId } = ctx.scene.state;
    const publishAt = dayjs.tz(input, 'YYYY-MM-DD HH:mm', 'Europe/Kyiv');

    try {
        await Event.update({
            scheduled_publish_at: publishAt.utc().toDate()
        }, { where: { id: eventId } });
        await ctx.reply(`✅ Публікацію заплановано на ${parsedDate.format('dddd, DD MMMM HH:mm')}`);
    } catch (err) {
        logError('❌ DB update error:', err);
        await ctx.reply('❌ Не вдалося оновити подію в базі даних.');
    }

    await ctx.scene.leave();
});
