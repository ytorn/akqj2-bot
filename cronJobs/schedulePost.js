import { Event } from "../db.js";
import { Op } from "sequelize";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import { publishEvent } from "../actions/publishEvent.js";
import {logError} from "../utils/logError.js";

dayjs.extend(utc)

export const schedulePost = async () => {
    try {
        const now = dayjs.utc().toDate()

        const scheduledPosts = await Event.findAll({
            where: {
                is_draft: true,
                scheduled_publish_at: {
                    [Op.lte]: now
                }
            }
        });

        for (const event of scheduledPosts) {
            await publishEvent({ isScheduled: true, id: event.id })()
        }
    } catch (err) {
        logError('❌ Failed to publish scheduled event', err);
    }
}
