import {User, Message} from "../db.js";
import {logError} from "../utils/logError.js";
import {logMessage} from "../utils/logMessage.js";
import bot from "../index.js";
import fs from 'fs';
import path from 'path';

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
        let photoInput = photoUrl;

        // If photoUrl points to our own uploads, send the local file directly.
        // This prevents Telegram from downloading a URL that may return HTML/404.
        if (typeof photoUrl === 'string') {
            const match = photoUrl.match(/\/uploads\/event-images\/([^/?#]+)$/i);
            if (match?.[1]) {
                const fileName = match[1];
                const localPath = path.join(process.cwd(), 'uploads', 'event-images', fileName);
                if (fs.existsSync(localPath)) {
                    const stream = fs.createReadStream(localPath);
                    stream.on('error', (streamErr) => {
                        // Prevent unhandled stream errors from affecting the process.
                        logError(`❌ Failed to read local image file: ${localPath}`, streamErr);
                    });
                    photoInput = stream;
                }
            }
        }

        const result = await bot.telegram.sendPhoto(chatId, photoInput, { parse_mode: 'HTML', ...options });
        
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

