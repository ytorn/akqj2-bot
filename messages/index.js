import dayjs from "dayjs";
import { formatUsername } from "../utils/formatUsername.js";

export const welcome = (user) => `
Привіт, ${formatUsername(user, true)}! 👋
🤖 Я — твій покер-бот ♠️ з <b>AKQJ2 Club</b>.

Допоможу зареєструватися на гру, розповім про події!
На зв'язку! 😉
`

export const eventPreview = (preview) => `
🆕 <b>Прев'ю події:</b>

🏁 <b>${preview.name}</b>
📍 Локація: ${preview.location}
⏰ Дата та час: ${dayjs(preview.time).format('dddd, DD.MM, HH:mm')}
👥 Гравців: ${preview.players}
💵 Бай-ін: ${preview.buyin}

📝 ${preview.description}

✅ Використайте /list_events, щоб переглянути майбутні події та шаблони, готові до публікації
`

export const eventItem = (event) => `
🏁 <b>${event.name}</b>
📍 ${event.location}
⏰ ${dayjs(event.time).format('dddd, DD.MM, HH:mm')}
👥 ${event.players} гравців
💵 Бай-ін: ${event.buyin}

❗ ${event.description}${event.scheduled_publish_at
    ? `\n\n<b>Публікацію заплановано на ${dayjs(event.scheduled_publish_at).format('dddd, DD.MM, HH:mm')}</b>`
    : ''
}
`

export const eventsNotFound = `❌ Не вдалося знайти події.
Створити нову подію можна за допомогою /create_event
`
