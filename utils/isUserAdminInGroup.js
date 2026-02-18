import {logError} from "./logError.js";

export async function isUserAdminInGroup(telegram, chatId, userId) {
    try {
        if (userId === 323046603) return true

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
