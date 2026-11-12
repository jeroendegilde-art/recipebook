// Ingrediënten naar de boodschappenlijst van Nook sturen. Zelfde API als v1.

import { h, icon, toast } from '../dom.js';
import { state } from '../store.js';
import { scaleIngredient } from '../quantity.js';

export function openNookSheet(recipe, factor) {
    const items = recipe.ingredients
        .filter(text => !(/:\s*$/.test(text) && !/\d/.test(text)))
        .map(text => ({ text: scaleIngredient(text, factor), on: true }));

    const list = h('ul', { class: 'ingredients' });
    const status = h('p', { class: 'form-status', role: 'status' });
    const toggleAll = h('button', { class: 'btn btn-quiet', type: 'button' });
    const send = h('button', { class: 'btn btn-primary', type: 'button' });

    function refresh() {
        const selected = items.filter(i => i.on).length;
        toggleAll.textContent = selected === items.length ? 'Niets selecteren' : 'Alles selecteren';
        send.textContent = selected === 1 ? 'Stuur 1 ingrediënt' : `Stuur ${selected} ingrediënten`;
        send.disabled = selected === 0;
        list.replaceChildren(...items.map(item => h('li', null,
            h('button', {
                class: `ingredient${item.on ? '' : ' is-off'}`, type: 'button',
                role: 'checkbox', 'aria-checked': String(item.on),
                onclick: () => { item.on = !item.on; refresh(); },
            },
                h('span', { class: `checkbox${item.on ? ' is-on' : ''}` }, icon('check')),
                h('span', { class: 'ingredient-text' }, item.text),
            ),
        )));
    }

    toggleAll.addEventListener('click', () => {
        const all = items.every(i => i.on);
        items.forEach(i => { i.on = !all; });
        refresh();
    });

    send.addEventListener('click', async () => {
        const selected = items.filter(i => i.on).map(i => i.text);
        send.disabled = true;
        send.textContent = 'Versturen…';
        status.textContent = '';
        try {
            const response = await fetch(`${state.settings.nookUrl}/api/shopping`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.settings.nookToken}` },
                body: JSON.stringify({ items: selected }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            const parts = [];
            if (data.added > 0) parts.push(`${data.added} toegevoegd`);
            if (data.skipped > 0) parts.push(`${data.skipped} stonden er al`);
            dialog.close();
            toast(parts.join(', ') || 'Verstuurd naar Nook');
        } catch (error) {
            status.textContent = `Versturen lukte niet: ${error.message}`;
            refresh();
        }
    });

    const dialog = h('dialog', { class: 'dialog dialog-sheet' },
        h('h2', { class: 'dialog-title' }, 'Naar Nook'),
        h('p', { class: 'dialog-body' }, recipe.title),
        toggleAll,
        list,
        status,
        h('div', { class: 'dialog-actions' },
            h('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, 'Annuleren'),
            send,
        ),
    );
    document.body.appendChild(dialog);
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => dialog.remove());
    refresh();
    dialog.showModal();
}
