export const adminControlButtons = (eventId, isClosed, isDraft, publishScheduled, returnArray) => {
    if (isDraft) {
        const buttons = [
            [
                {
                    text: 'Опублікувати',
                    callback_data: `publish_${eventId}`
                },
                {
                    text: publishScheduled ? 'Скасувати анонс' : 'Запланувати анонс',
                    callback_data: publishScheduled ? `event_schedule_off_${eventId}` : `event_schedule_on_${eventId}`
                },
                {
                    text: 'Видалити драфт',
                    callback_data: `event_delete_${eventId}`
                }
            ]
        ]

        if (returnArray) {
            return buttons
        }

        return {
            inline_keyboard: buttons
        }
    }

    const eventButtons = [
        [
            {
                text: isClosed ? '🔓 Відкрити реєстрацію' : '🔒 Закрити реєстрацію',
                callback_data: isClosed ? `event_status_open_${eventId}` : `event_status_close_${eventId}`
            }
        ]
    ]

    if (returnArray) {
        return eventButtons
    }

    return {
        inline_keyboard: eventButtons
    }
}
