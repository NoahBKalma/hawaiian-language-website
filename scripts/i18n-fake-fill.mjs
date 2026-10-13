// Fake fill for the headless check: with ?i18n=fake in Hawaiian, an empty haw renders as ⟦English⟧ so any
// interface text that was never keyed (or never re-applied) stands out. Pure logic; no table is modified.
export function isFakeFill(search) {
    return /[?&]i18n=fake(?:&|$)/.test(String(search || ``));
}

export function fakeWrap(text) {
    return `⟦${text}⟧`;
}
