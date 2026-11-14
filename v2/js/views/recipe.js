// The recipe screen. Redraws only when the recipe itself has changed, and
// never touches the scroll position. Scale and checks live in viewstate.

import { h, icon, replaceChildren, toast, confirmDialog, promptDialog, actionSheet, safeUrl, hostName } from '../dom.js';
import { state, on, getRecipe, getFolder, updateRecipe, deleteRecipe, addFolder } from '../store.js';
import { go, back, replace, paths } from '../router.js';
import { scaleIngredient } from '../quantity.js';
import { getFactor, setFactor, scaleInfo, getChecked, clearChecked } from '../viewstate.js';
import { fetchRecipeFromUrl, extractRecipeWithClaude } from '../extract.js';
import { translateError } from '../messages.js';
import { openNookSheet } from './nook.js';
import { openAddToListSheet } from './shopping.js';
import { ingredientList } from './ingredients.js';

const FACTORS = [[0.5, '½×'], [1, '1×'], [2, '2×'], [3, '3×']];

export function recipeAsText(recipe, factor = 1) {
    const lines = [recipe.title];
    if (recipe.servings) lines.push(recipe.servings);
    lines.push('', 'Ingredients', ...recipe.ingredients.map(i => `- ${scaleIngredient(i, factor)}`));
    lines.push('', 'Method', ...recipe.instructions.map((s, i) => `${i + 1}. ${s}`));
    if (recipe.notes) lines.push('', 'Notes', recipe.notes);
    if (safeUrl(recipe.source)) lines.push('', recipe.source);
    return lines.join('\n');
}

export function mountRecipe(container, id) {
    let lastSignature = null;
    let busy = false;
    const content = h('article', { class: 'recipe' });
    const starButton = h('button', { class: 'icon-btn star-btn', type: 'button', onclick: toggleFavorite });
    const moreButton = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'More actions', onclick: openMenu }, icon('more'));

    replaceChildren(container,
        h('header', { class: 'topbar' },
            h('button', { class: 'btn btn-quiet back-btn', type: 'button', onclick: () => back(paths.home) },
                icon('back'), 'Recipes'),
            h('div', { class: 'topbar-actions' }, starButton, moreButton),
        ),
        content,
    );

    function toggleFavorite() {
        const recipe = getRecipe(id);
        if (recipe) updateRecipe(id, { favorite: !recipe.favorite });
    }

    // --- Actions from the menu ---

    function openMenu() {
        const recipe = getRecipe(id);
        if (!recipe) return;
        actionSheet(recipe.title, [
            { label: 'Edit', icon: 'edit', onSelect: () => go(paths.edit(id)) },
            { label: 'Choose collection', icon: 'folder', onSelect: chooseFolder },
            state.settings.apiKey && { label: 'Read again with AI', icon: 'refresh', onSelect: rescan },
            { label: 'Share', icon: 'share', onSelect: share },
            { label: 'Print or save as PDF', icon: 'print', onSelect: () => window.print() },
            { label: 'Delete', icon: 'trash', danger: true, onSelect: remove },
        ]);
    }

    function chooseFolder() {
        const recipe = getRecipe(id);
        if (!recipe) return;
        const move = (folderId, name) => {
            updateRecipe(id, { folderId });
            toast(folderId ? `Moved to ${name}` : 'Removed from collection');
        };
        actionSheet('Collection', [
            { label: 'No collection', checked: !recipe.folderId, onSelect: () => move('', '') },
            ...state.folders.map(f => ({
                label: f.name, icon: 'folder', checked: recipe.folderId === f.id, onSelect: () => move(f.id, f.name),
            })),
            {
                label: 'New collection', icon: 'plus',
                onSelect: async () => {
                    const name = await promptDialog({ title: 'New collection', label: 'Name', confirmLabel: 'Create' });
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
            else { await navigator.clipboard.writeText(text); toast('Recipe copied'); }
        } catch (error) {
            if (error?.name !== 'AbortError') toast('Could not share the recipe', { tone: 'error' });
        }
    }

    async function remove() {
        const recipe = getRecipe(id);
        if (!recipe) return;
        const ok = await confirmDialog({
            title: 'Delete recipe?', body: recipe.title, confirmLabel: 'Delete', danger: true,
        });
        if (!ok) return;
        const undo = deleteRecipe(id);
        replace(paths.home);
        toast('Recipe deleted', { action: 'Undo', onAction: () => undo?.() });
    }

    // Same approach as v1: fetch the source again if there is one, and let the
    // model structure the text again.
    async function rescan() {
        const recipe = getRecipe(id);
        if (!recipe || busy) return;
        const ok = await confirmDialog({
            title: 'Read again?',
            body: 'Title, ingredients, method and notes will be overwritten.',
            confirmLabel: 'Read again',
        });
        if (!ok) return;

        busy = true;
        toast('Reading the recipe…', { duration: 60000 });
        try {
            let fresh = null;
            if (safeUrl(recipe.source)) {
                try { fresh = await fetchRecipeFromUrl(recipe.source); } catch { /* fall back to the current text */ }
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
            toast('Recipe updated');
        } catch (error) {
            toast(translateError(error), { tone: 'error', duration: 6000 });
        } finally {
            busy = false;
        }
    }

    // --- Parts of the page ---

    function scaler(recipe, rerender) {
        const info = scaleInfo(recipe);
        const set = factor => { setFactor(recipe, factor); rerender(); };

        if (info.mode === 'servings') {
            const step = delta => set(Math.max(1, info.count + delta) / info.base);
            return h('div', { class: 'scaler' },
                h('div', { class: 'stepper', role: 'group', 'aria-label': 'Number of servings' },
                    h('button', { class: 'stepper-btn', type: 'button', 'aria-label': 'Fewer', disabled: info.count <= 1, onclick: () => step(-1) }, '−'),
                    h('span', { class: 'stepper-value', 'aria-live': 'polite' }, info.label),
                    h('button', { class: 'stepper-btn', type: 'button', 'aria-label': 'More', onclick: () => step(1) }, '+'),
                ),
                info.count !== info.base && h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => set(1) },
                    `Back to ${info.base}`),
            );
        }
        return h('div', { class: 'scaler' },
            h('div', { class: 'segmented', role: 'group', 'aria-label': 'Quantity' },
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
        }, 'Clear checks');

        const hasNook = state.settings.nookUrl && state.settings.nookToken;
        return h('section', { class: 'section' },
            h('div', { class: 'section-head' },
                h('h2', null, 'Ingredients'),
                h('div', { class: 'section-actions' },
                    h('button', {
                        class: 'btn btn-small', type: 'button',
                        onclick: async () => {
                            try {
                                await navigator.clipboard.writeText(recipe.ingredients.map(i => scaleIngredient(i, factor)).join('\n'));
                                toast('Ingredients copied');
                            } catch { toast('Could not copy the ingredients', { tone: 'error' }); }
                        },
                    }, icon('copy'), 'Copy'),
                    h('button', {
                        class: 'btn btn-small', type: 'button',
                        onclick: () => openAddToListSheet(recipe, factor),
                    }, icon('list'), 'Add to list'),
                    hasNook && h('button', {
                        class: 'btn btn-small', type: 'button',
                        onclick: () => openNookSheet(recipe, factor),
                    }, icon('cart'), 'Send to Nook'),
                ),
            ),
            scaler(recipe, rerender),
            ingredientList(recipe, factor, now => { resetButton.hidden = now.size === 0; }),
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
                    h('p', { class: 'empty-title' }, 'This recipe no longer exists'),
                    h('p', null, 'It was deleted, possibly on another device.'),
                    h('button', { class: 'btn btn-primary', type: 'button', onclick: () => replace(paths.home) }, 'Go to all recipes'))
                : h('div', { class: 'empty' }, h('p', null, 'Loading recipe…')));
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
        starButton.setAttribute('aria-label', recipe.favorite ? 'Favorite. Tap to remove.' : 'Add to favorites');
        replaceChildren(starButton, icon('star', { filled: recipe.favorite }));

        const sourceUrl = safeUrl(recipe.source);
        const rerender = () => render(true);
        const image = recipe.image && h('img', { class: 'recipe-image', src: recipe.image, alt: '' });
        if (image) image.addEventListener('error', () => image.remove());

        replaceChildren(content,
            image,
            h('h1', { class: `recipe-title${recipe.title.length > 34 ? ' is-long' : ''}` }, recipe.title),
            (folder || recipe.source) && h('p', { class: 'recipe-meta' },
                folder && h('span', null, folder.name),
                folder && recipe.source && ' · ',
                sourceUrl
                    ? h('a', { href: sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, hostName(sourceUrl))
                    : recipe.source && h('span', null, recipe.source),
            ),
            recipe.instructions.length > 0 && h('button', {
                class: 'btn btn-primary btn-wide cook-start', type: 'button', onclick: () => go(paths.cook(id)),
            }, icon('pot'), 'Start cook mode'),
            recipe.ingredients.length > 0
                ? ingredients(recipe, rerender)
                : h('section', { class: 'section' }, h('h2', null, 'Ingredients'),
                    h('p', { class: 'muted' }, 'No ingredients saved.')),
            h('section', { class: 'section' },
                h('h2', null, 'Method'),
                recipe.instructions.length > 0
                    ? h('ol', { class: 'steps' }, recipe.instructions.map(step => h('li', null, step)))
                    : h('p', { class: 'muted' }, 'No method saved.'),
            ),
            recipe.notes && h('section', { class: 'section' },
                h('h2', null, 'Notes'),
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
