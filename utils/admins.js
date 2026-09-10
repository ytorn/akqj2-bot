import { Op } from 'sequelize';
import { Admin, User } from '../db.js';
import { ADMIN_ID } from '../constants.js';

export { ADMIN_ID };

export const parseTelegramId = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const asString = String(value).trim();
    if (!/^\d+$/.test(asString)) return null;
    const parsed = Number(asString);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
    return parsed;
};

export const isHardcodedAdmin = (telegramId) => Number(telegramId) === ADMIN_ID;

export const getAdminTelegramIds = async () => {
    const rows = await Admin.findAll({ attributes: ['telegram_id'] });
    const fromDb = rows
        .map((row) => Number(row.telegram_id))
        .filter((id) => Number.isInteger(id) && id > 0 && id !== ADMIN_ID);
    return [...new Set([ADMIN_ID, ...fromDb])];
};

const formatLinkedUser = (user) => {
    if (!user) return null;
    return {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        username: user.username,
        tgId: user.user_id,
    };
};

export const serializeAdmins = async (admins) => {
    const telegramIds = [...new Set(
        admins
            .map((admin) => {
                const plain = typeof admin.get === 'function' ? admin.get({ plain: true }) : admin;
                return String(plain.telegram_id);
            })
            .filter(Boolean)
    )];

    const telegramIdValues = [...new Set(
        telegramIds.flatMap((id) => {
            const numeric = Number(id);
            return Number.isNaN(numeric) ? [id] : [id, numeric];
        })
    )];

    const users = telegramIdValues.length > 0
        ? await User.findAll({
            where: { user_id: { [Op.in]: telegramIdValues } },
            attributes: ['id', 'first_name', 'last_name', 'username', 'user_id'],
        })
        : [];

    const usersByTgId = new Map(users.map((u) => [String(u.user_id), u.get({ plain: true })]));

    return admins
        .map((admin) => {
            const plain = typeof admin.get === 'function' ? admin.get({ plain: true }) : admin;
            const telegramId = Number(plain.telegram_id);
            if (telegramId === ADMIN_ID) return null;
            return {
                id: plain.id,
                telegramId,
                createdAt: plain.createdAt,
                updatedAt: plain.updatedAt,
                user: formatLinkedUser(usersByTgId.get(String(plain.telegram_id))),
            };
        })
        .filter(Boolean);
};
