// A sheet to pick ingredients of a recipe and send them somewhere: the
// shopping list in this app, or Nook.

import { h, icon } from '../dom.js';
import { scaleIngredient } from '../quantity.js';
import { isHeading } from './ingredients.js';

/**
 * @param title      heading of the sheet
 * @param verb       word on the button: "Add" -> "Add 3 ingredients"
 * @param busyLabel  text on the button while onConfirm runs
 * @param onConfirm  async (lines) => void. Throwing keeps the sheet open and shows the message.
 */
export function openIngredientPicker({ title, recipe, factor, verb, busyLabel = 'Working…', onConfirm }) {
    const items = recipe.ingredients
        .filter(text => !isHeading(text))
        .map(text => ({ text: scaleIngredient(text, factor), on: true }));

    const list = h('ul', { class: 'ingredients' });
    const status = h('p', { class: 'form-status', role: 'status' });
    const toggleAll = h('button', { class: 'btn btn-quiet', type: 'button' });
    const confirm = h('button', { class: 'btn btn-primary', type: 'button' });

    function refresh() {
        const selected = items.filter(i => i.on).length;
        toggleAll.textContent = selected === items.length ? 'Select none' : 'Select all';
        confirm.textContent = selected === 1 ? `${verb} 1 ingredient` : `${verb} ${selected} ingredients`;
        confirm.disabled = selected === 0;
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

    confirm.addEventListener('click', async () => {
        confirm.disabled = true;
        confirm.textContent = busyLabel;
        status.textContent = '';
        try {
            await onConfirm(items.filter(i => i.on).map(i => i.text));
            dialog.close();
        } catch (error) {
            status.textContent = error.message;
            refresh();
        }
    });

    const dialog = h('dialog', { class: 'dialog dialog-sheet' },
        h('h2', { class: 'dialog-title' }, title),
        h('p', { class: 'dialog-body' }, recipe.title),
        toggleAll,
        list,
        status,
        h('div', { class: 'dialog-actions' },
            h('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, 'Cancel'),
            confirm,
        ),
    );
    document.body.appendChild(dialog);
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => dialog.remove());
    refresh();
    dialog.showModal();
}
