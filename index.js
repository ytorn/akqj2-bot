import { Telegraf, Scenes, session } from 'telegraf';
import 'dotenv/config';
import express from 'express';
import cron from 'node-cron';
import basicAuth from "express-basic-auth";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import Database from "better-sqlite3";
import fs from 'fs';
import path from 'path';
import {User, Group} from './db.js';
import {logError} from "./utils/logError.js";
import config from "./config.js";
import {voteForEvent} from "./actions/voteForEvent.js";
import {createEventWizard} from "./scenes/createEventWizard.js";
import {schedulePublishScene} from "./scenes/schedulePublishScene.js";
import {buyChips} from "./scenes/buyChips.js";
import {finalCount} from "./scenes/finalCount.js";
import {welcome} from "./messages/index.js";
import {updateUserCommands} from "./utils/commandsMenu.js";
import {isUserAdminInGroup} from "./utils/isUserAdminInGroup.js";
import {listEvents} from "./commands/listEvents.js";
import {publishEvent} from "./actions/publishEvent.js";
import {toggleEventStatus} from "./actions/toggleEventStatus.js";
import {deleteEventDraft} from "./actions/deleteEventDraft.js";
import {schedulePublish} from "./actions/schedulePublish.js";
import {confirmChipRequest} from "./actions/confirmChipRequest.js";
import {declineChipRequest} from "./actions/declineChipRequest.js";
import {schedulePost} from "./cronJobs/schedulePost.js";
import {requestChips} from "./scenes/requestChips.js";
import {apiRouter} from "./routes/api.js";
import cors from 'cors';

dayjs.extend(utc)

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const app = express();

app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());

const adminUsers = {};
if (config.adminApiUser && config.adminApiPassword) {
    adminUsers[config.adminApiUser] = config.adminApiPassword;
} else {
    adminUsers.pokerBotTesting = "AKQJ2_Testing_2025";
}
const auth = basicAuth({
    users: adminUsers,
    challenge: true,
});
app.use("/admin", auth);
app.use("/api", auth, apiRouter);

const db = new Database("eventbot.sqlite");
const bot = new Telegraf(config.botToken);

const stage = new Scenes.Stage([createEventWizard, schedulePublishScene, buyChips, requestChips, finalCount]);

bot.use(session());
bot.use(stage.middleware());

bot.start(async (ctx) => {
    if (ctx.chat.type !== 'private') return;

    const [user, created] = await User.findOrCreate({
        where: { user_id: String(ctx.from.id) },
        defaults: {
            first_name: ctx.from.first_name || '',
            last_name: ctx.from.last_name || '',
            username: ctx.from.username || '',
            is_subscribed: true
        }
    });

    if (!created && !user.is_subscribed) {
        user.is_subscribed = true;
        await user.save();
    }

    ctx.reply(welcome(user), { parse_mode: 'HTML' });

    await updateUserCommands(ctx.from.id, ctx.chat.id, ctx.telegram);
});

bot.command('create_event', async (ctx) => {
    const fromId = ctx.from.id;
    const isAdmin = await isUserAdminInGroup(ctx.telegram, config.groupId, fromId);
    if (!isAdmin) return ctx.reply('⛔ Admins only');

    return ctx.scene.enter('create_event')
});

bot.on('message', async (ctx, next) => {
    if (ctx.chat.type.includes('group')) {
        try {
            const [group, created] = await Group.findOrCreate({
                where: { telegram_chat_id: ctx.chat.id },
                defaults: { title: ctx.chat.title }
            });

            if (!created && group.title !== ctx.chat.title) {
                group.title = ctx.chat.title;
                await group.save();
            }
        } catch (err) {
            logError('Group tracking error:', err);
        }
    }

    return await next();
});

bot.command('list_events', listEvents);

bot.action(/publish_(\d+)/, async (ctx) => {
    await publishEvent({ isScheduled: false, id: null })(ctx);
});

bot.action(/vote_(\w+)_(\d+)/, async (ctx) => {
    await voteForEvent()(ctx);
});

bot.action(/event_status_(\w+)_(\d+)/, async (ctx) => {
    await toggleEventStatus()(ctx);
});

bot.action(/event_delete_(\d+)/, async (ctx) => {
    await deleteEventDraft()(ctx);
});

bot.action(/event_schedule_(\w+)_(\d+)/, async (ctx) => {
    await schedulePublish()(ctx);
});

bot.action(/^chips_confirm_(\d+)$/, async (ctx) => {
    await confirmChipRequest()(ctx);
});

bot.action(/^chips_decline_(\d+)$/, async (ctx) => {
    await declineChipRequest()(ctx);
});

bot.action(/^chips_already_(confirmed|declined)$/, async (ctx) => {
    await ctx.answerCbQuery();
});

bot.command('buy_chips', async (ctx) => {
    return ctx.scene.enter('buy_chips')
});

bot.command('buy_chips_cancel', async (ctx) => {
    if (ctx.scene && ctx.scene.current && ctx.scene.current.id === 'buy_chips') {
        await ctx.reply('❌ Купівлю фішок скасовано.');
        return await ctx.scene.leave();
    }
});

bot.command('request_chips', async (ctx) => {
    return ctx.scene.enter('request_chips')
});

bot.command('request_chips_cancel', async (ctx) => {
    if (ctx.scene && ctx.scene.current && ctx.scene.current.id === 'request_chips') {
        await ctx.reply('❌ Запит на покупку фішок скасовано.');
        return await ctx.scene.leave();
    }
});

bot.command('final_count', async (ctx) => {
    return ctx.scene.enter('final_count')
});

bot.catch(async (err, ctx) => {
    logError('❌ Global bot error:', err);

    try {
        // Only answer callback queries when available
        if (ctx && typeof ctx.answerCbQuery === 'function' && ctx.callbackQuery) {
            await ctx.answerCbQuery('Сталася невідома помилка');
        } else if (ctx && typeof ctx.reply === 'function' && ctx.chat && ctx.chat.type === 'private') {
            // For regular messages in private chat, send a generic error reply
            await ctx.reply('❌ Сталася невідома помилка. Спробуйте пізніше.');
        }
    } catch (innerErr) {
        logError('❌ Error while handling global bot error:', innerErr);
    }
});

process.on('unhandledRejection', (reason) => {
    logError('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    logError('❌ Uncaught Exception:', err);
});

cron.schedule('* * * * *', async () => {
    await schedulePost()
});

app.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}.`);
});

bot.launch();

export default bot

console.log('✅ Bot running');
