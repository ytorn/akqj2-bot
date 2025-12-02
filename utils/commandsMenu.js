import { isUserAdminInGroup } from "./isUserAdminInGroup.js";
import bot from "../index.js";
import config from "../config.js";

export const updateUserCommands = async (userId, chatId, telegram) => {
    const commands = [];

    const isAdmin = await isUserAdminInGroup(telegram, config.groupId, userId);

    if (isAdmin) {
        commands.push({ command: 'create_event', description: 'Створити нову подію' });
        commands.push({ command: 'cancel', description: 'Перервати створення події' });
        commands.push({ command: 'list_events', description: 'Відобразити поточні події та драфти' });
        commands.push({ command: 'buy_chips', description: 'Купити фішки' });
        commands.push({ command: 'buy_chips_cancel', description: 'Перервати купівлю фішок' });
        commands.push({ command: 'final_count', description: 'Ввести фінальний результат' });
        commands.push({ command: 'final_count_cancel', description: 'Перервати введення результатів' });
    }

    commands.push({ command: 'request_chips', description: 'Записати покупку фішок' });
    commands.push({ command: 'settings', description: 'Налаштування' });
    commands.push({ command: 'help', description: 'Інформація та підтримка' });

    await bot.telegram.setMyCommands(commands, {
        scope: {
            type: 'chat',
            chat_id: chatId,
        },
    });
};
