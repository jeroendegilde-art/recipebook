// The shopping list, with what every item costs at Albert Heijn and at Jumbo.
//
// Prices are typed in by hand and remembered per product. The app has no line
// to the stores: neither offers a public price or ordering API. "Shop at"
// opens the store's own site per item; you fill the basket and pay there.
//
// The rows are rebuilt only when the list itself changes. Typing a price
// updates the numbers in place, so the field you tab into keeps its focus.

import { h, icon, replaceChildren, toast, confirmDialog, actionSheet, openDialog } from '../dom.js';
import {
    state, on, addShoppingItems, updateShoppingItem, removeShoppingItems, setPrice, getShoppingItem,
} from '../store.js';
import { back, paths } from '../router.js';
import {
    STORES, compare, cheaperStore, searchTerm, parsePrice, formatPrice, formatAmount, listAsText,
} from '../shopping.js';
import { openIngredientPicker } from './picker.js';

const plural = (n, one, many) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** From a recipe: pick ingredients and put them on the list. */
export function openAddToListSheet(recipe, factor) {
    openIngredientPicker({
        title: 'Add to shopping list', recipe, factor, verb: 'Add',
        onConfirm: lines => {
            const { added, merged } = addShoppingItems(lines.map(text => ({ text, recipeTitle: recipe.title })));
            const parts = [];
            if (added > 0) parts.push(`${added} added`);
            if (merged > 0) parts.push(`${merged} combined with what was on the list`);
            toast(parts.join(', ') || 'Nothing to add');
        },
    });
}

export function mountShopping(container) {
    let structure = null;

    const input = h('input', {
        class: 'input', type: 'text', autocomplete: 'off', enterkeyhint: 'done',
        'aria-label': 'New item', placeholder: 'Add an item, for example 2 l milk',
    });
    const addForm = h('form', {
        class: 'input-row shop-add',
        onsubmit: e => {
            e.preventDefault();
            if (!input.value.trim()) return;
            const { added, merged } = addShoppingItems([{ text: input.value }]);
            if (merged > 0) toast('Already on the list. The amounts are combined.');
            if (added + merged > 0) input.value = '';
            input.focus();
        },
    }, input, h('button', { class: 'btn btn-primary', type: 'submit' }, icon('plus'), 'Add'));

    const tally = h('section', { class: 'tally', 'aria-live': 'polite' });
    const head = h('div', { class: 'shop-head', 'aria-hidden': 'true' },
        h('span', null, 'Price per pack'),
        STORES.map(store => h('span', { class: 'shop-head-store' }, store.short)),
    );
    const list = h('ul', { class: 'shop-list' });
    const empty = h('div', { class: 'empty' },
        h('p', { class: 'empty-title' }, 'Nothing on the list'),
        h('p', null, 'Type an item above, or open a recipe and tap "Add to list".'),
    );
    const storeButtons = h('div', { class: 'button-row shop-stores' },
        STORES.map(store => h('button', {
            class: 'btn', type: 'button', onclick: () => openStoreSheet(store),
        }, icon('cart'), `Shop at ${store.short}`)),
    );
    const moreButton = h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': 'More actions', onclick: openMenu,
    }, icon('more'));

    replaceChildren(container,
        h('header', { class: 'topbar' },
            h('button', { class: 'btn btn-quiet back-btn', type: 'button', onclick: () => back(paths.home) },
                icon('back'), 'Recipes'),
            h('div', { class: 'topbar-actions' }, moreButton),
        ),
        h('div', { class: 'page shop' },
            h('h1', { class: 'page-title' }, 'Shopping list'),
            addForm,
            tally,
            head,
            list,
            empty,
            storeButtons,
        ),
    );

    // --- Rows ---

    function priceInput(item, store) {
        return h('input', {
            class: 'price-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '–',
            'aria-label': `Price of ${item.name} at ${store.name}`,
            dataset: { store: store.id },
            onfocus: e => e.target.select(),
            onkeydown: e => { if (e.key === 'Enter') e.target.blur(); },
            onchange: e => {
                const text = e.target.value.trim();
                const value = parsePrice(text);
                const invalid = text !== '' && value === null;
                e.target.classList.toggle('is-invalid', invalid);
                if (invalid) { toast('Type a price like 1,99', { tone: 'error' }); return; }
                setPrice(item.key, store.id, value);
            },
        });
    }

    function row(item) {
        return h('li', { class: `shop-row${item.checked ? ' is-checked' : ''}`, dataset: { id: item.id } },
            h('button', {
                class: 'shop-check', type: 'button', role: 'checkbox', 'aria-checked': String(item.checked),
                'aria-label': `${item.text} is in the cart`,
                onclick: () => updateShoppingItem(item.id, { checked: !item.checked }),
            }, h('span', { class: `checkbox${item.checked ? ' is-on' : ''}` }, icon('check'))),
            h('button', {
                class: 'shop-item', type: 'button', 'aria-label': `Edit ${item.text}`,
                onclick: () => openEdit(item.id),
            },
                h('span', { class: 'shop-name' },
                    item.count > 1 && h('span', { class: 'shop-count' }, `${item.count}×`),
                    item.amount && h('span', { class: 'shop-amount' }, item.amount),
                    item.name,
                ),
                item.recipeTitle && h('span', { class: 'shop-from' }, item.recipeTitle),
            ),
            STORES.map(store => priceInput(item, store)),
        );
    }

    // What you still need comes first, what is in the cart sinks to the bottom.
    const ordered = () => [
        ...state.shopping.items.filter(item => !item.checked),
        ...state.shopping.items.filter(item => item.checked),
    ];

    function refreshPrices() {
        for (const el of list.children) {
            const item = getShoppingItem(el.dataset.id);
            if (!item) continue;
            const known = state.shopping.prices[item.key];
            const best = item.checked ? null : cheaperStore(known);
            el.querySelectorAll('.price-input').forEach(field => {
                const value = known?.[field.dataset.store];
                if (field !== document.activeElement && !field.classList.contains('is-invalid')) {
                    field.value = value > 0 ? formatAmount(value) : '';
                }
                field.classList.toggle('is-best', best === field.dataset.store);
            });
        }
    }

    function renderTally() {
        const result = compare(state.shopping.items, state.shopping.prices);
        tally.hidden = result.count === 0;
        if (result.count === 0) return;

        const column = store => {
            const { total, priced, missing } = result.stores[store.id];
            return h('div', { class: `tally-store${result.cheapest === store.id ? ' is-cheapest' : ''}` },
                h('span', { class: 'tally-name' }, store.name),
                h('span', { class: 'tally-total' }, priced > 0 ? formatPrice(total) : '–'),
                h('span', { class: 'tally-note' }, missing > 0
                    ? `${plural(missing, 'item', 'items')} without a price`
                    : 'All items priced'),
            );
        };

        let verdict;
        if (result.both.count === 0) {
            verdict = 'Enter a price at both stores for the same item to compare.';
        } else {
            const scope = result.both.count === result.count
                ? 'on this list'
                : `on the ${plural(result.both.count, 'item', 'items')} priced at both stores`;
            const winner = STORES.find(store => store.id === result.cheapest);
            verdict = winner
                ? `${winner.name} is ${formatPrice(result.saving)} cheaper ${scope}.`
                : `Both stores cost the same ${scope}.`;
        }

        replaceChildren(tally,
            h('div', { class: 'tally-stores' }, STORES.map(column)),
            h('p', { class: 'tally-verdict' }, verdict),
            result.splitSaving > 0 && h('p', { class: 'tally-note' },
                `Buying each item where it is cheapest saves another ${formatPrice(result.splitSaving)}.`),
        );
    }

    function render() {
        const items = ordered();
        const next = JSON.stringify(items.map(i => [i.id, i.text, i.count, i.checked, i.recipeTitle]));
        if (next !== structure) {
            structure = next;
            replaceChildren(list, items.map(row));
        }
        const none = items.length === 0;
        empty.hidden = !none;
        head.hidden = none;
        storeButtons.hidden = !items.some(item => !item.checked);
        refreshPrices();
        renderTally();
    }

    // --- Editing one item ---

    function openEdit(id) {
        const item = getShoppingItem(id);
        if (!item) return;
        const known = state.shopping.prices[item.key];
        const name = h('input', { class: 'input', type: 'text', value: item.name, required: true, autocomplete: 'off' });
        const amount = h('input', { class: 'input', type: 'text', value: item.amount, autocomplete: 'off', placeholder: '500 g' });
        const count = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 1, max: 99, step: 1, value: item.count });
        const saved = known?.updatedAt && new Date(known.updatedAt);

        const form = h('form', {
            method: 'dialog',
            onsubmit: e => {
                e.preventDefault();
                if (!name.value.trim()) return;
                const packs = Math.round(Number(count.value));
                updateShoppingItem(id, {
                    name: name.value, amount: amount.value, count: packs >= 1 && packs <= 99 ? packs : 1,
                });
                dialog.close();
            },
        },
            h('h2', { class: 'dialog-title' }, 'Edit item'),
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Item'), name),
            h('div', { class: 'field-row' },
                h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Amount needed'), amount),
                h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Packs to buy'), count),
            ),
            h('p', { class: 'field-hint' },
                'The price is per pack. Look it up: ',
                STORES.map((store, i) => [
                    i > 0 && ' · ',
                    h('a', { href: store.searchUrl(searchTerm(item.name)), target: '_blank', rel: 'noopener noreferrer' }, store.site),
                ]),
                saved && !Number.isNaN(saved.getTime())
                    && ` Prices last changed on ${saved.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.`,
            ),
            h('div', { class: 'dialog-actions' },
                h('button', {
                    class: 'btn btn-quiet shop-delete', type: 'button',
                    onclick: () => {
                        const undo = removeShoppingItems([id]);
                        dialog.close();
                        toast('Item removed', { action: 'Undo', onAction: undo });
                    },
                }, icon('trash'), 'Remove'),
                h('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, 'Cancel'),
                h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save'),
            ),
        );
        const dialog = openDialog(form);
    }

    // --- Handing the list to a store ---

    async function copyList() {
        try {
            await navigator.clipboard.writeText(listAsText(state.shopping.items));
            toast('List copied');
        } catch { toast('Could not copy the list', { tone: 'error' }); }
    }

    function openStoreSheet(store) {
        const items = state.shopping.items.filter(item => !item.checked);
        const dialog = openDialog([
            h('h2', { class: 'dialog-title' }, `Shop at ${store.name}`),
            h('p', { class: 'dialog-body' },
                `Each item opens a search on ${store.site}. Put it in your basket there. `
                + `You order and pay on ${store.site} itself; this app cannot place the order.`),
            h('ul', { class: 'store-links' }, items.map(item => {
                const price = state.shopping.prices[item.key]?.[store.id];
                return h('li', null, h('a', {
                    class: 'store-link', href: store.searchUrl(searchTerm(item.name)), target: '_blank', rel: 'noopener noreferrer',
                    onclick: e => e.currentTarget.classList.add('is-opened'),
                },
                    h('span', { class: 'store-link-text' }, item.count > 1 ? `${item.count}× ${item.text}` : item.text),
                    price > 0 && h('span', { class: 'store-link-price' }, formatPrice(price * item.count)),
                    icon('chevron'),
                ));
            })),
            h('div', { class: 'dialog-actions' },
                h('button', { class: 'btn', type: 'button', onclick: copyList }, icon('copy'), 'Copy list'),
                h('button', { class: 'btn btn-primary', type: 'button', onclick: () => dialog.close() }, 'Done'),
            ),
        ], { className: 'dialog-sheet' });
    }

    function openMenu() {
        const items = state.shopping.items;
        const checked = items.filter(item => item.checked);
        if (items.length === 0) { toast('The list is empty'); return; }
        actionSheet('Shopping list', [
            { label: 'Copy list', icon: 'copy', onSelect: copyList },
            checked.length > 0 && {
                label: `Remove ${plural(checked.length, 'item', 'items')} in the cart`, icon: 'check',
                onSelect: () => {
                    const undo = removeShoppingItems(checked.map(item => item.id));
                    toast('Removed', { action: 'Undo', onAction: undo });
                },
            },
            {
                label: 'Clear the list', icon: 'trash', danger: true,
                onSelect: async () => {
                    const ok = await confirmDialog({
                        title: 'Clear the list?', body: 'The prices you entered are kept for next time.',
                        confirmLabel: 'Clear', danger: true,
                    });
                    if (!ok) return;
                    const undo = removeShoppingItems(items.map(item => item.id));
                    toast('List cleared', { action: 'Undo', onAction: undo });
                },
            },
        ]);
    }

    const stop = on('shopping', render);
    render();

    return { destroy() { stop(); } };
}
