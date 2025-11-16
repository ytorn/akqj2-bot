import bot from "../index.js";
import {logError} from "../utils/logError.js";
import {Message} from "../db.js";

export const safeEditCaption = async (chatId, messageId, caption, inline_keyboard = [], options = {}) => {
    try {
        const editOptions = {
            parse_mode: 'HTML',
            ...options
        };

        if (inline_keyboard !== undefined) {
            editOptions.reply_markup = { inline_keyboard };
        }

        await bot.telegram.editMessageCaption(
            chatId,
            messageId,
            null,
            caption,
            editOptions
        );

        try {
            await Message.update(
                { content: caption },
                { where: { chat_id: chatId, message_id: messageId } }
            );
        } catch (dbErr) {
            logError('❌ Failed to update message in database:', dbErr);
        }
    } catch (err) {
        if (err.response) {
            const { error_code, description } = err.response;

            if (error_code === 400 && description.includes("message is not modified")) {
                console.error(`⚠ Tried to edit caption for message ${messageId}, but content was identical.`);
            } else if (error_code === 400 && description.includes("message to edit not found")) {
                console.error(`⚠ Message ${messageId} not found in chat ${chatId} (maybe deleted).`);
            } else {
                console.error(`❌ Failed to edit caption for message ${messageId}:`, description);
            }
        } else {
            console.error('❌ Unexpected error while editing caption:', err);
        }
    }
};
