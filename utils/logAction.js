import fs from 'fs';
import path from 'path';

const LOG_FILE = './logs/actions.log';

const ensureLogFile = () => {
    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    if (!fs.existsSync(LOG_FILE)) {
        fs.writeFileSync(LOG_FILE, '');
    }
};

export const logAction = (action, user, eventName, additionalData = {}) => {
    try {
        ensureLogFile();
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            action,
            user: {
                id: user?.id,
                username: user?.username,
                first_name: user?.first_name,
                last_name: user?.last_name
            },
            eventName,
            ...additionalData
        };

        const logLine = JSON.stringify(logEntry) + '\n';
        fs.appendFileSync(LOG_FILE, logLine);
    } catch (error) {
        console.error('❌ Failed to log action:', error);
    }
};

