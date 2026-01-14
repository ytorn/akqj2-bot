import {ChipsLog, Event, RegistrationLog, User} from "../db.js";
import {Op} from "sequelize";
import dayjs from "dayjs";
import {logError} from "../utils/logError.js";
import {Scenes} from "telegraf";
import {isUserAdminInGroup} from "../utils/isUserAdminInGroup.js";
import config from "../config.js";
import {formatUsername} from "../utils/formatUsername.js";

export const finalCount = new Scenes.BaseScene('final_count');

finalCount.enter(async (ctx) => {
    try {
        const fromId = ctx.from.id;
        const isAdmin = await isUserAdminInGroup(ctx.telegram, config.groupId, fromId);
        if (!isAdmin) {
            await ctx.reply('⛔ Команда доступна тільки адміністраторам.');
            return await ctx.scene.leave();
        }

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
                callback_data: `final_count_event_${event.id}`
            }];
        });

        eventButtons.push([{
            text: '❌ Скасувати',
            callback_data: 'final_count_cancel'
        }]);

        await ctx.reply('📅 Оберіть подію:', {
            reply_markup: {
                inline_keyboard: eventButtons
            }
        });
    } catch (err) {
        logError('❌ Error in finalCount.enter', err);
        await ctx.reply('❌ Сталася помилка. Спробуйте пізніше.');
        return await ctx.scene.leave();
    }
});

const renderPlayersPage = async (ctx, event, registrations, usersMap, page = 0) => {
    const playersPerPage = 6;
    const totalPages = Math.ceil(registrations.length / playersPerPage);
    const startIndex = page * playersPerPage;
    const endIndex = Math.min(startIndex + playersPerPage, registrations.length);
    const pageRegistrations = registrations.slice(startIndex, endIndex);

    const playerButtons = [];
    const buttonsPerRow = 2;
    
    for (let i = 0; i < pageRegistrations.length; i += buttonsPerRow) {
        const row = pageRegistrations.slice(i, i + buttonsPerRow).map(reg => {
            const user = usersMap[reg.userId];
            if (!user) return null;
            
            const userName = formatUsername(user);
            let displayName;

            if (reg.type === 'friend') {
                displayName = `➕ від ${userName} (ID ${reg.id})`;
            } else {
                displayName = userName;
            }

            if (displayName.length > 30) {
                displayName = displayName.substring(0, 27) + '...';
            }

            return {
                text: displayName,
                callback_data: `final_count_player_${event.id}_${reg.userId}_${reg.id}`
            };
        }).filter(btn => btn !== null);
        
        if (row.length > 0) {
            playerButtons.push(row);
        }
    }

    const paginationButtons = [];
    if (totalPages > 1) {
        if (page > 0 && page < totalPages - 1) {
            paginationButtons.push([
                {
                    text: '◀️ Попередня',
                    callback_data: `final_count_page_${event.id}_${page - 1}`
                },
                {
                    text: 'Наступна ▶️',
                    callback_data: `final_count_page_${event.id}_${page + 1}`
                }
            ]);
        } else if (page > 0) {
            paginationButtons.push([
                {
                    text: '◀️ Попередня',
                    callback_data: `final_count_page_${event.id}_${page - 1}`
                }
            ]);
        } else if (page < totalPages - 1) {
            paginationButtons.push([
                {
                    text: 'Наступна ▶️',
                    callback_data: `final_count_page_${event.id}_${page + 1}`
                }
            ]);
        }
    }

    const navButtons = [
        {
            text: '⬅️ Назад',
            callback_data: 'final_count_back_to_events'
        },
        {
            text: '❌ Скасувати',
            callback_data: 'final_count_cancel'
        }
    ];

    if (paginationButtons.length > 0) {
        playerButtons.push(...paginationButtons);
    }
    playerButtons.push(navButtons);

    await ctx.editMessageText(`👥 Оберіть гравця:${totalPages > 1 ? ` (сторінка ${page + 1}/${totalPages})` : ''}`, {
        reply_markup: {
            inline_keyboard: playerButtons
        }
    });
};

finalCount.action(/^final_count_event_(\d+)$/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        
        const eventId = parseInt(ctx.match[1]);
        const event = await Event.findByPk(eventId);

        if (!event) {
            await ctx.reply('❌ Подію не знайдено.');
            return await ctx.scene.leave();
        }

        const registrations = await RegistrationLog.findAll({
            where: {
                eventId: event.id,
                is_waiting: false,
                type: { [Op.in]: ['join', 'friend'] }
            },
            order: [['join_time', 'ASC']]
        });

        if (!registrations || registrations.length === 0) {
            await ctx.reply('❌ Не знайдено активних гравців для цієї події.');
            return await ctx.scene.leave();
        }

        const userIds = [...new Set(registrations.map(reg => reg.userId))];
        const users = await User.findAll({
            where: {
                id: { [Op.in]: userIds }
            }
        });

        const usersMap = {};
        for (const user of users) {
            usersMap[user.id] = user;
        }

        ctx.scene.state.event = event;
        ctx.scene.state.registrations = registrations;
        ctx.scene.state.usersMap = usersMap;

        await renderPlayersPage(ctx, event, registrations, usersMap, 0);
    } catch (err) {
        logError('❌ Error in finalCount event selection', err);
        await ctx.reply('❌ Сталася помилка. Спробуйте пізніше.');
        return await ctx.scene.leave();
    }
});

finalCount.action(/^final_count_page_(\d+)_(\d+)$/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        
        const eventId = parseInt(ctx.match[1]);
        const page = parseInt(ctx.match[2]);

        const { event, registrations, usersMap } = ctx.scene.state;

        if (!event || !registrations || !usersMap || event.id !== eventId) {
            await ctx.reply('❌ Помилка: дані не знайдено. Спробуйте спочатку.');
            return await ctx.scene.leave();
        }

        await renderPlayersPage(ctx, event, registrations, usersMap, page);
    } catch (err) {
        logError('❌ Error in finalCount pagination', err);
        await ctx.reply('❌ Сталася помилка. Спробуйте пізніше.');
        return await ctx.scene.leave();
    }
});

finalCount.action('final_count_back_to_events', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        
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
            await ctx.editMessageText('❌ Не вдалося знайти активні події.', {
                reply_markup: { inline_keyboard: [] }
            });
            return await ctx.scene.leave();
        }

        const eventButtons = events.map(event => {
            return [{
                text: event.name,
                callback_data: `final_count_event_${event.id}`
            }];
        });

        eventButtons.push([{
            text: '❌ Скасувати',
            callback_data: 'final_count_cancel'
        }]);

        await ctx.editMessageText('📅 Оберіть подію:', {
            reply_markup: {
                inline_keyboard: eventButtons
            }
        });

        ctx.scene.state.event = null;
        ctx.scene.state.user = null;
        ctx.scene.state.regId = null;
    } catch (err) {
        logError('❌ Error going back to events', err);
        return await ctx.scene.leave();
    }
});

finalCount.action(/^final_count_player_(\d+)_(\d+)_(\d+)$/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        
        const eventId = parseInt(ctx.match[1]);
        const userId = parseInt(ctx.match[2]);
        const regId = parseInt(ctx.match[3]);

        const event = await Event.findByPk(eventId);
        const user = await User.findByPk(userId);

        if (!event || !user) {
            await ctx.reply('❌ Подію або гравця не знайдено.');
            return await ctx.scene.leave();
        }

        ctx.scene.state.event = event;
        ctx.scene.state.user = user;
        ctx.scene.state.regId = regId;

        const userName = formatUsername(user);

        await ctx.editMessageText(
            `💵 Введіть фінальну кількість фішок для гравця ${userName}:`,
            { reply_markup: { inline_keyboard: [] } }
        );
    } catch (err) {
        logError('❌ Error in finalCount player selection', err);
        await ctx.reply('❌ Сталася помилка. Спробуйте пізніше.');
        return await ctx.scene.leave();
    }
});

finalCount.action('final_count_cancel', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        await ctx.editMessageText('❌ Введення фінального результату скасовано.', {
            reply_markup: { inline_keyboard: [] }
        });
        return await ctx.scene.leave();
    } catch (err) {
        logError('❌ Error canceling final count', err);
        return await ctx.scene.leave();
    }
});

finalCount.hears(/\/final_count_cancel/, async (ctx) => {
    await ctx.reply('❌ Введення фінального результату скасовано.');
    return await ctx.scene.leave();
});

finalCount.on('text', async (ctx) => {
    try {
        const input = ctx.message.text.trim();

        if (input === '/final_count_cancel' || input === 'final_count_cancel') {
            await ctx.reply('❌ Введення фінального результату скасовано.');
            return await ctx.scene.leave();
        }

        const { event, user, regId } = ctx.scene.state;
        if (!event || !user || !regId) {
            await ctx.reply('❌ Будь ласка, спочатку оберіть подію та гравця через кнопки.');
            return;
        }

        const amount = Number(input);

        if (isNaN(amount) || amount < 0 || !Number.isInteger(amount)) {
            return await ctx.reply('❌ Неправильний формат. Введіть ціле число, що дорівнює або більше нуля');
        }

        await ChipsLog.create({
            userId: user.id,
            eventId: event.id,
            regId: regId,
            amount: amount,
            confirmed: false,
            is_final: true
        });

        const userName = formatUsername(user);
        await ctx.reply(`✅ Фінальний результат ${amount} фішок для ${userName} збережено.`);
        return await ctx.scene.leave();
    } catch (err) {
        logError('❌ Error in finalCount text handler', err);
        await ctx.reply('❌ Сталася помилка при збереженні. Спробуйте пізніше.');
        return await ctx.scene.leave();
    }
});

