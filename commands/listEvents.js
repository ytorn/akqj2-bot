import { isUserAdminInGroup } from "../utils/isUserAdminInGroup.js";
import { Event } from "../db.js";
import { Op } from "sequelize";
import { adminControlButtons } from "../utils/adminControlButtons.js";
import { eventItem, eventsNotFound } from "../messages/index.js";
import config from "../config.js";

export const listEvents = async (ctx) => {
    if (ctx.chat.type !== 'private') return;

    const fromId = ctx.from.id;
    const isAdmin = await isUserAdminInGroup(ctx.telegram, config.groupId, fromId);
    if (!isAdmin) return ctx.reply('⛔ Admins only');

    const events = await Event.findAll({
        where: {
            [Op.or]: [
                { is_draft: true },
                {
                    is_draft: false,
                    time: { [Op.gt]: new Date() }
                }
            ]
        },
        order: [['time', 'ASC']]
    });

    if (!events.length) return ctx.reply(eventsNotFound);

    for (const event of events) {
        const isClosed = event.is_closed;

        if (event.image_url) {
            await ctx.replyWithPhoto(event.image_url, {
                caption: eventItem(event),
                parse_mode: 'HTML',
                reply_markup: adminControlButtons(event.id, isClosed, event.is_draft, Boolean(event.scheduled_publish_at))
            });
        } else {
            await ctx.replyWithHTML(eventItem(event), {
                reply_markup: adminControlButtons(event.id, isClosed, event.is_draft, Boolean(event.scheduled_publish_at))
            });
        }
    }
}
