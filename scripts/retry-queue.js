// Ordered set of items to retry, keyed so the same item can't be queued twice.
// Data only: each page decides when to add, remove and replay.
export class RetryQueue {
    // Plain underscore field: private #fields fail to parse on iOS < 14.5 and would stop the whole page script
    constructor() {
        this._items = new Map();
    }

    add(key, item) {
        if (!this._items.has(key)) this._items.set(key, item);
    }

    remove(key) {
        this._items.delete(key);
    }

    has(key) {
        return this._items.has(key);
    }

    items() {
        return [...this._items.values()];
    }

    clear() {
        this._items.clear();
    }

    get size() {
        return this._items.size;
    }
}

// Stable key for a word entry
export function wordKey(word) {
    return `${word.hawaiian}|${word.english}`;
}
