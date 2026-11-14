// The recipe list. Built once and updated after that, so the search field,
// scroll position and filter stay put while you open recipes.

import { h, icon, replaceChildren } from '../dom.js';
import { state, on } from '../store.js';
import { go, paths } from '../router.js';
import { matchesQuery, normalize } from '../quantity.js';
import { listState, saveListState } from '../viewstate.js';

const SYNC_TEXT = {
    connecting: 'Connecting…',
    synced: 'Synced',
    offline: 'Offline. You are seeing the last saved version.',
    error: 'Sync is not working. Changes may not be saved.',
};

export function mountHome(container) {
    let activeId = null;

    const searchInput = h('input', {
        class: 'search-input', type: 'search', autocomplete: 'off', enterkeyhint: 'search',
        'aria-label': 'Search recipes', placeholder: 'Search by title or ingredient', value: listState.query,
        oninput: e => { listState.query = e.target.value; saveListState(); renderList(); },
    });
    const chips = h('nav', { class: 'chips', 'aria-label': 'Filter' });
    const count = h('span', { class: 'list-count' });
    const sortSelect = h('select', {
        class: 'sort-select', 'aria-label': 'Sort order',
        onchange: e => { listState.sort = e.target.value; saveListState(); renderList(); },
    },
        h('option', { value: 'recent' }, 'Newest first'),
        h('option', { value: 'az' }, 'A to Z'),
    );
    sortSelect.value = listState.sort;
    const ticket = h('a', { class: 'ticket', hidden: true });
    const list = h('ul', { class: 'recipe-list' });
    const empty = h('div', { class: 'empty', hidden: true });
    const syncLine = h('p', { class: 'sync-line' });
    const cartCount = h('span', { class: 'cart-count', hidden: true });
    const cartButton = h('button', {
        class: 'icon-btn cart-btn', type: 'button', onclick: () => go(paths.shopping),
    }, icon('cart'), cartCount);

    replaceChildren(container,
        h('header', { class: 'list-head' },
            h('h1', { class: 'app-title' }, 'Recipe Book'),
            h('div', { class: 'head-actions' },
                cartButton,
                h('button', {
                    class: 'icon-btn', type: 'button', 'aria-label': 'Settings',
                    onclick: () => go(paths.settings),
                }, icon('settings')),
                h('button', { class: 'btn btn-primary', type: 'button', onclick: () => go(paths.add) },
                    icon('plus'), 'New'),
            ),
        ),
        h('label', { class: 'search' }, icon('search'), searchInput),
        chips,
        h('div', { class: 'list-meta' }, count, sortSelect),
        ticket,
        list,
        empty,
        syncLine,
    );

    function setFilter(filter) {
        listState.filter = filter;
        saveListState();
        render();
    }

    function chip(label, filter, number) {
        const selected = listState.filter === filter;
        return h('button', {
            class: `chip${selected ? ' is-selected' : ''}`, type: 'button',
            'aria-pressed': String(selected), onclick: () => setFilter(filter),
        }, label, h('span', { class: 'chip-count' }, number));
    }

    function renderChips() {
        // Collection deleted while it was selected: back to all.
        if (!['all', 'favorites'].includes(listState.filter)
            && !state.folders.some(f => f.id === listState.filter)) {
            listState.filter = 'all';
        }
        const favorites = state.recipes.filter(r => r.favorite).length;
        replaceChildren(chips,
            chip('All', 'all', state.recipes.length),
            favorites > 0 && chip('Favorites', 'favorites', favorites),
            state.folders.map(f => chip(f.name, f.id, state.recipes.filter(r => r.folderId === f.id).length)),
        );
    }

    function visibleRecipes() {
        let result = state.recipes;
        if (listState.filter === 'favorites') result = result.filter(r => r.favorite);
        else if (listState.filter !== 'all') result = result.filter(r => r.folderId === listState.filter);
        if (listState.query.trim()) result = result.filter(r => matchesQuery(r, listState.query));
        if (listState.sort === 'az') {
            result = result.slice().sort((a, b) => normalize(a.title).localeCompare(normalize(b.title)));
        }
        return result;
    }

    function row(recipe) {
        const folder = state.folders.find(f => f.id === recipe.folderId);
        const details = [recipe.servings, folder?.name].filter(Boolean).join(' · ');
        const href = `#/${paths.recipe(recipe.id)}`;
        const link = h('a', {
            class: `row${recipe.id === activeId ? ' is-active' : ''}`, href,
            'aria-current': recipe.id === activeId ? 'page' : null,
            onclick: e => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) return; // opening in a new tab is fine
                e.preventDefault();
                go(paths.recipe(recipe.id));
            },
        });
        if (recipe.image) {
            const img = h('img', { class: 'row-thumb', src: recipe.image, alt: '', loading: 'lazy' });
            img.addEventListener('error', () => img.remove());
            link.appendChild(img);
        }
        link.appendChild(h('span', { class: 'row-body' },
            h('span', { class: 'row-title' }, recipe.title),
            (details || recipe.favorite) && h('span', { class: 'row-sub' },
                recipe.favorite && h('span', { class: 'row-star', role: 'img', 'aria-label': 'Favorite' }, icon('star', { filled: true })),
                details && h('span', { class: 'row-sub-text' }, details),
            ),
        ));
        return h('li', null, link);
    }

    // One recipe hangs on the rail as a ticket: a nudge for tonight.
    function renderTicket() {
        const show = listState.filter === 'all' && !listState.query.trim() && state.recipes.length >= 5;
        ticket.hidden = !show;
        if (!show) return;
        // One recipe per day, the same on every device that looks today.
        const today = new Date();
        const seed = today.getFullYear() * 372 + today.getMonth() * 31 + today.getDate();
        const byId = state.recipes.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
        const pick = byId[seed % byId.length];
        const count = pick.ingredients.length;
        ticket.href = `#/${paths.recipe(pick.id)}`;
        ticket.onclick = e => {
            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            go(paths.recipe(pick.id));
        };
        replaceChildren(ticket,
            h('span', { class: 'ticket-title' }, pick.title),
            h('span', { class: 'ticket-foot' },
                h('span', null, 'Idea for today'),
                h('span', null, pick.servings || (count === 1 ? '1 ingredient' : `${count} ingredients`)),
            ),
        );
    }

    function renderEmpty(shown) {
        const query = listState.query.trim();
        if (shown > 0) { empty.hidden = true; return; }
        empty.hidden = false;
        if (!state.loaded) {
            replaceChildren(empty, h('p', null, 'Loading recipes…'));
        } else if (state.recipes.length === 0) {
            replaceChildren(empty,
                h('p', { class: 'empty-title' }, 'No recipes yet'),
                h('p', null, 'Add one from a link or a photo, or type it in.'),
                h('button', { class: 'btn btn-primary', type: 'button', onclick: () => go(paths.add) }, 'Add first recipe'),
            );
        } else if (query) {
            replaceChildren(empty,
                h('p', null, `Nothing found for "${query}".`),
                h('button', {
                    class: 'btn', type: 'button',
                    onclick: () => { listState.query = ''; searchInput.value = ''; saveListState(); renderList(); },
                }, 'Clear search'),
            );
        } else {
            replaceChildren(empty, h('p', null, listState.filter === 'favorites'
                ? 'No favorites yet. Tap the star on a recipe.'
                : 'This collection is still empty.'));
        }
    }

    function renderList() {
        const recipes = visibleRecipes();
        count.textContent = recipes.length === 1 ? '1 recipe' : `${recipes.length} recipes`;
        replaceChildren(list, recipes.map(row));
        renderTicket();
        renderEmpty(recipes.length);
    }

    function renderSync() {
        syncLine.textContent = SYNC_TEXT[state.sync] || '';
        syncLine.dataset.state = state.sync;
    }

    function renderCart() {
        const open = state.shopping.items.filter(item => !item.checked).length;
        cartCount.textContent = open;
        cartCount.hidden = open === 0;
        cartButton.setAttribute('aria-label', open === 0 ? 'Shopping list' : `Shopping list, ${open} to get`);
    }

    function render() {
        renderCart();
        renderChips();
        renderList();
        renderSync();
    }

    const stop = [on('recipes', render), on('folders', render), on('sync', renderSync), on('shopping', renderCart)];
    render();

    return {
        destroy() { stop.forEach(off => off()); },
        /** Mark the open recipe in the list (visible on wide screens). */
        setActive(id) {
            if (id === activeId) return;
            activeId = id;
            renderList();
        },
        /** Select a collection from outside, for example right after creating it. */
        setFilter,
    };
}
