import dotenv from 'dotenv';
dotenv.config();

const ENV = process.env.APP_ENV || 'production';

const config = {
    production: {
        apiUrl: process.env.API_URL,
        botToken: process.env.BOT_TOKEN,
        groupId: -1003590462875,
        adminApiUser: process.env.ADMIN_API_USER,
        adminApiPassword: process.env.ADMIN_API_PASSWORD,
    },
    test: {
        apiUrl: process.env.API_TEST_URL,
        botToken: process.env.BOT_TEST_TOKEN,
        groupId: -5048887833,
        adminApiUser: process.env.ADMIN_API_USER,
        adminApiPassword: process.env.ADMIN_API_PASSWORD,
    }
};

export default config[ENV];
