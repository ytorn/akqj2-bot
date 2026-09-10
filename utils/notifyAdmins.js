import { logError } from "./logError.js";
import { getAdminTelegramIds } from "./admins.js";
import {safeSendMessage} from "../services/safeSend.js";

export const notifyAdmins = async (message, options = {}) => {
    const adminIds = await getAdminTelegramIds();
    for (const adminId of adminIds) {
        try {
            await safeSendMessage(adminId, message, options, { isAdmin: true });
        } catch (err) {
            logError(`❌ Failed to notify admin ${adminId}. Notification: ${message}:`, err);
        }
    }
}
