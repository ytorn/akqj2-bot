export const formatUsername = (user, isShort = false) => {
    const name = user.first_name || '';
    const lastName = (!isShort && user.last_name) ? ` ${user.last_name}` : '';
    return `${name}${lastName}` || user.username || `User ${user.user_id}`;
}
