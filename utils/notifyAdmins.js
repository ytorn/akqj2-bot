import { logError } from "./logError.js";
import { ADMIN_ID } from "../constants.js";
import {safeSendMessage} from "../services/safeSend.js";

export const ADMINS = [ADMIN_ID];

export const notifyAdmins = async (message) => {
    for (const adminId of ADMINS) {
        try {
            await safeSendMessage(adminId, message, {}, { isAdmin: true });
        } catch (err) {
            logError(`❌ Failed to notify admin ${adminId}. Notification: ${message}:`, err);
        }
    }
}
