import {Router} from 'express';
import {ChipsLog, Event, Group, RegistrationLog, sequelize, User} from '../db.js';
import {Op} from 'sequelize';
import {logError} from '../utils/logError.js';
import {refreshEventMessage} from '../utils/refreshEventMessage.js';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import config from '../config.js';

export const apiRouter = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'event-images');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const imageUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
            cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
        },
    }),
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype?.startsWith('image/')) {
            cb(new Error('Only image files are allowed'));
            return;
        }
        cb(null, true);
    },
    limits: { fileSize: 10 * 1024 * 1024 },
});

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
    return [...new Set(playerIds.map((v) => parseInt(v, 10)).filter((v) => !Number.isNaN(v)))];
};

const toSafeInt = (value) => {
    const parsed = parseInt(value ?? 0, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
};

const resolveGroupIdInput = async (rawGroupId, transaction) => {
    const parsed = normalizeOptionalInt(rawGroupId);
    if (parsed === null) return null;

    // 1) Try direct Group PK
    let group = await Group.findByPk(parsed, { transaction });
    if (group) return group.id;

    // 2) Try Telegram chat id (common from admin UIs)
    group = await Group.findOne({
        where: { telegram_chat_id: parsed },
        transaction,
    });
    if (group) return group.id;

    return null;
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

const getEventImagePreviewUrl = (eventId) => `/api/events/${eventId}/image`;
const UPLOADS_PUBLIC_PREFIX = '/uploads/event-images/';

const extractLocalUploadFilename = (imageRef) => {
    if (!imageRef) return null;
    const normalized = String(imageRef);
    const markerIndex = normalized.indexOf(UPLOADS_PUBLIC_PREFIX);
    if (markerIndex === -1) return null;
    const fileName = normalized.slice(markerIndex + UPLOADS_PUBLIC_PREFIX.length).split('?')[0];
    return fileName || null;
};

/** GET /api/users - list users (paginated + search + sorting) */
apiRouter.get('/users', async (req, res) => {
    try {
        const { page, limit, offset } = parsePagination(req.query);
        const rawQuery = String(req.query.q ?? '').trim();
        const normalizedQuery = rawQuery.startsWith('@') ? rawQuery.slice(1) : rawQuery;
        const maybeTelegramId = parseInt(normalizedQuery, 10);
        const isTelegramIdQuery = !Number.isNaN(maybeTelegramId) && String(maybeTelegramId) === normalizedQuery;

        const where = {};
        if (normalizedQuery) {
            where[Op.or] = [
                { first_name: { [Op.like]: `%${normalizedQuery}%` } },
                { last_name: { [Op.like]: `%${normalizedQuery}%` } },
                { username: { [Op.like]: `%${normalizedQuery}%` } },
            ];
            if (isTelegramIdQuery) {
                where[Op.or].push({ user_id: String(maybeTelegramId) });
            }
        }

        const sortBy = String(req.query.sortBy ?? 'id').toLowerCase();
        const sortOrder = String(req.query.sortOrder ?? 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
        let order = [['id', sortOrder]];

        if (sortBy === 'name') {
            order = [
                ['first_name', sortOrder],
                ['last_name', sortOrder],
                ['id', 'ASC'],
            ];
        } else if (sortBy === 'username') {
            order = [
                ['username', sortOrder],
                ['id', 'ASC'],
            ];
        }

        const total = await User.count({ where });
        const users = await User.findAll({
            where,
            order,
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
            filters: {
                q: rawQuery || null,
                sortBy,
                sortOrder: sortOrder.toLowerCase(),
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

/** GET /api/users/:id - get user by id (includes chip stats) */
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

        // Totals only include registrations where this user has a final chip log (completed games).
        const [buyinsByReg, finalsByReg] = await Promise.all([
            ChipsLog.findAll({
                where: { userId: id, is_final: false, confirmed: true },
                attributes: [
                    'regId',
                    'eventId',
                    [sequelize.fn('SUM', sequelize.col('amount')), 'totalBought'],
                ],
                group: ['regId', 'eventId'],
                raw: true,
            }),
            ChipsLog.findAll({
                where: { userId: id, is_final: true },
                attributes: [
                    'regId',
                    'eventId',
                    [sequelize.fn('MAX', sequelize.col('amount')), 'finalAmount'],
                ],
                group: ['regId', 'eventId'],
                raw: true,
            }),
        ]);

        const boughtMap = new Map();
        for (const row of buyinsByReg) {
            boughtMap.set(row.regId, toSafeInt(row.totalBought));
        }

        let totalFinalCount = 0;
        let totalBuyin = 0;
        let bestGame = null;
        let worstGame = null;
        const eventIds = [...new Set(finalsByReg.map((r) => r.eventId).filter(Boolean))];

        for (const row of finalsByReg) {
            const finalAmount = toSafeInt(row.finalAmount);
            totalFinalCount += finalAmount;
            const boughtForReg = boughtMap.get(row.regId) ?? 0;
            totalBuyin += boughtForReg;
            const gameResult = finalAmount - boughtForReg;

            const candidate = {
                eventId: row.eventId,
                result: gameResult,
                eventName: null,
                date: null,
            };

            if (!bestGame || gameResult > bestGame.result) {
                bestGame = { ...candidate };
            }
            if (!worstGame || gameResult < worstGame.result) {
                worstGame = { ...candidate };
            }
        }

        if (eventIds.length > 0) {
            const events = await Event.findAll({
                where: { id: eventIds },
                attributes: ['id', 'name', 'time'],
            });
            const eventMap = new Map(events.map((e) => [e.id, e.get({ plain: true })]));
            const fillEvent = (game) => {
                if (!game) return null;
                const ev = eventMap.get(game.eventId);
                return {
                    eventId: game.eventId,
                    eventName: ev?.name ?? null,
                    date: ev?.time ?? null,
                    result: game.result,
                };
            };
            bestGame = fillEvent(bestGame);
            worstGame = fillEvent(worstGame);
        } else {
            bestGame = null;
            worstGame = null;
        }

        const totalResult = totalFinalCount - totalBuyin;
        const eventsPlayed = finalsByReg.length;

        res.json({
            ...user.get({ plain: true }),
            stats: {
                eventsPlayed,
                totalBuyin,
                totalFinalCount,
                totalResult,
                bestGame,
                worstGame,
            },
        });
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
        const data = events.map((e) => {
            const plain = e.get({ plain: true });
            return {
                ...plain,
                imagePreviewUrl: plain.image_url ? getEventImagePreviewUrl(plain.id) : null,
            };
        });
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
            event: {
                ...eventPlain,
                imagePreviewUrl: eventPlain.image_url ? getEventImagePreviewUrl(eventPlain.id) : null,
            },
            registrations: registrationsPlain,
            chipsLogs: chipsLogsPlain,
        });
    } catch (err) {
        logError('API GET /events/:id error', err);
        res.status(500).json({ error: 'Failed to fetch event' });
    }
});

/** GET /api/events/:id/image - resolves event image for admin preview (URL/file_id/local file) */
apiRouter.get('/events/:id/image', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Invalid event id' });
        }

        const event = await Event.findByPk(id);
        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }
        if (!event.image_url) {
            return res.status(404).json({ error: 'Event has no image' });
        }

        const imageRef = String(event.image_url);
        const localFile = extractLocalUploadFilename(imageRef);
        if (localFile) {
            const absolutePath = path.join(UPLOADS_DIR, localFile);
            if (!fs.existsSync(absolutePath)) {
                return res.status(404).json({ error: 'Image file not found' });
            }
            return res.sendFile(absolutePath);
        }

        if (imageRef.startsWith('http://') || imageRef.startsWith('https://')) {
            return res.redirect(imageRef);
        }

        // Otherwise treat as Telegram file_id and proxy bytes through this API.
        const getFileResponse = await fetch(
            `https://api.telegram.org/bot${config.botToken}/getFile?file_id=${encodeURIComponent(imageRef)}`
        );
        if (!getFileResponse.ok) {
            return res.status(502).json({ error: 'Failed to resolve Telegram image' });
        }
        const getFileData = await getFileResponse.json();
        const filePath = getFileData?.result?.file_path;
        if (!filePath) {
            return res.status(404).json({ error: 'Telegram image not found' });
        }

        const fileResponse = await fetch(`https://api.telegram.org/file/bot${config.botToken}/${filePath}`);
        if (!fileResponse.ok) {
            return res.status(502).json({ error: 'Failed to download Telegram image' });
        }

        const contentType = fileResponse.headers.get('content-type') || 'application/octet-stream';
        const arrayBuffer = await fileResponse.arrayBuffer();
        res.setHeader('Content-Type', contentType);
        return res.send(Buffer.from(arrayBuffer));
    } catch (err) {
        logError('API GET /events/:id/image error', err);
        return res.status(500).json({ error: 'Failed to fetch event image' });
    }
});

/** POST /api/events/:id/image - upload/replace event image from admin (multipart/form-data, field: image) */
apiRouter.post('/events/:id/image', imageUpload.single('image'), async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Invalid event id' });
        }

        const event = await Event.findByPk(id);
        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'image file is required' });
        }

        if (!config.apiUrl) {
            return res.status(500).json({ error: 'API_URL is required to build image URL' });
        }

        const oldLocalFile = extractLocalUploadFilename(event.image_url);
        const imagePath = `${UPLOADS_PUBLIC_PREFIX}${req.file.filename}`;
        const imageUrl = `${String(config.apiUrl).replace(/\/$/, '')}${imagePath}`;
        event.image_url = imageUrl;
        await event.save();

        if (oldLocalFile && oldLocalFile !== req.file.filename) {
            const oldPath = path.join(UPLOADS_DIR, oldLocalFile);
            try {
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            } catch (fsErr) {
                // Image replacement shouldn't block bot publishing.
                logError('Failed to delete old local event image', fsErr);
            }
        }

        if (!event.is_draft && event.telegram_message_id) {
            try {
                await refreshEventMessage(event, event.is_closed);
            } catch (refreshErr) {
                logError('Failed to refresh telegram message after image upload', refreshErr);
            }
        }

        return res.json({
            event: {
                ...event.get({ plain: true }),
                imagePreviewUrl: getEventImagePreviewUrl(event.id),
            },
        });
    } catch (err) {
        logError('API POST /events/:id/image error', err);
        return res.status(500).json({ error: 'Failed to upload event image' });
    }
});

/** DELETE /api/events/:id/image - remove event image */
apiRouter.delete('/events/:id/image', async (req, res) => {
    try {
        const id = parseId(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Invalid event id' });
        }

        const event = await Event.findByPk(id);
        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        const oldLocalFile = extractLocalUploadFilename(event.image_url);
        event.image_url = null;
        await event.save();

        if (oldLocalFile) {
            const oldPath = path.join(UPLOADS_DIR, oldLocalFile);
            try {
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            } catch (fsErr) {
                logError('Failed to delete local event image after delete', fsErr);
            }
        }

        if (!event.is_draft && event.telegram_message_id) {
            try {
                await refreshEventMessage(event, event.is_closed);
            } catch (refreshErr) {
                logError('Failed to refresh telegram message after image delete', refreshErr);
            }
        }

        return res.status(204).send();
    } catch (err) {
        logError('API DELETE /events/:id/image error', err);
        return res.status(500).json({ error: 'Failed to delete event image' });
    }
});

/** GET /api/dashboard/stats - aggregated counters for admin dashboard */
apiRouter.get('/dashboard/stats', async (req, res) => {
    try {
        const [totalEvents, totalUsers, eventIdsWithFinalRows] = await Promise.all([
            Event.count({ where: { is_draft: false } }),
            User.count(),
            ChipsLog.findAll({
                where: { is_final: true },
                attributes: ['eventId'],
                group: ['eventId'],
                raw: true,
            }),
        ]);

        const eventIdsWithFinal = [...new Set(eventIdsWithFinalRows.map((r) => r.eventId).filter(Boolean))];

        const biggestDealerTipsEvent = eventIdsWithFinal.length > 0
            ? await Event.findOne({
                where: {
                    id: { [Op.in]: eventIdsWithFinal },
                    is_draft: false,
                    dealer_tips: { [Op.not]: null },
                },
                order: [['dealer_tips', 'DESC'], ['time', 'DESC']],
            })
            : null;

        // Player chip stats only count registrations that have a final chip log ("completed games").
        const boughtByReg = await ChipsLog.findAll({
            where: { is_final: false, confirmed: true },
            attributes: [
                'regId',
                'userId',
                'eventId',
                [sequelize.fn('SUM', sequelize.col('amount')), 'totalBought'],
            ],
            group: ['regId', 'userId', 'eventId'],
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

        const regIdsWithFinal = new Set(finalByReg.map((r) => r.regId));
        const boughtByRegCompleted = boughtByReg.filter((r) => regIdsWithFinal.has(r.regId));
        let topBought = null;
        if (boughtByRegCompleted.length > 0) {
            topBought = boughtByRegCompleted.reduce((best, row) =>
                toSafeInt(row.totalBought) > toSafeInt(best.totalBought) ? row : best
            );
        }

        const topFinal = finalByReg.length > 0 ? finalByReg[0] : null;

        const boughtMap = new Map();
        for (const row of boughtByReg) {
            boughtMap.set(row.regId, toSafeInt(row.totalBought));
        }

        let topWin = null;
        const profitByUser = new Map();
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
            const uid = row.userId;
            if (!profitByUser.has(uid)) {
                profitByUser.set(uid, { totalProfit: 0, gamesPlayed: 0 });
            }
            const agg = profitByUser.get(uid);
            agg.totalProfit += winAmount;
            agg.gamesPlayed += 1;
        }

        let topWinner = null;
        let biggestLoser = null;
        for (const [userId, agg] of profitByUser) {
            if (!topWinner || agg.totalProfit > topWinner.totalProfit) {
                topWinner = { userId, totalProfit: agg.totalProfit, gamesPlayed: agg.gamesPlayed };
            }
            if (!biggestLoser || agg.totalProfit < biggestLoser.totalProfit) {
                biggestLoser = { userId, totalProfit: agg.totalProfit, gamesPlayed: agg.gamesPlayed };
            }
        }

        const targetUserIds = [...new Set([
            topBought?.userId,
            topFinal?.userId,
            topWin?.userId,
            topWinner?.userId,
            biggestLoser?.userId,
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

        const getPlayerName = (userId) => {
            const user = usersMap.get(userId);
            if (!user) return null;
            const full = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
            if (full) return full;
            if (user.username) return `@${user.username}`;
            return user.user_id ? String(user.user_id) : String(user.id);
        };

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
            topWinner: topWinner
                ? {
                    totalProfit: topWinner.totalProfit,
                    gamesPlayed: topWinner.gamesPlayed,
                    playerName: getPlayerName(topWinner.userId),
                    player: formatUser(topWinner.userId),
                }
                : null,
            biggestLoser: biggestLoser
                ? {
                    totalProfit: biggestLoser.totalProfit,
                    gamesPlayed: biggestLoser.gamesPlayed,
                    playerName: getPlayerName(biggestLoser.userId),
                    player: formatUser(biggestLoser.userId),
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

        const resolvedGroupId = await resolveGroupIdInput(groupId, t);
        if (groupId !== null && groupId !== undefined && groupId !== '' && resolvedGroupId === null) {
            await t.rollback();
            return res.status(400).json({ error: 'Invalid groupId: group not found' });
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
            groupId: resolvedGroupId,
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

        let shouldRefreshPublishedMessage = false;

        const allowedFields = [
            'groupId', 'telegram_message_id', 'is_draft', 'scheduled_publish_at', 'name', 'location',
            'time', 'players', 'blinds', 'description', 'image_url', 'is_closed', 'dealer_id', 'dealer_tips',
        ];

        for (const key of allowedFields) {
            if (Object.prototype.hasOwnProperty.call(req.body, key)) {
                if (['groupId', 'telegram_message_id', 'dealer_id', 'dealer_tips'].includes(key)) {
                    if (key === 'groupId') {
                        const resolvedGroupId = await resolveGroupIdInput(req.body.groupId, t);
                        if (req.body.groupId !== null && req.body.groupId !== undefined && req.body.groupId !== '' && resolvedGroupId === null) {
                            await t.rollback();
                            return res.status(400).json({ error: 'Invalid groupId: group not found' });
                        }
                        event.groupId = resolvedGroupId;
                    } else {
                        event[key] = normalizeOptionalInt(req.body[key]);
                    }
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
                shouldRefreshPublishedMessage = true;
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

        if (
            shouldRefreshPublishedMessage &&
            updatedEvent &&
            !updatedEvent.is_draft &&
            updatedEvent.telegram_message_id
        ) {
            await refreshEventMessage(updatedEvent, updatedEvent.is_closed);
        }

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

/** DELETE /api/registrations/:id - delete registration and refresh event post if published */
apiRouter.delete('/registrations/:id', async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const id = parseId(req.params.id);
        if (!id) {
            await t.rollback();
            return res.status(400).json({ error: 'Invalid registration id' });
        }

        const registration = await RegistrationLog.findByPk(id, { transaction: t });
        if (!registration) {
            await t.rollback();
            return res.status(404).json({ error: 'Registration log not found' });
        }

        const linkedLogsCount = await ChipsLog.count({
            where: { regId: registration.id },
            transaction: t,
        });
        if (linkedLogsCount > 0) {
            await t.rollback();
            return res.status(409).json({
                error: 'Cannot delete registration with existing chips logs',
                linkedLogsCount,
            });
        }

        const event = await Event.findByPk(registration.eventId, { transaction: t });

        await registration.destroy({ transaction: t });
        await t.commit();

        if (event && !event.is_draft && event.telegram_message_id) {
            await refreshEventMessage(event, event.is_closed);
        }

        return res.status(204).send();
    } catch (err) {
        await t.rollback();
        logError('API DELETE /registrations/:id error', err);
        return res.status(500).json({ error: 'Failed to delete registration log' });
    }
});
