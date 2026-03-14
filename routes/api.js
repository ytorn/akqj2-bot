import { Router } from 'express';
import { User, Event, RegistrationLog, ChipsLog, Group } from '../db.js';
import { logError } from '../utils/logError.js';

export const apiRouter = Router();

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
