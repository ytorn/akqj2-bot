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

/** GET /api/users - list all users */
apiRouter.get('/users', async (req, res) => {
    try {
        const users = await User.findAll({
            order: [['id', 'ASC']],
        });
        const data = users.map((u) => u.get({ plain: true }));
        res.json({ users: data });
    } catch (err) {
        logError('API GET /users error', err);
        res.status(500).json({ error: 'Failed to fetch users' });
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

/** GET /api/events - list all events */
apiRouter.get('/events', async (req, res) => {
    try {
        const events = await Event.findAll({
            order: [['time', 'DESC']],
            include: [{ model: Group, attributes: ['id', 'title', 'telegram_chat_id'] }],
        });
        const data = events.map((e) => e.get({ plain: true }));
        res.json({ events: data });
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
