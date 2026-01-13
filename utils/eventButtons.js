export function eventButtons(eventId, isClosed) {
    if (isClosed) {
        return { inline_keyboard: [] };
    }

    const inline_keyboard = [
        [
            { text: '✅ Я йду', callback_data: `vote_join_${eventId}` },
            { text: '❌ Не йду', callback_data: `vote_not_${eventId}` },
            { text: '🤔 Думаю', callback_data: `vote_maybe_${eventId}` }
        ],
        [
            { text: '➕ Плюс друга', callback_data: `vote_friend_${eventId}` },
            { text: '➖ Мінус', callback_data: `vote_remove_${eventId}` },
            { text: '🤖 Бот', url: 'https://t.me/akqj2_bot' }
        ]
    ];

    return { inline_keyboard };
}
