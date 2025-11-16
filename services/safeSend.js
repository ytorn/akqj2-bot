import {User, Message} from "../db.js";
import {logError} from "../utils/logError.js";
import {logMessage} from "../utils/logMessage.js";
import bot from "../index.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const safeSendMessage = async (chatId, message, options = {}, metadata = {}) => {
    try {
        const result = await bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML', ...options });

        if (!result || !result.message_id) {
            logError(`❌ Failed to find a sent message: chat ID ${chatId}, message: ${message}, metadata: ${JSON.stringify(metadata)}`);
        }

        logMessage('message', chatId, message, result.message_id);

        try {
            await Message.create({
                message_id: result.message_id,
                chat_id: chatId,
                content: message,
                type: 'message',
                is_admin: metadata.isAdmin || false,
                registration_log_id: metadata.registrationLogId || null,
                event_id: metadata.eventId || null
            });
        } catch (dbErr) {
            logError('❌ Failed to save message to database:', dbErr);
        }

        return result;
    } catch (err) {
        if (err.response) {
            const { error_code, parameters } = err.response;

            if (error_code === 403) {
                console.error('❌ User unsubscribed, ID: ', chatId);
                const user = await User.findOne({ where: { user_id: chatId }});
                if (user) {
                    user.is_subscribed = false;
                    await user.save();
                }
            } else if (error_code === 429 && parameters?.retry_after) {
                const retryAfter = parameters.retry_after * 1000;

                await sleep(retryAfter);
                return safeSendMessage(chatId, message, options)
            } else {
                logError('❌ Other Telegram error:', err);
            }
        }
    }
};

export const safeSendPhoto = async (chatId, photoUrl, options = {}, metadata = {}) => {
    try {
        const result = await bot.telegram.sendPhoto(chatId, photoUrl, { parse_mode: 'HTML', ...options });
        
        logMessage('photo', chatId, options?.caption);

        try {
            await Message.create({
                message_id: result.message_id,
                chat_id: chatId,
                content: options?.caption || '',
                type: 'photo',
                is_admin: metadata.isAdmin || false,
                registration_log_id: metadata.registrationLogId || null,
                event_id: metadata.eventId || null
            });
        } catch (dbErr) {
            logError('❌ Failed to save message to database:', dbErr);
        }

        return result;
    } catch (err) {
        if (err.response) {
            const { error_code, parameters } = err.response;

            if (error_code === 403) {
                const user = await User.findOne({ where: { user_id: chatId }});
                if (user) {
                    user.is_subscribed = false;
                    await user.save();
                }
            } else if (error_code === 429 && parameters?.retry_after) {
                const retryAfter = parameters.retry_after * 1000;

                await sleep(retryAfter);
                return safeSendPhoto(chatId, photoUrl, options);
            } else {
                logError('❌ Other Telegram error:', err);
            }
        }
    }
};

