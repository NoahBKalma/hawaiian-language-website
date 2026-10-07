// Pure logic for the unit "Quick check" gate: which questions have been answered correctly, and whether Done may be pressed.
export const checkKey = (target, n) => `haw-unit-check:${target}:${n}`;

// Stored value is a JSON array of question indexes answered correctly. Anything malformed or out of range is dropped.
export function parsePassed(raw, count) {
    let arr;
    try { arr = JSON.parse(raw); } catch { return new Set(); }
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter(i => Number.isInteger(i) && i >= 0 && i < count));
}

export const serializePassed = set => JSON.stringify([...set].sort((a, b) => a - b));

// Units without checks never gate Done.
export const allPassed = (count, set) => count === 0 || (set.size === count && [...set].every(i => i >= 0 && i < count));

export const isCorrect = (q, optionIndex) => Number(optionIndex) === q.answer;
