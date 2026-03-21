import { Router } from 'express';
import { User, Event, RegistrationLog, ChipsLog, Group, sequelize } from '../db.js';
import { Op } from 'sequelize';
import { logError } from '../utils/logError.js';

export const apiRouter = Router();

const parseId = (value) => {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
};

const normalizeOptionalInt = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
};

const parsePlayerIds = (playerIds) => {
    if (!Array.isArray(playerIds)) return null;
    const ids = [...new Set(playerIds.map((v) => parseInt(v, 10)).filter((v) => !Number.isNaN(v)))];
    return ids;
};

const toSafeInt = (value) => {
    const parsed = parseInt(value ?? 0, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
};

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

const parsePagination = (query) => {
    let page = parseInt(query.page, 10);
    if (Number.isNaN(page) || page < 1) page = 1;

    let limit = parseInt(query.limit, 10);
    if (Number.isNaN(limit) || limit < 1) limit = DEFAULT_PAGE_LIMIT;
    if (limit > MAX_PAGE_LIMIT) limit = MAX_PAGE_LIMIT;

    const offset = (page - 1) * limit;
    return { page, limit, offset };
};

/** GET /api/users - list users (paginated: ?page=1&limit=20) */
apiRouter.get('/users', async (req, res) => {
    try {
        const { page, limit, offset } = parsePagination(req.query);
        const total = await User.count();
        const users = await User.findAll({
            order: [['id', 'ASC']],
            limit,
            offset,
        });
        const data = users.map((u) => u.get({ plain: true }));
        const totalPages = Math.ceil(total / limit) || 1;
        res.json({
            users: data,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
            },
        });
    } catch (err) {
        logError('API GET /users error', err);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

/** GET /api/users/search?q=... - search users by name/tg id/username/@username */
apiRouter.get('/users/search', async (req, res) => {
    try {
        const rawQuery = String(req.query.q ?? '').trim();
        if (!rawQuery) {
            return res.status(400).json({ error: 'q query param is required' });
        }

        const normalizedQuery = rawQuery.startsWith('@') ? rawQuery.slice(1) : rawQuery;
        const maybeTelegramId = parseInt(normalizedQuery, 10);
        const isTelegramIdQuery = !Number.isNaN(maybeTelegramId) && String(maybeTelegramId) === normalizedQuery;

        const where = {
            [Op.or]: [
                { first_name: { [Op.like]: `%${normalizedQuery}%` } },
                { last_name: { [Op.like]: `%${normalizedQuery}%` } },
                { username: { [Op.like]: `%${normalizedQuery}%` } },
            ],
        };

        if (isTelegramIdQuery) {
            where[Op.or].push({ user_id: String(maybeTelegramId) });
        }

        const users = await User.findAll({
            where,
            attributes: ['id', 'first_name', 'last_name', 'username', 'user_id'],
            order: [['id', 'DESC']],
            limit: 20,
        });

        const data = users.map((u) => {
            const plain = u.get({ plain: true });
            return {
                id: plain.id,
                firstName: plain.first_name,
                lastName: plain.last_name,
                tgUsername: plain.username,
                tgId: plain.user_id,
            };
        });

        return res.json({
            query: rawQuery,
            count: data.length,
            users: data,
        });
    } catch (err) {
        logError('API GET /users/search error', err);
        return res.status(500).json({ error: 'Failed to search users' });
    }
});

/** GET /api/users/:id - get user by id */
apiRouter.get('/users/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) {
            return res.status(400).json({ error: 'Invalid user id' });
        }
        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user.get({ plain: true }));
    } catch (err) {
        logError('API GET /users/:id error', err);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

/** GET /api/events - list events (paginated: ?page=1&limit=20) */
apiRouter.get('/events', async (req, res) => {
    try {
        const { page, limit, offset } = parsePagination(req.query);
        const total = await Event.count();
        const events = await Event.findAll({
            order: [['time', 'DESC']],
            include: [{ model: Group, attributes: ['id', 'title', 'telegram_chat_id'] }],
            limit,
            offset,
        });
        const data = events.map((e) => e.get({ plain: true }));
        const totalPages = Math.ceil(total / limit) || 1;
        res.json({
            events: data,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
            },
        });
    } catch (err) {
        logError('API GET /events error', err);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

/** GET /api/events/:id - get event by id with registrations and chips logs */
apiRouter.get('/events/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (Number.isNaN(id)) {
            return res.status(400).json({ error: 'Invalid event id' });
        }

        const event = await Event.findByPk(id, {
            include: [{ model: Group, attributes: ['id', 'title', 'telegram_chat_id'] }],
        });
        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        const [registrations, chipsLogs] = await Promise.all([
            RegistrationLog.findAll({
                where: { eventId: id },
                order: [['join_time', 'ASC']],
                include: [{ model: User, attributes: ['id', 'user_id', 'first_name', 'last_name', 'username', 'is_subscribed'] }],
            }),
            ChipsLog.findAll({
                where: { eventId: id },
                order: [['createdAt', 'ASC']],
                include: [{ model: User, attributes: ['id', 'user_id', 'first_name', 'last_name', 'username'] }],
            }),
        ]);

        const eventPlain = event.get({ plain: true });
        const registrationsPlain = registrations.map((r) => r.get({ plain: true }));
        const chipsLogsPlain = chipsLogs.map((c) => c.get({ plain: true }));

        res.json({
            event: eventPlain,
            registrations: registrationsPlain,
            chipsLogs: chipsLogsPlain,
        });
    } catch (err) {
        logError('API GET /events/:id error', err);
        res.status(500).json({ error: 'Failed to fetch event' });
    }
});

/** GET /api/dashboard/stats - aggregated counters for admin dashboard */
apiRouter.get('/dashboard/stats', async (req, res) => {
    try {
        const [totalEvents, totalUsers, biggestDealerTipsEvent] = await Promise.all([
            Event.count({ where: { is_draft: false } }),
            User.count(),
            Event.findOne({
                where: { dealer_tips: { [Op.not]: null } },
                order: [['dealer_tips', 'DESC'], ['time', 'DESC']],
            }),
        ]);

        const boughtByReg = await ChipsLog.findAll({
            where: { is_final: false, confirmed: true },
            attributes: [
                'regId',
                'userId',
                'eventId',
                [sequelize.fn('SUM', sequelize.col('amount')), 'totalBought'],
            ],
            group: ['regId', 'userId', 'eventId'],
            order: [[sequelize.literal('totalBought'), 'DESC']],
            raw: true,
        });

        const finalByReg = await ChipsLog.findAll({
            where: { is_final: true },
            attributes: [
                'regId',
                'userId',
                'eventId',
                [sequelize.fn('MAX', sequelize.col('amount')), 'finalAmount'],
            ],
            group: ['regId', 'userId', 'eventId'],
            order: [[sequelize.literal('finalAmount'), 'DESC']],
            raw: true,
        });

        const topBought = boughtByReg.length > 0 ? boughtByReg[0] : null;
        const topFinal = finalByReg.length > 0 ? finalByReg[0] : null;

        const boughtMap = new Map();
        for (const row of boughtByReg) {
            boughtMap.set(row.regId, toSafeInt(row.totalBought));
        }

        let topWin = null;
        for (const row of finalByReg) {
            const finalAmount = toSafeInt(row.finalAmount);
            const totalBoughtForReg = boughtMap.get(row.regId) ?? 0;
            const winAmount = finalAmount - totalBoughtForReg;
            if (!topWin || winAmount > topWin.winAmount) {
                topWin = {
                    regId: row.regId,
                    userId: row.userId,
                    eventId: row.eventId,
                    finalAmount,
                    totalBought: totalBoughtForReg,
                    winAmount,
                };
            }
        }

        const targetUserIds = [...new Set([
            topBought?.userId,
            topFinal?.userId,
            topWin?.userId,
        ].filter(Boolean))];
        const targetEventIds = [...new Set([
            topBought?.eventId,
            topFinal?.eventId,
            topWin?.eventId,
            biggestDealerTipsEvent?.id,
        ].filter(Boolean))];

        const [users, events] = await Promise.all([
            targetUserIds.length > 0
                ? User.findAll({ where: { id: targetUserIds }, attributes: ['id', 'first_name', 'last_name', 'username', 'user_id'] })
                : [],
            targetEventIds.length > 0
                ? Event.findAll({ where: { id: targetEventIds }, attributes: ['id', 'name', 'time'] })
                : [],
        ]);

        const usersMap = new Map(users.map((u) => [u.id, u.get({ plain: true })]));
        const eventsMap = new Map(events.map((e) => [e.id, e.get({ plain: true })]));

        const formatUser = (userId) => {
            const user = usersMap.get(userId);
            if (!user) return null;
            return {
                id: user.id,
                firstName: user.first_name,
                lastName: user.last_name,
                username: user.username,
                tgId: user.user_id,
            };
        };

        const formatEvent = (eventId) => {
            const event = eventsMap.get(eventId);
            if (!event) return null;
            return {
                id: event.id,
                name: event.name,
                date: event.time,
            };
        };

        return res.json({
            totalEvents,
            totalUsers,
            biggestDealerTips: biggestDealerTipsEvent
                ? {
                    amount: toSafeInt(biggestDealerTipsEvent.dealer_tips),
                    event: {
                        id: biggestDealerTipsEvent.id,
                        name: biggestDealerTipsEvent.name,
                        date: biggestDealerTipsEvent.time,
                    },
                }
                : null,
            mostChipsBought: topBought
                ? {
                    amount: toSafeInt(topBought.totalBought),
                    player: formatUser(topBought.userId),
                    event: formatEvent(topBought.eventId),
                }
                : null,
            biggestFinalCount: topFinal
                ? {
                    amount: toSafeInt(topFinal.finalAmount),
                    player: formatUser(topFinal.userId),
                    event: formatEvent(topFinal.eventId),
                }
                : null,
            biggestWin: topWin
                ? {
                    amount: topWin.winAmount,
                    player: formatUser(topWin.userId),
                    event: formatEvent(topWin.eventId),
                    finalCount: topWin.finalAmount,
                    totalBought: topWin.totalBought,
                }
                : null,
            generatedAt: new Date().toISOString(),
        });
    } catch (err) {
        logError('API GET /dashboard/stats error', err);
        return res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

/** POST /api/events - create event with optional players */
apiRouter.post('/events', async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const {
            groupId,
            telegram_message_id,
            is_draft = true,
            scheduled_publish_at = null,
            name,
            location,
            time,
            players,
            blinds,
            description,
            image_url = null,
            is_closed = false,
            dealer_id = null,
            dealer_tips = null,
            playerIds = [],
        } = req.body || {};

        if (!name || !time) {
            await t.rollback();
            return res.status(400).json({ error: 'name and time are required' });
        }

        const parsedPlayerIds = parsePlayerIds(playerIds);
        if (parsedPlayerIds === null) {
            await t.rollback();
            return res.status(400).json({ error: 'playerIds must be an array of user ids' });
        }

        if (parsedPlayerIds.length > 0) {
            const usersCount = await User.count({
                where: { id: parsedPlayerIds },
                transaction: t,
            });
            if (usersCount !== parsedPlayerIds.length) {
                await t.rollback();
                return res.status(400).json({ error: 'One or more playerIds do not exist' });
            }
        }

        const event = await Event.create({
            groupId: normalizeOptionalInt(groupId),
            telegram_message_id: normalizeOptionalInt(telegram_message_id),
            is_draft: Boolean(is_draft),
            scheduled_publish_at: scheduled_publish_at || null,
            name,
            location: location || null,
            time,
            players: players ?? parsedPlayerIds.length,
            blinds: blinds || null,
            description: description || null,
            image_url: image_url || null,
            is_closed: Boolean(is_closed),
            dealer_id: normalizeOptionalInt(dealer_id),
            dealer_tips: normalizeOptionalInt(dealer_tips),
        }, { transaction: t });

        if (parsedPlayerIds.length > 0) {
            const now = new Date();
            const rows = parsedPlayerIds.map((userId) => ({
                userId,
                eventId: event.id,
                type: 'join',
                join_time: now,
                is_waiting: false,
            }));
            await RegistrationLog.bulkCreate(rows, { transaction: t });
        }

        await t.commit();

        const createdEvent = await Event.findByPk(event.id);
        const registrations = await RegistrationLog.findAll({
            where: { eventId: event.id },
            include: [{ model: User, attributes: ['id', 'user_id', 'first_name', 'last_name', 'username', 'is_subscribed'] }],
            order: [['join_time', 'ASC']],
        });

        return res.status(201).json({
            event: createdEvent?.get({ plain: true }),
            registrations: registrations.map((r) => r.get({ plain: true })),
        });
    } catch (err) {
        await t.rollback();
        logError('API POST /events error', err);
        return res.status(500).json({ error: 'Failed to create event' });
    }
});

/** PUT /api/events/:id - edit event fields and optional players */
apiRouter.put('/events/:id', async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const id = parseId(req.params.id);
        if (!id) {
            await t.rollback();
            return res.status(400).json({ error: 'Invalid event id' });
        }

        const event = await Event.findByPk(id, { transaction: t });
        if (!event) {
            await t.rollback();
            return res.status(404).json({ error: 'Event not found' });
        }

        const allowedFields = [
            'groupId', 'telegram_message_id', 'is_draft', 'scheduled_publish_at', 'name', 'location',
            'time', 'players', 'blinds', 'description', 'image_url', 'is_closed', 'dealer_id', 'dealer_tips',
        ];

        for (const key of allowedFields) {
            if (Object.prototype.hasOwnProperty.call(req.body, key)) {
                if (['groupId', 'telegram_message_id', 'dealer_id', 'dealer_tips'].includes(key)) {
                    event[key] = normalizeOptionalInt(req.body[key]);
                } else {
                    event[key] = req.body[key];
                }
            }
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'playerIds')) {
            const parsedPlayerIds = parsePlayerIds(req.body.playerIds);
            if (parsedPlayerIds === null) {
                await t.rollback();
                return res.status(400).json({ error: 'playerIds must be an array of user ids' });
            }

            if (parsedPlayerIds.length > 0) {
                const usersCount = await User.count({
                    where: { id: parsedPlayerIds },
                    transaction: t,
                });
                if (usersCount !== parsedPlayerIds.length) {
                    await t.rollback();
                    return res.status(400).json({ error: 'One or more playerIds do not exist' });
                }
            }

            const currentJoinRegs = await RegistrationLog.findAll({
                where: {
                    eventId: id,
                    type: 'join',
                },
                transaction: t,
            });

            const currentByUserId = new Map(currentJoinRegs.map((r) => [r.userId, r]));
            const incomingUserIds = new Set(parsedPlayerIds);

            const toCreate = parsedPlayerIds.filter((userId) => !currentByUserId.has(userId));
            if (toCreate.length > 0) {
                const now = new Date();
                await RegistrationLog.bulkCreate(toCreate.map((userId) => ({
                    userId,
                    eventId: id,
                    type: 'join',
                    join_time: now,
                    is_waiting: false,
                })), { transaction: t });
            }

            const toRemoveRegs = currentJoinRegs.filter((r) => !incomingUserIds.has(r.userId));
            if (toRemoveRegs.length > 0) {
                const toRemoveRegIds = toRemoveRegs.map((r) => r.id);
                const linkedLogs = await ChipsLog.findAll({
                    where: { regId: toRemoveRegIds },
                    attributes: ['regId'],
                    transaction: t,
                });
                const lockedRegIds = new Set(linkedLogs.map((l) => l.regId));
                const deletableRegIds = toRemoveRegIds.filter((regId) => !lockedRegIds.has(regId));

                if (deletableRegIds.length > 0) {
                    await RegistrationLog.destroy({
                        where: { id: deletableRegIds },
                        transaction: t,
                    });
                }
            }

            if (!Object.prototype.hasOwnProperty.call(req.body, 'players')) {
                event.players = parsedPlayerIds.length;
            }
        }

        await event.save({ transaction: t });
        await t.commit();

        const updatedEvent = await Event.findByPk(id, {
            include: [{ model: Group, attributes: ['id', 'title', 'telegram_chat_id'] }],
        });
        const registrations = await RegistrationLog.findAll({
            where: { eventId: id },
            include: [{ model: User, attributes: ['id', 'user_id', 'first_name', 'last_name', 'username', 'is_subscribed'] }],
            order: [['join_time', 'ASC']],
        });

        return res.json({
            event: updatedEvent?.get({ plain: true }),
            registrations: registrations.map((r) => r.get({ plain: true })),
        });
    } catch (err) {
        await t.rollback();
        logError('API PUT /events/:id error', err);
        return res.status(500).json({ error: 'Failed to update event' });
    }
});

/** POST /api/chips-logs/:id/confirm - confirm chip request */
apiRouter.post('/chips-logs/:id/confirm', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Invalid chips log id' });
        }

        const chipLog = await ChipsLog.findByPk(id);
        if (!chipLog) {
            return res.status(404).json({ error: 'Chips log not found' });
        }

        chipLog.confirmed = true;
        await chipLog.save();

        return res.json({ chipsLog: chipLog.get({ plain: true }) });
    } catch (err) {
        logError('API POST /chips-logs/:id/confirm error', err);
        return res.status(500).json({ error: 'Failed to confirm chips log' });
    }
});

/** PATCH /api/chips-logs/:id - edit amount on any chips/final log */
apiRouter.patch('/chips-logs/:id', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Invalid chips log id' });
        }

        const amount = parseId(req.body?.amount);
        if (amount === null || amount < 0) {
            return res.status(400).json({ error: 'amount must be an integer >= 0' });
        }

        const chipLog = await ChipsLog.findByPk(id);
        if (!chipLog) {
            return res.status(404).json({ error: 'Chips log not found' });
        }

        chipLog.amount = amount;
        await chipLog.save();

        return res.json({ chipsLog: chipLog.get({ plain: true }) });
    } catch (err) {
        logError('API PATCH /chips-logs/:id error', err);
        return res.status(500).json({ error: 'Failed to update chips log' });
    }
});

/** DELETE /api/chips-logs/:id - delete chips/final log */
apiRouter.delete('/chips-logs/:id', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Invalid chips log id' });
        }

        const chipLog = await ChipsLog.findByPk(id);
        if (!chipLog) {
            return res.status(404).json({ error: 'Chips log not found' });
        }

        await chipLog.destroy();
        return res.status(204).send();
    } catch (err) {
        logError('API DELETE /chips-logs/:id error', err);
        return res.status(500).json({ error: 'Failed to delete chips log' });
    }
});
