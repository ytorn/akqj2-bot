import {logError} from "./logError.js";
import { ADMIN_ID } from "../constants.js";

export async function isUserAdminInGroup(telegram, chatId, userId) {
    try {
        if (Number(userId) === ADMIN_ID) return true

        const member = await telegram.getChatMember(chatId, userId);
        if (!member) return

        return ['creator', 'administrator'].includes(member.status);
    } catch (err) {
        if (err.description === 'Bad Request: chat not found') {
            return false;
        }

        logError('Failed to check admin status:', err);
        return false;
    }
}
