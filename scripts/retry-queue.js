// Ordered set of items to retry, keyed so the same item can't be queued twice.
// Data only: each page decides when to add, remove and replay.
export class RetryQueue {
    #items = new Map();

    add(key, item) {
        if (!this.#items.has(key)) this.#items.set(key, item);
    }

    remove(key) {
        this.#items.delete(key);
    }

    has(key) {
        return this.#items.has(key);
    }

    items() {
        return [...this.#items.values()];
    }

    clear() {
        this.#items.clear();
    }

    get size() {
        return this.#items.size;
    }
}

// Stable key for a word entry
export function wordKey(word) {
    return `${word.hawaiian}|${word.english}`;
}
