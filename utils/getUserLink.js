export const getUserLink = (user) => {
    return user.username
        ? `https://t.me/${user.username}`
        : `tg://user?id=${user?.id ?? user.user_id}`;
}
