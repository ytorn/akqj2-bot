import { Sequelize, DataTypes } from 'sequelize';

export const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './eventbot.sqlite',
    logging: false,
});

export const User = sequelize.define('user', {
    user_id: {
        type: DataTypes.BIGINT,
        unique: true
    },
    first_name: DataTypes.STRING,
    last_name: DataTypes.STRING,
    username: DataTypes.STRING,
    is_subscribed: { type: DataTypes.BOOLEAN, defaultValue: false },
});

export const Group = sequelize.define('group', {
    telegram_chat_id: { type: DataTypes.BIGINT, unique: true },
    title: DataTypes.STRING
});

export const Event = sequelize.define('event', {
    groupId: { type: DataTypes.INTEGER, allowNull: true },
    telegram_message_id: { type: DataTypes.INTEGER },
    is_draft: { type: DataTypes.BOOLEAN, defaultValue: true },
    scheduled_publish_at: { type: DataTypes.DATE, allowNull: true },
    name: DataTypes.STRING,
    location: DataTypes.STRING,
    time: DataTypes.DATE,
    players: DataTypes.INTEGER,
    buyin: DataTypes.INTEGER,
    description: DataTypes.TEXT,
    image_url: { type: DataTypes.STRING, allowNull: true },
    is_closed: { type: DataTypes.BOOLEAN, defaultValue: false },
});

export const RegistrationLog = sequelize.define('registration_log', {
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'user_id',
    },
    eventId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'event_id',
    },
    type: DataTypes.STRING,
    join_time: { type: DataTypes.DATE, allowNull: true },
    is_waiting: { type: DataTypes.BOOLEAN, defaultValue: false }
});

export const Message = sequelize.define('message', {
    message_id: { type: DataTypes.INTEGER, allowNull: false },
    chat_id: { type: DataTypes.BIGINT, allowNull: false },
    content: { type: DataTypes.TEXT },
    type: { type: DataTypes.STRING, allowNull: false },
    is_admin: { type: DataTypes.BOOLEAN, defaultValue: false },
    registration_log_id: { type: DataTypes.INTEGER, allowNull: true },
    event_id: { type: DataTypes.INTEGER, allowNull: true }
});

export const MessageEdit = sequelize.define('message_edit', {
    message_db_id: { type: DataTypes.INTEGER, allowNull: false },
    old_content: { type: DataTypes.TEXT },
    new_content: { type: DataTypes.TEXT },
    edited_by: { type: DataTypes.STRING },
    ip_address: { type: DataTypes.STRING, allowNull: true },
    edit_note: { type: DataTypes.TEXT, allowNull: true }
});

Group.hasMany(Event);
Event.belongsTo(Group);

Message.hasMany(MessageEdit, { foreignKey: 'message_db_id' });
MessageEdit.belongsTo(Message, { foreignKey: 'message_db_id' });

await sequelize.sync();
