import fs from 'fs';
import path from 'path';

const LOG_FILE = './logs/messages.log';

const ensureLogFile = () => {
    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    if (!fs.existsSync(LOG_FILE)) {
        fs.writeFileSync(LOG_FILE, '');
    }
};

export const logMessage = (type, chatId, content, messageId) => {
    try {
        ensureLogFile();
        
        const logEntry = {
            timestamp: new Date(),
            type,
            chatId,
            messageId,
            content: typeof content === 'string' ? content : JSON.stringify(content),
            messageLength: typeof content === 'string' ? content.length : JSON.stringify(content).length
        };

        const logLine = JSON.stringify(logEntry) + '\n';
        fs.appendFileSync(LOG_FILE, logLine);
    } catch (error) {
        console.error('❌ Failed to log message:', error);
    }
};
