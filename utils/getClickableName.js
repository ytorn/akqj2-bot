import { formatUsername } from "./formatUsername.js";
import { getUserLink } from "./getUserLink.js";

export const getClickableName = (user) => {
    return `<a href="${getUserLink(user)}">${formatUsername(user)}</a>`
}
