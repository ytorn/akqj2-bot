import { isUserAdminInGroup } from "../utils/isUserAdminInGroup.js";
import { Event, ChipsLog, User, RegistrationLog } from "../db.js";
import { Op } from "sequelize";
import { adminControlButtons } from "../utils/adminControlButtons.js";
import { eventItem, eventsNotFound } from "../messages/index.js";
import { getClickableName } from "../utils/getClickableName.js";
import { formatUsername } from "../utils/formatUsername.js";
import config from "../config.js";
import dayjs from "dayjs";

export const listEvents = async (ctx) => {
    if (ctx.chat.type !== 'private') return;

    const fromId = ctx.from.id;
    const isAdmin = await isUserAdminInGroup(ctx.telegram, config.groupId, fromId);
    if (!isAdmin) return ctx.reply('⛔ Admins only');

    const now = dayjs.utc().toDate();
    const twelveHours = 12 * 60 * 60 * 1000;
    const twelveHoursAgo = new Date(now.getTime() - twelveHours);

    const events = await Event.findAll({
        where: {
            [Op.or]: [
                { is_draft: true },
                {
                    is_draft: false,
                    time: { 
                        [Op.gt]: twelveHoursAgo
                    }
                }
            ]
        },
        order: [['time', 'ASC']]
    });

    if (!events.length) return ctx.reply(eventsNotFound);

    for (const event of events) {
        const isClosed = event.is_closed;

        const purchaseLogs = await ChipsLog.findAll({
            where: {
                eventId: event.id,
                is_final: false,
                confirmed: true
            },
            order: [['createdAt', 'ASC']]
        });

        const finalLogs = await ChipsLog.findAll({
            where: {
                eventId: event.id,
                is_final: true
            },
            order: [['createdAt', 'ASC']]
        });

        const allLogs = [...purchaseLogs, ...finalLogs];
        const userIds = [...new Set(allLogs.map(log => log.userId))];
        const users = await User.findAll({
            where: {
                id: { [Op.in]: userIds }
            }
        });
        const usersMap = {};
        for (const user of users) {
            usersMap[user.id] = user;
        }

        const allRegIds = [...new Set(allLogs.map(log => log.regId))];
        const registrations = await RegistrationLog.findAll({
            where: {
                id: { [Op.in]: allRegIds }
            }
        });
        const registrationsMap = {};
        for (const reg of registrations) {
            registrationsMap[reg.id] = reg;
        }

        const chipsByReg = {};
        for (const log of purchaseLogs) {
            const userId = log.userId;
            const user = usersMap[userId];
            if (!user) continue;
            
            const regId = log.regId;
            if (!chipsByReg[regId]) {
                chipsByReg[regId] = {
                    user: user,
                    regId: regId,
                    registration: registrationsMap[regId],
                    amounts: []
                };
            }
            chipsByReg[regId].amounts.push(log.amount);
        }

        const finalByReg = {};
        for (const log of finalLogs) {
            const userId = log.userId;
            const user = usersMap[userId];
            if (!user) continue;
            
            const regId = log.regId;
            if (!finalByReg[regId]) {
                finalByReg[regId] = {
                    user: user,
                    regId: regId,
                    registration: registrationsMap[regId],
                    amount: log.amount
                };
            }
        }

        let chipsInfoText = '';
        if (Object.keys(chipsByReg).length > 0) {
            chipsInfoText = '\n\n<b>Інформація про покупки:</b>\n';
            for (const regId in chipsByReg) {
                const { user, amounts, registration } = chipsByReg[regId];
                const total = amounts.reduce((sum, amount) => sum + amount, 0);
                const amountsStr = amounts.join(' + ');
                
                let displayName;
                if (registration && registration.type === 'friend') {
                    displayName = `➕ від ${formatUsername(user)} (ID ${regId})`;
                } else {
                    displayName = getClickableName(user);
                }
                
                chipsInfoText += `${displayName}: <b>${total}</b> (${amountsStr})\n`;
            }
        }

        if (Object.keys(finalByReg).length > 0) {
            chipsInfoText += '\n\n<b>Фінальний результат:</b>\n';
            for (const regId in finalByReg) {
                const { user, amount, registration } = finalByReg[regId];
                
                let displayName;
                if (registration && registration.type === 'friend') {
                    displayName = `➕ від ${formatUsername(user)} (ID ${regId})`;
                } else {
                    displayName = getClickableName(user);
                }
                
                chipsInfoText += `${displayName}: <b>${amount}</b>\n`;
            }
        }

        const eventText = eventItem(event) + chipsInfoText;

        if (event.image_url) {
            await ctx.replyWithPhoto(event.image_url, {
                caption: eventText,
                parse_mode: 'HTML',
                reply_markup: adminControlButtons(event.id, isClosed, event.is_draft, Boolean(event.scheduled_publish_at))
            });
        } else {
            await ctx.replyWithHTML(eventText, {
                reply_markup: adminControlButtons(event.id, isClosed, event.is_draft, Boolean(event.scheduled_publish_at))
            });
        }
    }
}
