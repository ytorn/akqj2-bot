const locks = new Set();

export const withLock = (key, fn) => {
    if (locks.has(key)) {
        return null;
    }

    locks.add(key);

    return Promise.resolve()
        .then(fn)
        .finally(() => locks.delete(key));
}
