// De receptenlijst. Wordt één keer opgebouwd en daarna bijgewerkt, zodat
// zoekveld, scrollpositie en filter blijven staan terwijl je recepten opent.

import { h, icon, replaceChildren } from '../dom.js';
import { state, on } from '../store.js';
import { go, paths } from '../router.js';
import { matchesQuery, normalize } from '../quantity.js';
import { listState, saveListState } from '../viewstate.js';

const SYNC_TEXT = {
    connecting: 'Verbinden…',
    synced: 'Gesynchroniseerd',
    offline: 'Offline. Je ziet de laatst opgeslagen versie.',
    error: 'Synchroniseren lukt niet. Wijzigingen worden mogelijk niet bewaard.',
};

export function mountHome(container) {
    let activeId = null;

    const searchInput = h('input', {
        class: 'search-input', type: 'search', autocomplete: 'off', enterkeyhint: 'search',
        'aria-label': 'Zoek in recepten', placeholder: 'Zoek op titel of ingrediënt', value: listState.query,
        oninput: e => { listState.query = e.target.value; saveListState(); renderList(); },
    });
    const chips = h('nav', { class: 'chips', 'aria-label': 'Filter' });
    const count = h('span', { class: 'list-count' });
    const sortSelect = h('select', {
        class: 'sort-select', 'aria-label': 'Sortering',
        onchange: e => { listState.sort = e.target.value; saveListState(); renderList(); },
    },
        h('option', { value: 'recent' }, 'Nieuwste eerst'),
        h('option', { value: 'az' }, 'A tot Z'),
    );
    sortSelect.value = listState.sort;
    const suggestion = h('p', { class: 'suggestion', hidden: true });
    const list = h('ul', { class: 'recipe-list' });
    const empty = h('div', { class: 'empty', hidden: true });
    const syncLine = h('p', { class: 'sync-line' });

    replaceChildren(container,
        h('header', { class: 'list-head' },
            h('h1', { class: 'app-title' }, 'Recepten'),
            h('div', { class: 'head-actions' },
                h('button', {
                    class: 'icon-btn', type: 'button', 'aria-label': 'Instellingen',
                    onclick: () => go(paths.settings),
                }, icon('settings')),
                h('button', { class: 'btn btn-primary', type: 'button', onclick: () => go(paths.add) },
                    icon('plus'), 'Nieuw'),
            ),
        ),
        h('label', { class: 'search' }, icon('search'), searchInput),
        chips,
        h('div', { class: 'list-meta' }, count, sortSelect),
        suggestion,
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
        // Collectie verwijderd terwijl hij gekozen was: terug naar alles.
        if (!['all', 'favorites'].includes(listState.filter)
            && !state.folders.some(f => f.id === listState.filter)) {
            listState.filter = 'all';
        }
        const favorites = state.recipes.filter(r => r.favorite).length;
        replaceChildren(chips,
            chip('Alles', 'all', state.recipes.length),
            favorites > 0 && chip('Favorieten', 'favorites', favorites),
            state.folders.map(f => chip(f.name, f.id, state.recipes.filter(r => r.folderId === f.id).length)),
        );
    }

    function visibleRecipes() {
        let result = state.recipes;
        if (listState.filter === 'favorites') result = result.filter(r => r.favorite);
        else if (listState.filter !== 'all') result = result.filter(r => r.folderId === listState.filter);
        if (listState.query.trim()) result = result.filter(r => matchesQuery(r, listState.query));
        if (listState.sort === 'az') {
            result = result.slice().sort((a, b) => normalize(a.title).localeCompare(normalize(b.title), 'nl'));
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
                if (e.metaKey || e.ctrlKey || e.shiftKey) return; // nieuw tabblad mag
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
            details && h('span', { class: 'row-sub' }, details),
        ));
        if (recipe.favorite) {
            link.appendChild(h('span', { class: 'row-star', role: 'img', 'aria-label': 'Favoriet' }, icon('star', { filled: true })));
        }
        return h('li', null, link);
    }

    function renderSuggestion() {
        const show = listState.filter === 'all' && !listState.query.trim() && state.recipes.length >= 5;
        suggestion.hidden = !show;
        if (!show) return;
        // Eén recept per dag, voor iedereen die vandaag kijkt hetzelfde.
        const today = new Date();
        const seed = today.getFullYear() * 372 + today.getMonth() * 31 + today.getDate();
        const byId = state.recipes.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
        const pick = byId[seed % byId.length];
        replaceChildren(suggestion,
            'Idee voor vandaag: ',
            h('a', {
                href: `#/${paths.recipe(pick.id)}`,
                onclick: e => { e.preventDefault(); go(paths.recipe(pick.id)); },
            }, pick.title),
        );
    }

    function renderEmpty(shown) {
        const query = listState.query.trim();
        if (shown > 0) { empty.hidden = true; return; }
        empty.hidden = false;
        if (!state.loaded) {
            replaceChildren(empty, h('p', null, 'Recepten laden…'));
        } else if (state.recipes.length === 0) {
            replaceChildren(empty,
                h('p', { class: 'empty-title' }, 'Nog geen recepten'),
                h('p', null, 'Voeg er een toe via een link, een foto, of typ hem zelf in.'),
                h('button', { class: 'btn btn-primary', type: 'button', onclick: () => go(paths.add) }, 'Eerste recept toevoegen'),
            );
        } else if (query) {
            replaceChildren(empty,
                h('p', null, `Niets gevonden voor "${query}".`),
                h('button', {
                    class: 'btn', type: 'button',
                    onclick: () => { listState.query = ''; searchInput.value = ''; saveListState(); renderList(); },
                }, 'Zoekterm wissen'),
            );
        } else {
            replaceChildren(empty, h('p', null, listState.filter === 'favorites'
                ? 'Nog geen favorieten. Tik op de ster bij een recept.'
                : 'Deze collectie is nog leeg.'));
        }
    }

    function renderList() {
        const recipes = visibleRecipes();
        count.textContent = recipes.length === 1 ? '1 recept' : `${recipes.length} recepten`;
        replaceChildren(list, recipes.map(row));
        renderSuggestion();
        renderEmpty(recipes.length);
    }

    function renderSync() {
        syncLine.textContent = SYNC_TEXT[state.sync] || '';
        syncLine.dataset.state = state.sync;
    }

    function render() {
        renderChips();
        renderList();
        renderSync();
    }

    const stop = [on('recipes', render), on('folders', render), on('sync', renderSync)];
    render();

    return {
        destroy() { stop.forEach(off => off()); },
        /** Markeer het geopende recept in de lijst (zichtbaar op brede schermen). */
        setActive(id) {
            if (id === activeId) return;
            activeId = id;
            renderList();
        },
        /** Kies een collectie van buitenaf, bijvoorbeeld na het aanmaken ervan. */
        setFilter,
    };
}
