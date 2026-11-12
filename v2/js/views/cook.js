// Cook mode: the whole method at a glance, large enough to read from the
// counter. Every step is visible; the one you are on is lit. Tap any step to
// move there. On a wide screen the ingredients sit next to the steps.
// The screen stays on while this mode is open (if the device supports it).

import { h, icon, replaceChildren } from '../dom.js';
import { state, on, getRecipe } from '../store.js';
import { back, paths } from '../router.js';
import { getFactor, getStep, setStep, scaleInfo } from '../viewstate.js';
import { ingredientList } from './ingredients.js';

function scaleNote(recipe) {
    const info = scaleInfo(recipe);
    if (info.mode === 'servings') return info.label;
    return info.factor === 1 ? '' : `Quantities × ${info.factor}`;
}

export function mountCook(container, id) {
    let wakeLock = null;
    let lastSignature = null;
    let stepButtons = [];

    const close = () => back(paths.recipe(id));
    const title = h('span', { class: 'cook-title' });
    const ticks = h('div', { class: 'cook-ticks', 'aria-hidden': 'true' });
    const side = h('aside', { class: 'cook-side', 'aria-label': 'Ingredients' });
    const steps = h('ol', { class: 'cook-steps' });
    const prev = h('button', { class: 'btn cook-nav', type: 'button', onclick: () => move(-1) }, 'Back');
    const next = h('button', { class: 'btn btn-primary cook-nav', type: 'button', onclick: () => move(1) });

    replaceChildren(container,
        h('div', { class: 'cook' },
            h('header', { class: 'cook-head' },
                h('button', { class: 'btn btn-quiet', type: 'button', onclick: close }, icon('close'), 'Stop'),
                title,
                h('button', { class: 'btn btn-quiet cook-ingredients-btn', type: 'button', onclick: showIngredients },
                    icon('list'), 'Ingredients'),
            ),
            ticks,
            h('div', { class: 'cook-body' }, side, steps),
            h('footer', { class: 'cook-foot' }, prev, next),
        ),
    );

    function goTo(index, { scroll = true } = {}) {
        const recipe = getRecipe(id);
        if (!recipe) return;
        setStep(recipe, index);
        mark(recipe);
        if (scroll) {
            const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
            stepButtons[getStep(recipe)]?.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
        }
    }

    function move(delta) {
        const recipe = getRecipe(id);
        if (!recipe) { close(); return; }
        const target = getStep(recipe) + delta;
        if (target >= recipe.instructions.length) { close(); return; }
        if (target >= 0) goTo(target);
    }

    // Update which step is lit, without rebuilding the list.
    function mark(recipe) {
        const current = getStep(recipe);
        const total = recipe.instructions.length;
        stepButtons.forEach((button, index) => {
            button.classList.toggle('is-done', index < current);
            button.classList.toggle('is-current', index === current);
            if (index === current) button.setAttribute('aria-current', 'step');
            else button.removeAttribute('aria-current');
        });
        [...ticks.children].forEach((tick, index) => {
            tick.className = index < current ? 'is-done' : index === current ? 'is-current' : '';
        });
        prev.disabled = current === 0;
        next.textContent = current >= total - 1 ? 'Done' : 'Next step';
    }

    function render() {
        const recipe = getRecipe(id);
        const total = recipe?.instructions.length || 0;

        if (!recipe || total === 0) {
            lastSignature = null;
            stepButtons = [];
            title.textContent = recipe?.title || '';
            replaceChildren(ticks);
            replaceChildren(side);
            replaceChildren(steps, h('li', { class: 'empty' }, h('p', null,
                recipe ? 'This recipe has no steps.' : (state.loaded ? 'This recipe no longer exists.' : 'Loading…'))));
            prev.hidden = true;
            next.textContent = 'Close';
            return;
        }

        const factor = getFactor(recipe);
        const signature = JSON.stringify([recipe.title, recipe.ingredients, recipe.instructions, factor]);
        if (signature !== lastSignature) {
            lastSignature = signature;
            title.textContent = recipe.title;
            replaceChildren(ticks, recipe.instructions.map(() => h('i')));
            stepButtons = recipe.instructions.map((text, index) => h('button', {
                class: 'cook-step', type: 'button', onclick: () => goTo(index, { scroll: false }),
            },
                h('span', { class: 'cook-step-n' }, index + 1),
                h('span', { class: 'cook-step-text' }, text),
            ));
            replaceChildren(steps, stepButtons.map(button => h('li', null, button)));
            const note = scaleNote(recipe);
            replaceChildren(side,
                h('h2', null, 'Ingredients'),
                note && h('p', { class: 'cook-side-note' }, note),
                recipe.ingredients.length > 0
                    ? ingredientList(recipe, factor)
                    : h('p', { class: 'muted' }, 'No ingredients saved.'),
            );
        }
        prev.hidden = false;
        mark(recipe);
    }

    // On a phone the ingredients open as a sheet over the steps.
    function showIngredients() {
        const recipe = getRecipe(id);
        if (!recipe) return;
        const note = scaleNote(recipe);
        const dialog = h('dialog', { class: 'dialog dialog-sheet' },
            h('h2', { class: 'dialog-title' }, 'Ingredients'),
            note && h('p', { class: 'dialog-body' }, note),
            ingredientList(recipe, getFactor(recipe)),
            h('div', { class: 'dialog-actions' },
                h('button', { class: 'btn btn-primary', type: 'button', onclick: () => dialog.close() }, 'Close'),
            ),
        );
        document.body.appendChild(dialog);
        dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
        dialog.addEventListener('close', () => {
            dialog.remove();
            // Checks made in the sheet show up in the side list on wide screens.
            lastSignature = null;
            render();
        });
        dialog.showModal();
    }

    // Keep the screen on. If that fails, cook mode simply carries on.
    async function keepAwake() {
        if (!('wakeLock' in navigator) || wakeLock || document.visibilityState !== 'visible') return;
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => { wakeLock = null; });
        } catch { wakeLock = null; }
    }

    function onKey(e) {
        if (document.querySelector('dialog[open]')) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); move(1); }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
        else if (e.key === 'Escape') close();
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', keepAwake);
    const stop = on('recipes', render);
    keepAwake();
    render();
    // Open where you left off, without animating the first scroll.
    const recipe = getRecipe(id);
    if (recipe) stepButtons[getStep(recipe)]?.scrollIntoView({ block: 'center' });

    return {
        destroy() {
            stop();
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('visibilitychange', keepAwake);
            wakeLock?.release().catch(() => {});
            wakeLock = null;
        },
    };
}
