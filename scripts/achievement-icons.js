const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">`;

const paths = {
    cards: `<rect x="3" y="6" width="14" height="14" rx="2" fill="currentColor" fill-opacity=".18"/><path d="M7 6V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2"/>`,
    pencil: `<path d="M17 3a2.8 2.8 0 0 1 4 4L8 20l-5 1 1-5z" fill="currentColor" fill-opacity=".18"/><path d="M14 6l4 4"/>`,
    stack: `<path d="M12 3l9 5-9 5-9-5z" fill="currentColor" fill-opacity=".18"/><path d="M3 12.5l9 5 9-5"/><path d="M3 17l9 5 9-5"/>`,
    flame: `<path d="M12 22a7 7 0 0 0 7-7c0-3-1.5-5-3-7-.5 1.5-1.5 2.5-2.5 3 0-3-1-6-3.5-8-.5 3-2 5-3.5 7-1 1.5-1.5 3-1.5 5a7 7 0 0 0 7 7z" fill="currentColor" fill-opacity=".18"/>`,
    target: `<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".18"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>`,
    quiz: `<rect x="4" y="3" width="16" height="18" rx="2" fill="currentColor" fill-opacity=".18"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h4"/>`,
    star: `<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.2 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" fill="currentColor" fill-opacity=".18"/>`,
    check: `<path d="M5 12.5l4.5 4.5L19 7.5"/>`
};

// Returns inline SVG markup so the icon inherits its colour from currentColor
export function achievementIcon(name) {
    return `${open}${paths[name] ?? paths.target}</svg>`;
}
