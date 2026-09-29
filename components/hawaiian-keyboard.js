const LOWER = ['ʻ', 'ā', 'ē', 'ī', 'ō', 'ū'];
const UPPER = ['ʻ', 'Ā', 'Ē', 'Ī', 'Ō', 'Ū'];

class HawaiianKeyboard extends HTMLElement {
    constructor() {
        super();
        this.shifted = false;
        this.toggle = null;
        this.popup = null;
        this.input = null;
        this.onDocPointerDown = (e) => {
            if (!this.contains(e.target)) this.close();
        };
        this.onKeyDown = (e) => {
            if (e.key === 'Escape' && this.isOpen()) {
                e.stopPropagation();
                this.close();
                if (this.input) this.input.focus();
            }
        };
    }

    connectedCallback() {
        if (!this.toggle) this.build();
        this.attachInput();
        // Script may load before the markup is fully parsed; retry once parsing finishes.
        if (!this.input && document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.attachInput(), { once: true });
        }
        this.addEventListener('keydown', this.onKeyDown);
    }

    disconnectedCallback() {
        document.removeEventListener('pointerdown', this.onDocPointerDown, true);
        this.removeEventListener('keydown', this.onKeyDown);
    }

    build() {
        this.toggle = this.makeButton('hk-toggle', 'ā');
        this.toggle.setAttribute('aria-label', 'Hawaiian letters');
        this.toggle.setAttribute('aria-haspopup', 'true');
        this.toggle.setAttribute('aria-expanded', 'false');

        this.popup = document.createElement('div');
        this.popup.className = 'hk-popup';
        this.popup.setAttribute('role', 'toolbar');
        this.popup.setAttribute('aria-label', 'Hawaiian letters');
        this.popup.hidden = true;

        this.keys = LOWER.map((ch) => {
            const key = this.makeButton('hk-key', ch);
            key.addEventListener('click', () => this.insert(key.textContent));
            this.popup.append(key);
            return key;
        });
        this.shiftKey = this.makeButton('hk-key hk-shift', '⇧');
        this.shiftKey.setAttribute('aria-label', 'Capital vowels');
        this.shiftKey.setAttribute('aria-pressed', 'false');
        this.shiftKey.addEventListener('click', () => this.setShift(!this.shifted));
        this.popup.append(this.shiftKey);

        // Keep input focus on pointer press; stop Enter/Space from reaching page-level handlers.
        for (const el of [this.toggle, this.popup]) {
            el.addEventListener('pointerdown', (e) => e.preventDefault());
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
            });
        }
        this.toggle.addEventListener('click', () => (this.isOpen() ? this.close() : this.open()));

        this.append(this.toggle, this.popup);
    }

    makeButton(cls, text) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = cls;
        b.textContent = text;
        return b;
    }

    attachInput() {
        if (this.input && this.contains(this.input)) return;
        this.input = this.querySelector('input, textarea');
        if (this.input) this.input.classList.add('hk-input');
    }

    setShift(on) {
        this.shifted = on;
        this.shiftKey.setAttribute('aria-pressed', String(on));
        const set = on ? UPPER : LOWER;
        this.keys.forEach((k, i) => { k.textContent = set[i]; });
    }

    insert(ch) {
        this.attachInput();
        const input = this.input;
        if (!input) return;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        input.setRangeText(ch, start, end, 'end');
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    isOpen() {
        return !!this.popup && !this.popup.hidden;
    }

    open() {
        this.popup.hidden = false;
        this.toggle.setAttribute('aria-expanded', 'true');
        document.addEventListener('pointerdown', this.onDocPointerDown, true);
        this.keepInViewport();
    }

    close() {
        if (!this.isOpen()) return;
        this.popup.hidden = true;
        this.toggle.setAttribute('aria-expanded', 'false');
        document.removeEventListener('pointerdown', this.onDocPointerDown, true);
    }

    // Shift the popup horizontally so it is never clipped by the viewport edges.
    keepInViewport() {
        this.popup.style.transform = '';
        const rect = this.popup.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        const margin = 8;
        let shift = 0;
        if (rect.right > vw - margin) shift = vw - margin - rect.right;
        if (rect.left + shift < margin) shift = margin - rect.left;
        if (shift) this.popup.style.transform = `translateX(${shift}px)`;
    }
}

if (!customElements.get('hawaiian-keyboard')) {
    customElements.define('hawaiian-keyboard', HawaiianKeyboard);
}
