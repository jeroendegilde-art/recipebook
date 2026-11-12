// DOM-hulpjes. Alles wat van de gebruiker of van internet komt gaat via
// textContent of setAttribute, nooit via innerHTML. Daarmee is injectie uitgesloten.

/**
 * Maak een element. h('button', { class: 'btn', onclick: fn }, 'Tekst', childNode)
 * Kinderen: tekst, nodes, arrays, of null/false (wordt overgeslagen).
 */
export function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
        for (const [key, value] of Object.entries(props)) {
            if (value === null || value === undefined || value === false) continue;
            if (key === 'class') el.className = value;
            else if (key === 'dataset') Object.assign(el.dataset, value);
            else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
            else if (value === true) el.setAttribute(key, '');
            else el.setAttribute(key, String(value));
        }
    }
    append(el, children);
    return el;
}

function append(parent, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) child.forEach(c => append(parent, c));
    else if (child instanceof Node) parent.appendChild(child);
    else parent.appendChild(document.createTextNode(String(child)));
}

export function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
}

export function replaceChildren(el, ...children) {
    clear(el);
    append(el, children);
    return el;
}

// Vaste iconen. Dit zijn constanten uit deze file, dus innerHTML is hier veilig.
const ICON_PATHS = {
    back: '<path d="M15 5l-7 7 7 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    star: '<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.6l5.8-.8z"/>',
    more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.1 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9c.3.6.9 1 1.5 1h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l5 4.5 9-10"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    share: '<path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/>',
    print: '<path d="M7 9V4h10v5M7 17H4v-6h16v6h-3M7 14h10v6H7z"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.3M20 5v6h-6"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    cart: '<path d="M3 4h2.5l2.2 11h10.6l1.7-8H6.4"/><circle cx="9.5" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    chevron: '<path d="M9 5l7 7-7 7"/>',
    pot: '<path d="M4 10h16v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM2 10h20M9 6V4M15 6V4"/>',
};

export function icon(name, { filled = false } = {}) {
    const span = document.createElement('span');
    span.className = 'icon';
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = `<svg viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ''}</svg>`;
    return span;
}

// --- Melding onderaan. Eén tegelijk, valt niet over de inhoud heen. ---

let toastTimer = null;

export function dismissToast() {
    const host = document.getElementById('toast');
    if (!host) return;
    clearTimeout(toastTimer);
    host.hidden = true;
    clear(host);
}

export function toast(message, { action, onAction, tone = 'neutral', duration = 2800 } = {}) {
    const host = document.getElementById('toast');
    if (!host) return;
    clearTimeout(toastTimer);
    const dismiss = dismissToast;
    host.onclick = e => { if (!e.target.closest('.toast-action')) dismiss(); };
    replaceChildren(host,
        h('span', { class: 'toast-text' }, message),
        action && h('button', {
            class: 'toast-action', type: 'button',
            onclick: () => { dismiss(); onAction?.(); },
        }, action),
    );
    host.dataset.tone = tone;
    host.hidden = false;
    toastTimer = setTimeout(dismiss, action ? Math.max(duration, 6000) : duration);
}

// --- Dialogen op basis van <dialog>: Escape en focus regelt de browser. ---

function openDialog(content, { className = '' } = {}) {
    const dialog = h('dialog', { class: `dialog ${className}`.trim() }, content);
    document.body.appendChild(dialog);
    // Tik naast de dialoog sluit hem.
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => dialog.remove());
    dialog.showModal();
    return dialog;
}

export function confirmDialog({ title, body, confirmLabel = 'OK', cancelLabel = 'Annuleren', danger = false }) {
    return new Promise(resolve => {
        let result = false;
        const dialog = openDialog([
            h('h2', { class: 'dialog-title' }, title),
            body && h('p', { class: 'dialog-body' }, body),
            h('div', { class: 'dialog-actions' },
                h('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, cancelLabel),
                h('button', {
                    class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', autofocus: true,
                    onclick: () => { result = true; dialog.close(); },
                }, confirmLabel),
            ),
        ]);
        dialog.addEventListener('close', () => resolve(result));
    });
}

export function promptDialog({ title, label, value = '', confirmLabel = 'Opslaan', placeholder = '' }) {
    return new Promise(resolve => {
        let result = null;
        const input = h('input', { class: 'input', type: 'text', value, placeholder, 'aria-label': label || title });
        const form = h('form', {
            method: 'dialog',
            onsubmit: e => { e.preventDefault(); result = input.value.trim(); dialog.close(); },
        },
            h('h2', { class: 'dialog-title' }, title),
            label && h('label', { class: 'field-label' }, label),
            input,
            h('div', { class: 'dialog-actions' },
                h('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, 'Annuleren'),
                h('button', { class: 'btn btn-primary', type: 'submit' }, confirmLabel),
            ),
        );
        const dialog = openDialog(form);
        input.focus();
        input.select();
        dialog.addEventListener('close', () => resolve(result || null));
    });
}

/** Menu met acties. items: [{ label, icon, danger, checked, onSelect }] */
export function actionSheet(title, items) {
    const dialog = openDialog([
        title && h('h2', { class: 'dialog-title' }, title),
        h('div', { class: 'sheet-list', role: 'menu' },
            items.filter(Boolean).map(item => h('button', {
                class: `sheet-item${item.danger ? ' is-danger' : ''}`, type: 'button', role: 'menuitem',
                onclick: () => { dialog.close(); item.onSelect?.(); },
            },
                item.icon && icon(item.icon),
                h('span', { class: 'sheet-label' }, item.label),
                item.checked && icon('check'),
            )),
        ),
    ], { className: 'dialog-sheet' });
    return dialog;
}

/** Alleen http(s)-links worden aanklikbaar. Geen javascript:-urls. */
export function safeUrl(value) {
    try {
        const url = new URL(String(value));
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch {
        return null;
    }
}

export function hostName(value) {
    try { return new URL(String(value)).hostname.replace(/^www\./, ''); } catch { return String(value || ''); }
}
