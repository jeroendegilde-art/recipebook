// Het receptscherm. Tekent alleen opnieuw als het recept zelf is veranderd,
// en raakt de scrollpositie nooit aan. Schaal en vinkjes staan in viewstate.

import { h, icon, replaceChildren, toast, confirmDialog, promptDialog, actionSheet, safeUrl, hostName } from '../dom.js';
import { state, on, getRecipe, getFolder, updateRecipe, deleteRecipe, addFolder } from '../store.js';
import { go, back, replace, paths } from '../router.js';
import { scaleIngredient, ingredientKey } from '../quantity.js';
import { getFactor, setFactor, scaleInfo, getChecked, toggleChecked, clearChecked } from '../viewstate.js';
import { fetchRecipeFromUrl, extractRecipeWithClaude } from '../extract.js';
import { translateError } from '../messages.js';
import { openNookSheet } from './nook.js';

const FACTORS = [[0.5, '½×'], [1, '1×'], [2, '2×'], [3, '3×']];

export function recipeAsText(recipe, factor = 1) {
    const lines = [recipe.title];
    if (recipe.servings) lines.push(recipe.servings);
    lines.push('', 'Ingrediënten', ...recipe.ingredients.map(i => `- ${scaleIngredient(i, factor)}`));
    lines.push('', 'Bereiding', ...recipe.instructions.map((s, i) => `${i + 1}. ${s}`));
    if (recipe.notes) lines.push('', 'Notities', recipe.notes);
    if (safeUrl(recipe.source)) lines.push('', recipe.source);
    return lines.join('\n');
}

export function mountRecipe(container, id) {
    let lastSignature = null;
    let busy = false;
    const content = h('article', { class: 'recipe' });
    const starButton = h('button', { class: 'icon-btn star-btn', type: 'button', onclick: toggleFavorite });
    const moreButton = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Meer acties', onclick: openMenu }, icon('more'));

    replaceChildren(container,
        h('header', { class: 'topbar' },
            h('button', { class: 'btn btn-quiet back-btn', type: 'button', onclick: () => back(paths.home) },
                icon('back'), 'Recepten'),
            h('div', { class: 'topbar-actions' }, starButton, moreButton),
        ),
        content,
    );

    function toggleFavorite() {
        const recipe = getRecipe(id);
        if (recipe) updateRecipe(id, { favorite: !recipe.favorite });
    }

    // --- Acties uit het menu ---

    function openMenu() {
        const recipe = getRecipe(id);
        if (!recipe) return;
        actionSheet(recipe.title, [
            { label: 'Bewerken', icon: 'edit', onSelect: () => go(paths.edit(id)) },
            { label: 'Collectie kiezen', icon: 'folder', onSelect: chooseFolder },
            state.settings.apiKey && { label: 'Opnieuw uitlezen met AI', icon: 'refresh', onSelect: rescan },
            { label: 'Delen', icon: 'share', onSelect: share },
            { label: 'Afdrukken of opslaan als PDF', icon: 'print', onSelect: () => window.print() },
            { label: 'Verwijderen', icon: 'trash', danger: true, onSelect: remove },
        ]);
    }

    function chooseFolder() {
        const recipe = getRecipe(id);
        if (!recipe) return;
        const move = (folderId, name) => {
            updateRecipe(id, { folderId });
            toast(folderId ? `Verplaatst naar ${name}` : 'Uit de collectie gehaald');
        };
        actionSheet('Collectie', [
            { label: 'Geen collectie', checked: !recipe.folderId, onSelect: () => move('', '') },
            ...state.folders.map(f => ({
                label: f.name, icon: 'folder', checked: recipe.folderId === f.id, onSelect: () => move(f.id, f.name),
            })),
            {
                label: 'Nieuwe collectie', icon: 'plus',
                onSelect: async () => {
                    const name = await promptDialog({ title: 'Nieuwe collectie', label: 'Naam', confirmLabel: 'Aanmaken' });
                    if (name) move(addFolder(name).id, name);
                },
            },
        ]);
    }

    async function share() {
        const recipe = getRecipe(id);
        if (!recipe) return;
        const text = recipeAsText(recipe, getFactor(recipe));
        try {
            if (navigator.share) await navigator.share({ title: recipe.title, text });
            else { await navigator.clipboard.writeText(text); toast('Recept gekopieerd'); }
        } catch (error) {
            if (error?.name !== 'AbortError') toast('Delen lukte niet', { tone: 'error' });
        }
    }

    async function remove() {
        const recipe = getRecipe(id);
        if (!recipe) return;
        const ok = await confirmDialog({
            title: 'Recept verwijderen?', body: recipe.title, confirmLabel: 'Verwijderen', danger: true,
        });
        if (!ok) return;
        const undo = deleteRecipe(id);
        replace(paths.home);
        toast('Recept verwijderd', { action: 'Ongedaan maken', onAction: () => undo?.() });
    }

    // Zelfde aanpak als v1: haal de bron opnieuw op als die er is, en laat het
    // model de tekst opnieuw structureren.
    async function rescan() {
        const recipe = getRecipe(id);
        if (!recipe || busy) return;
        const ok = await confirmDialog({
            title: 'Opnieuw uitlezen?',
            body: 'Titel, ingrediënten, bereiding en notities worden overschreven.',
            confirmLabel: 'Uitlezen',
        });
        if (!ok) return;

        busy = true;
        toast('Bezig met uitlezen…', { duration: 60000 });
        try {
            let fresh = null;
            if (safeUrl(recipe.source)) {
                try { fresh = await fetchRecipeFromUrl(recipe.source); } catch { /* val terug op de huidige tekst */ }
            }
            const base = fresh || recipe;
            const text = [
                `Recipe: ${base.title}`,
                base.servings ? `Servings: ${base.servings}` : '',
                '', 'Ingredients:', ...(base.ingredients || []),
                '', 'Instructions:', ...(base.instructions || []).map((s, i) => `${i + 1}. ${s}`),
                base.notes ? `Notes: ${base.notes}` : '',
            ].join('\n');
            const result = await extractRecipeWithClaude(text, recipe.source || '');
            if (!result.ingredients?.length) throw new Error('No recipe found');
            updateRecipe(id, {
                title: result.title || recipe.title,
                ingredients: result.ingredients,
                instructions: result.instructions,
                notes: result.notes || '',
                servings: result.servings || recipe.servings || '',
                image: fresh?.image || recipe.image || '',
            });
            toast('Recept bijgewerkt');
        } catch (error) {
            toast(translateError(error), { tone: 'error', duration: 6000 });
        } finally {
            busy = false;
        }
    }

    // --- Onderdelen van de pagina ---

    function scaler(recipe, rerender) {
        const info = scaleInfo(recipe);
        const set = factor => { setFactor(recipe, factor); rerender(); };

        if (info.mode === 'servings') {
            const step = delta => set(Math.max(1, info.count + delta) / info.base);
            return h('div', { class: 'scaler' },
                h('div', { class: 'stepper', role: 'group', 'aria-label': 'Aantal porties' },
                    h('button', { class: 'stepper-btn', type: 'button', 'aria-label': 'Minder', disabled: info.count <= 1, onclick: () => step(-1) }, '−'),
                    h('span', { class: 'stepper-value', 'aria-live': 'polite' }, info.label),
                    h('button', { class: 'stepper-btn', type: 'button', 'aria-label': 'Meer', onclick: () => step(1) }, '+'),
                ),
                info.count !== info.base && h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => set(1) },
                    `Terug naar ${info.base}`),
            );
        }
        return h('div', { class: 'scaler' },
            h('div', { class: 'segmented', role: 'group', 'aria-label': 'Hoeveelheid' },
                FACTORS.map(([factor, label]) => h('button', {
                    class: `segment${info.factor === factor ? ' is-selected' : ''}`, type: 'button',
                    'aria-pressed': String(info.factor === factor), onclick: () => set(factor),
                }, label)),
            ),
        );
    }

    function ingredients(recipe, rerender) {
        const factor = getFactor(recipe);
        const checked = getChecked(recipe);
        const resetButton = h('button', {
            class: 'btn btn-quiet', type: 'button', hidden: checked.size === 0,
            onclick: () => { clearChecked(recipe); rerender(); },
        }, 'Vinkjes wissen');

        const items = recipe.ingredients.map(text => {
            // Regels als "Voor de saus:" zijn kopjes, geen ingrediënten.
            if (/:\s*$/.test(text) && !/\d/.test(text)) return h('li', { class: 'ingredient-heading' }, text.replace(/:\s*$/, ''));
            const isChecked = checked.has(ingredientKey(text));
            const item = h('li', null,
                h('button', {
                    class: `ingredient${isChecked ? ' is-checked' : ''}`, type: 'button',
                    role: 'checkbox', 'aria-checked': String(isChecked),
                    onclick: e => {
                        const now = toggleChecked(recipe, text);
                        const on = now.has(ingredientKey(text));
                        e.currentTarget.classList.toggle('is-checked', on);
                        e.currentTarget.setAttribute('aria-checked', String(on));
                        resetButton.hidden = now.size === 0;
                    },
                },
                    h('span', { class: 'checkbox' }, icon('check')),
                    h('span', { class: 'ingredient-text' }, scaleIngredient(text, factor)),
                ),
            );
            return item;
        });

        const hasNook = state.settings.nookUrl && state.settings.nookToken;
        return h('section', { class: 'section' },
            h('div', { class: 'section-head' },
                h('h2', null, 'Ingrediënten'),
                h('div', { class: 'section-actions' },
                    h('button', {
                        class: 'btn btn-small', type: 'button',
                        onclick: async () => {
                            try {
                                await navigator.clipboard.writeText(recipe.ingredients.map(i => scaleIngredient(i, factor)).join('\n'));
                                toast('Ingrediënten gekopieerd');
                            } catch { toast('Kopiëren lukte niet', { tone: 'error' }); }
                        },
                    }, icon('copy'), 'Kopieer'),
                    hasNook && h('button', {
                        class: 'btn btn-small', type: 'button',
                        onclick: () => openNookSheet(recipe, factor),
                    }, icon('cart'), 'Naar Nook'),
                ),
            ),
            scaler(recipe, rerender),
            h('ul', { class: 'ingredients' }, items),
            resetButton,
        );
    }

    function render(force = false) {
        const recipe = getRecipe(id);

        if (!recipe) {
            lastSignature = null;
            starButton.hidden = true;
            moreButton.hidden = true;
            replaceChildren(content, state.loaded
                ? h('div', { class: 'empty' },
                    h('p', { class: 'empty-title' }, 'Dit recept bestaat niet meer'),
                    h('p', null, 'Het is verwijderd, mogelijk op een ander apparaat.'),
                    h('button', { class: 'btn btn-primary', type: 'button', onclick: () => replace(paths.home) }, 'Naar alle recepten'))
                : h('div', { class: 'empty' }, h('p', null, 'Recept laden…')));
            return;
        }

        const folder = getFolder(recipe.folderId);
        const hasNook = !!(state.settings.nookUrl && state.settings.nookToken);
        const signature = JSON.stringify([recipe, folder?.name, hasNook]);
        if (!force && signature === lastSignature) return;
        lastSignature = signature;

        starButton.hidden = false;
        moreButton.hidden = false;
        starButton.classList.toggle('is-on', recipe.favorite);
        starButton.setAttribute('aria-pressed', String(recipe.favorite));
        starButton.setAttribute('aria-label', recipe.favorite ? 'Favoriet. Tik om te verwijderen.' : 'Maak favoriet');
        replaceChildren(starButton, icon('star', { filled: recipe.favorite }));

        const sourceUrl = safeUrl(recipe.source);
        const rerender = () => render(true);
        const image = recipe.image && h('img', { class: 'recipe-image', src: recipe.image, alt: '' });
        if (image) image.addEventListener('error', () => image.remove());

        replaceChildren(content,
            image,
            h('h1', { class: 'recipe-title' }, recipe.title),
            (folder || recipe.source) && h('p', { class: 'recipe-meta' },
                folder && h('span', null, folder.name),
                folder && recipe.source && ' · ',
                sourceUrl
                    ? h('a', { href: sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, hostName(sourceUrl))
                    : recipe.source && h('span', null, recipe.source),
            ),
            recipe.instructions.length > 0 && h('button', {
                class: 'btn btn-primary btn-wide cook-start', type: 'button', onclick: () => go(paths.cook(id)),
            }, icon('pot'), 'Start kookstand'),
            recipe.ingredients.length > 0
                ? ingredients(recipe, rerender)
                : h('section', { class: 'section' }, h('h2', null, 'Ingrediënten'),
                    h('p', { class: 'muted' }, 'Geen ingrediënten opgeslagen.')),
            h('section', { class: 'section' },
                h('h2', null, 'Bereiding'),
                recipe.instructions.length > 0
                    ? h('ol', { class: 'steps' }, recipe.instructions.map(step => h('li', null, step)))
                    : h('p', { class: 'muted' }, 'Geen bereiding opgeslagen.'),
            ),
            recipe.notes && h('section', { class: 'section' },
                h('h2', null, 'Notities'),
                h('p', { class: 'notes' }, recipe.notes),
            ),
        );
    }

    const stop = [on('recipes', () => render()), on('folders', () => render()), on('settings', () => render())];
    render();

    return {
        destroy() { stop.forEach(off => off()); },
    };
}
