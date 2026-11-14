// The shopping list, with what every item costs at Albert Heijn and at Jumbo.
//
// Where a price comes from, in this order:
//   1. a product you (or the AI matcher) picked from the store's range: today's price
//   2. a price you typed
//   3. a product the app matched by itself, only when the name fits exactly
// The range and prices come from Checkjebon's open data (see catalog.js).
//
// The app cannot order. "Shop at" opens the product pages on the store's own
// site; you fill the basket and pay there.

import { h, icon, replaceChildren, toast, confirmDialog, actionSheet, openDialog } from '../dom.js';
import {
    state, on, currentModel, setTerms, addShoppingItems, updateShoppingItem, removeShoppingItems, setOffers, getShoppingItem,
} from '../store.js';
import { back, paths } from '../router.js';
import {
    STORES, compare, cheaperStore, parsePrice, formatPrice, listAsText, packsNeeded,
} from '../shopping.js';
import { SOURCE, getCatalog, loadCatalog, resolveOffer, storeTerm, search, productUrl } from '../catalog.js';
import { matchWithAI, translateWithAI } from '../aimatch.js';
import { openIngredientPicker } from './picker.js';

const plural = (n, one, many) => (n === 1 ? `1 ${one}` : `${n} ${many}`);
const productLabel = product => [product.n, product.s].filter(Boolean).join(' · ');

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
    let catalog = getCatalog();
    let catalogState = catalog ? 'ready' : 'loading'; // 'loading' | 'ready' | 'error'
    let matching = false;
    let alive = true;

    const input = h('input', {
        class: 'input', type: 'text', autocomplete: 'off', enterkeyhint: 'done',
        'aria-label': 'New item', placeholder: 'Add an item, for example 2 l melk',
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
    const tools = h('div', { class: 'shop-tools' });
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
            tools,
            list,
            empty,
            storeButtons,
        ),
    );

    // --- Prices ---

    function fetchPrices(force = false) {
        catalogState = catalog ? 'ready' : 'loading';
        render();
        loadCatalog({ force }).then(loaded => {
            catalog = loaded;
            catalogState = 'ready';
        }).catch(error => {
            console.error('Loading prices failed', error);
            catalogState = 'error';
        }).finally(() => { if (alive) render(); });
    }

    // An offer with the number of packs this item takes and what that costs.
    // You can fix the packs yourself; otherwise amount and pack size decide.
    function offerFor(item, store) {
        const offer = resolveOffer(item, store.id, state.shopping, catalog);
        if (!offer) return null;
        const packs = item.count > 0 ? item.count : offer.product ? packsNeeded(item, offer.product) : 1;
        return { ...offer, packs, total: Math.round(offer.price * packs * 100) / 100 };
    }

    // --- Rows ---

    function offerButton(item, store, offer, best) {
        const state_ = !offer ? ' is-empty' : offer.source === 'auto' ? ' is-auto' : '';
        const times = offer && offer.packs > 1 ? `${offer.packs} × ` : '';
        const detail = !offer ? (catalogState === 'loading' ? 'Loading…' : 'Choose product')
            : offer.product ? times + productLabel(offer.product)
            : `${times}Typed by hand`;
        return h('button', {
            class: `offer${state_}${best ? ' is-best' : ''}`, type: 'button',
            'aria-label': `${store.name}: ${offer ? `${formatPrice(offer.total)}, ${detail}` : 'no price'}. Change.`,
            dataset: { store: store.id },
            onclick: () => openOfferSheet(item.id, store),
        },
            h('span', { class: 'offer-top' },
                h('span', { class: 'offer-store' }, store.short),
                h('span', { class: 'offer-price' }, offer ? formatPrice(offer.total) : '–'),
            ),
            h('span', { class: 'offer-product' }, detail),
        );
    }

    function row(item, offers) {
        const best = item.checked ? null
            : cheaperStore(Object.fromEntries(STORES.map(store => [store.id, offers[store.id]?.total])));
        return h('li', { class: `shop-row${item.checked ? ' is-checked' : ''}`, dataset: { id: item.id } },
            h('button', {
                class: 'shop-check', type: 'button', role: 'checkbox', 'aria-checked': String(item.checked),
                'aria-label': `${item.text} is in the cart`,
                onclick: () => updateShoppingItem(item.id, { checked: !item.checked }),
            }, h('span', { class: `checkbox${item.checked ? ' is-on' : ''}` }, icon('check'))),
            h('div', { class: 'shop-body' },
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
                h('div', { class: 'shop-offers' },
                    STORES.map(store => offerButton(item, store, offers[store.id], best === store.id))),
            ),
        );
    }

    // What you still need comes first, what is in the cart sinks to the bottom.
    const ordered = () => [
        ...state.shopping.items.filter(item => !item.checked),
        ...state.shopping.items.filter(item => item.checked),
    ];

    function renderTally(open, offersById) {
        // The packs are already in each total, so every line counts once.
        const lines = open.map(item => ({ key: item.id, checked: false, count: 1 }));
        const totals = Object.fromEntries(open.map(item => [item.id,
            Object.fromEntries(STORES.map(store => [store.id, offersById[item.id][store.id]?.total]))]));
        const result = compare(lines, totals);
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
            verdict = catalogState === 'loading' ? 'Loading today\'s prices…'
                : 'No item has a price at both stores yet.';
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

    function renderTools(open, offersById) {
        const missing = open.reduce((n, item) => n + STORES.filter(store => !offersById[item.id][store.id]).length, 0);
        let status;
        if (catalogState === 'loading') {
            status = 'Loading today\'s prices…';
        } else if (catalogState === 'error') {
            status = ['Could not load the store prices. Tap a price to type it yourself. ',
                h('button', { class: 'link-btn', type: 'button', onclick: () => fetchPrices(true) }, 'Try again')];
        } else {
            const when = new Date(catalog.fetchedAt);
            const sameDay = when.toDateString() === new Date().toDateString();
            const time = when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            status = ['Prices from ',
                h('a', { href: SOURCE.url, target: '_blank', rel: 'noopener noreferrer' }, SOURCE.name),
                `, fetched ${sameDay ? `today at ${time}` : when.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}. `
                + 'Each price covers the packs your amount takes. Offers and bonus prices are not included.'];
        }

        const canMatch = catalogState === 'ready' && missing > 0 && open.length > 0;
        replaceChildren(tools,
            open.length > 0 && h('p', { class: 'shop-status' }, status),
            canMatch && h('div', { class: 'shop-missing' },
                h('p', null, `${plural(missing, 'price is', 'prices are')} missing. Tap one to choose the product`
                    + (state.settings.apiKey ? ', or let AI choose.' : '.')),
                state.settings.apiKey && h('button', {
                    class: 'btn btn-small', type: 'button', disabled: matching, onclick: () => runAiMatch(),
                }, matching ? 'Choosing…' : 'Choose with AI'),
            ),
        );
    }

    function render() {
        const items = ordered();
        const offersById = {};
        for (const item of items) {
            offersById[item.id] = Object.fromEntries(STORES.map(store => [store.id, offerFor(item, store)]));
        }
        replaceChildren(list, items.map(item => row(item, offersById[item.id])));
        const open = items.filter(item => !item.checked);
        empty.hidden = items.length > 0;
        storeButtons.hidden = open.length === 0;
        renderTally(open, offersById);
        renderTools(open, offersById);
    }

    // --- Choosing the product for one item at one store ---

    function openOfferSheet(id, store) {
        const item = getShoppingItem(id);
        if (!item) return;
        const products = catalog?.stores?.[store.id]?.products || null;
        const current = offerFor(item, store);
        const results = h('ul', { class: 'product-list' });
        const query = h('input', {
            class: 'search-input', type: 'search', autocomplete: 'off', enterkeyhint: 'search',
            'aria-label': `Search ${store.name}`, value: storeTerm(item, state.shopping),
            oninput: () => showResults(),
        });
        const priceField = h('input', {
            class: 'input', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '1,99',
            'aria-label': 'Price per pack', value: current?.source === 'manual' ? current.price.toFixed(2) : '',
        });
        const status = h('p', { class: 'form-status', role: 'alert' });

        const choose = offer => { setOffers([{ key: item.key, storeId: store.id, ...offer }]); dialog.close(); };

        function showResults() {
            if (!products) {
                replaceChildren(results, h('li', { class: 'muted product-none' },
                    catalogState === 'loading' ? 'The store prices are still loading.' : 'The store prices could not be loaded.'));
                return;
            }
            const found = search(products, query.value, 30);
            replaceChildren(results, found.length === 0
                ? h('li', { class: 'muted product-none' }, 'Nothing found. Try another word, in Dutch: the stores name their products in Dutch.')
                : found.map(product => h('li', null, h('button', {
                    class: `product${current?.product?.l === product.l ? ' is-current' : ''}`, type: 'button',
                    onclick: () => choose({ pick: product }),
                },
                    h('span', { class: 'product-name' }, product.n,
                        product.s && h('span', { class: 'product-size' }, product.s)),
                    h('span', { class: 'product-price' }, formatPrice(product.p)),
                ))));
        }

        const dialog = openDialog([
            h('h2', { class: 'dialog-title' }, store.name),
            h('p', { class: 'dialog-body' }, `Which product is "${item.text}"? Your choice is remembered for next time.`),
            h('label', { class: 'search product-search' }, icon('search'), query),
            results,
            h('form', {
                class: 'product-manual',
                onsubmit: e => {
                    e.preventDefault();
                    const value = parsePrice(priceField.value);
                    if (value === null) { status.textContent = 'Type a price like 1,99.'; return; }
                    choose({ price: value });
                },
            },
                h('label', { class: 'field' },
                    h('span', { class: 'field-label' }, 'Or type the price per pack'),
                    h('span', { class: 'input-row' }, priceField, h('button', { class: 'btn', type: 'submit' }, 'Use'))),
                status,
            ),
            h('div', { class: 'dialog-actions' },
                current && current.source !== 'auto' && h('button', {
                    class: 'btn btn-quiet shop-delete', type: 'button', onclick: () => choose({}),
                }, 'Forget my choice'),
                h('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, 'Close'),
            ),
        ], { className: 'dialog-sheet dialog-products' });
        showResults();
    }

    // --- The AI matcher: only for prices that are still missing ---

    async function runAiMatch() {
        if (matching || !catalog) return;
        const options = { apiKey: state.settings.apiKey, model: currentModel() };
        const missing = () => state.shopping.items.filter(item => !item.checked
            && STORES.some(store => !offerFor(item, store)));

        matching = true;
        render();
        try {
            // Step 1: what is this called in a Dutch store? Recipes are often in
            // English, the stores are not. Remembered, so it is asked once per product.
            const unnamed = missing().filter(item => !state.shopping.terms[item.key]);
            if (unnamed.length > 0) {
                const asked = unnamed.map((item, i) => ({ id: `i${i}`, text: item.text, key: item.key }));
                const terms = await translateWithAI(asked, options);
                setTerms(Object.fromEntries(asked.filter(a => terms[a.id]).map(a => [a.key, terms[a.id]])));
            }

            // Step 2: with the Dutch name some items now match by themselves.
            // For the rest, let the AI choose from what the store has.
            const tasks = [];
            const targets = new Map();
            for (const item of missing()) {
                for (const store of STORES) {
                    if (offerFor(item, store)) continue;
                    const candidates = search(catalog.stores[store.id].products, storeTerm(item, state.shopping), 12);
                    if (candidates.length === 0) continue;
                    const id = `t${tasks.length}`;
                    tasks.push({ id, item: `${item.text} (${storeTerm(item, state.shopping)})`, store: store.name, candidates });
                    targets.set(id, { key: item.key, storeId: store.id });
                }
            }
            if (tasks.length > 0) {
                const chosen = await matchWithAI(tasks, options);
                const offers = Object.entries(chosen).map(([id, product]) => ({ ...targets.get(id), pick: product }));
                if (offers.length > 0) setOffers(offers);
            }

            const left = missing().length;
            toast(left === 0 ? 'Every item has a price at both stores. Check the products once.'
                : `${plural(left, 'item is', 'items are')} still missing a price. Tap it to choose the product.`,
            { duration: 6000 });
        } catch (error) {
            toast(error.message, { tone: 'error', duration: 7000 });
        } finally {
            matching = false;
            if (alive) render();
        }
    }

    // --- Editing one item ---

    function openEdit(id) {
        const item = getShoppingItem(id);
        if (!item) return;
        const name = h('input', { class: 'input', type: 'text', value: item.name, required: true, autocomplete: 'off' });
        const amount = h('input', { class: 'input', type: 'text', value: item.amount, autocomplete: 'off', placeholder: '500 g' });
        const count = h('input', {
            class: 'input', type: 'number', inputmode: 'numeric', min: 1, max: 99, step: 1,
            value: item.count > 0 ? item.count : '', placeholder: 'Auto',
        });

        const form = h('form', {
            method: 'dialog',
            onsubmit: e => {
                e.preventDefault();
                if (!name.value.trim()) return;
                const packs = Math.round(Number(count.value));
                updateShoppingItem(id, {
                    name: name.value, amount: amount.value, count: packs >= 1 && packs <= 99 ? packs : 0,
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
                'Leave the packs empty and the app works them out from the amount and the pack size of each store.'),
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
                `Each item opens on ${store.site}. Put it in your basket there. `
                + `You order and pay on ${store.site} itself; this app cannot place the order.`),
            h('ul', { class: 'store-links' }, items.map(item => {
                const offer = offerFor(item, store);
                const href = (offer?.product && productUrl(catalog, store.id, offer.product.l))
                    || store.searchUrl(storeTerm(item, state.shopping));
                return h('li', null, h('a', {
                    class: 'store-link', href, target: '_blank', rel: 'noopener noreferrer',
                    onclick: e => e.currentTarget.classList.add('is-opened'),
                },
                    h('span', { class: 'store-link-text' },
                        item.text,
                        h('span', { class: 'store-link-product' }, offer?.product
                            ? `${offer.packs > 1 ? `${offer.packs} × ` : ''}${productLabel(offer.product)}`
                            : 'Opens a search'),
                    ),
                    offer && h('span', { class: 'store-link-price' }, formatPrice(offer.total)),
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
        actionSheet('Shopping list', [
            { label: 'Fetch the prices again', icon: 'refresh', onSelect: () => fetchPrices(true) },
            items.length > 0 && { label: 'Copy list', icon: 'copy', onSelect: copyList },
            checked.length > 0 && {
                label: `Remove ${plural(checked.length, 'item', 'items')} in the cart`, icon: 'check',
                onSelect: () => {
                    const undo = removeShoppingItems(checked.map(item => item.id));
                    toast('Removed', { action: 'Undo', onAction: undo });
                },
            },
            items.length > 0 && {
                label: 'Clear the list', icon: 'trash', danger: true,
                onSelect: async () => {
                    const ok = await confirmDialog({
                        title: 'Clear the list?', body: 'The products you chose are remembered for next time.',
                        confirmLabel: 'Clear', danger: true,
                    });
                    if (!ok) return;
                    const undo = removeShoppingItems(items.map(item => item.id));
                    toast('List cleared', { action: 'Undo', onAction: undo });
                },
            },
        ]);
    }

    const stop = [on('shopping', render), on('settings', render)];
    fetchPrices();

    return { destroy() { alive = false; stop.forEach(off => off()); } };
}
