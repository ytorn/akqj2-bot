import { Event, RegistrationLog, User } from "../db.js";
import {logError} from "../utils/logError.js";
import {withLock} from "../lock.js";
import {Op} from "sequelize";
import {refreshEventMessage} from "../utils/refreshEventMessage.js";

export const voteForEvent = () => {
    return async (ctx) => {
        try {
            const tgUser = ctx.update.callback_query.from;
            const type = ctx.match[1];
            const eventId = Number(ctx.match[2]);

            const event = await Event.findByPk(eventId);
            if (!event) {
                logError(`❌ Event not found for voting`);
                await ctx.answerCbQuery('❌ Подію не знайдено');
                return;
            }

            let user = await User.findOne({ where: { user_id: tgUser.id}});
            if (!user) {
                user = await User.create({
                    user_id: tgUser.id,
                    first_name: tgUser.first_name || '',
                    username: tgUser.username || ''
                });
            }

            const friendEvents = ['friend', 'remove']

            const lockKey = `vote_lock_${eventId}_${user.id}`;

            const result = await withLock(lockKey, async () => {
                const existingLog = await RegistrationLog.findOne({
                    where: {
                        eventId: event.id,
                        userId: user.id,
                        type: {
                            [Op.in]: ['join', 'not', 'maybe']
                        }
                    }
                });

                if (existingLog && !friendEvents.includes(type)) {
                    if (existingLog.type === type) {
                        return 'already-answered';
                    }

                    await existingLog.update({
                        type,
                        join_time: new Date()
                    });
                } else {
                    if (type === 'remove') {
                        const latestFriendAdded = await RegistrationLog.findOne({
                            where: { eventId: event.id, userId: user.id, type: 'friend' },
                            order: [['createdAt', 'DESC']]
                        });

                        if (latestFriendAdded) {
                            await latestFriendAdded.destroy();
                        } else {
                            return 'nothing-to-remove';
                        }
                    } else {
                        const registrationPosition = await RegistrationLog.count({
                            where: {
                                eventId: event.id,
                                type: ['join', 'friend']
                            }
                        });
                        const isInWaitList = Number(registrationPosition) > Number(event.players);

                        await RegistrationLog.create({
                            eventId: event.id,
                            userId: user.id,
                            type,
                            join_time: new Date(),
                            is_waiting: isInWaitList
                        });
                    }
                }

                await refreshEventMessage(event, event.is_closed);

                return 'ok';
            });

            if (result === 'already-answered') {
                return ctx.answerCbQuery('✅ Твоя відповідь уже врахована!');
            }

            if (result === 'nothing-to-remove') {
                return ctx.answerCbQuery('Ти ще не додав друзів');
            }

            return await ctx.answerCbQuery(`Ти натиснув ${
                type === 'join' ? '✅'
                    : type === 'not' ? '❌'
                        : type === 'maybe' ? '🤔'
                            : type === 'friend' ? '➕'
                                : '➖'
            }`);
        } catch (err) {
            logError('❌ Error in voting for the event', err);
        }
    }
}
