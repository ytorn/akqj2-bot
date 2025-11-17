import dotenv from 'dotenv';
dotenv.config();

const ENV = process.env.APP_ENV || 'production';

const config = {
    production: {
        apiUrl: process.env.API_URL,
        botToken: process.env.BOT_TOKEN,
        groupId: -5098122039,
    },
    test: {
        apiUrl: process.env.API_TEST_URL,
        botToken: process.env.BOT_TEST_TOKEN,
        groupId: -5048887833,
    }
};

export default config[ENV];
