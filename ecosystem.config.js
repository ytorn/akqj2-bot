const path = require('path');

module.exports = {
    apps: [
        {
            name: 'poker-bot',
            script: 'index.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'production'
            },
            error_file: path.join(__dirname, 'logs', 'err.log'),
            out_file: path.join(__dirname, 'logs', 'out.log'),
            log_file: path.join(__dirname, 'logs', 'combined.log'),
            time: true
        }
    ]
};
