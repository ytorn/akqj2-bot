import dayjs from "dayjs";

export const formatEventMessage = (event, isClosed) => {
    return `
🏁 <b>${event.name}</b>
📍 ${event.location}
⏰ ${dayjs(event.time).format('dddd, DD.MM, HH:mm')}
👥 ${event.players} гравців
💵 Бай-ін: ${event.buyin}

❗ ${event.description}

${isClosed ? '❌ Реєстрація закрита' : '✅ Реєстрація відкрита'}
`.trim();
};
