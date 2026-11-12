// Kookstand: één stap tegelijk, groot genoeg om vanaf het aanrecht te lezen.
// Het scherm blijft aan zolang deze stand open is (als het apparaat dat kan).

import { h, icon, replaceChildren } from '../dom.js';
import { state, on, getRecipe } from '../store.js';
import { back, paths } from '../router.js';
import { scaleIngredient, ingredientKey } from '../quantity.js';
import { getFactor, getChecked, toggleChecked, getStep, setStep, scaleInfo } from '../viewstate.js';

export function mountCook(container, id) {
    let wakeLock = null;
    let touchStart = null;

    const position = h('span', { class: 'cook-position', 'aria-live': 'polite' });
    const bar = h('span', { class: 'cook-bar-fill' });
    const stepText = h('p', { class: 'cook-step-text' });
    const prev = h('button', { class: 'btn cook-nav', type: 'button', onclick: () => move(-1) }, 'Vorige');
    const next = h('button', { class: 'btn btn-primary cook-nav', type: 'button', onclick: () => move(1) });
    const stage = h('main', { class: 'cook-stage' }, stepText);
    const close = () => back(paths.recipe(id));

    replaceChildren(container,
        h('div', { class: 'cook' },
            h('header', { class: 'cook-head' },
                h('button', { class: 'btn btn-quiet', type: 'button', onclick: close }, icon('close'), 'Stoppen'),
                position,
                h('button', { class: 'btn btn-quiet', type: 'button', onclick: showIngredients }, icon('list'), 'Ingrediënten'),
            ),
            h('div', { class: 'cook-bar' }, bar),
            stage,
            h('footer', { class: 'cook-foot' }, prev, next),
        ),
    );

    function move(delta) {
        const recipe = getRecipe(id);
        if (!recipe) { close(); return; }
        const target = getStep(recipe) + delta;
        if (target >= recipe.instructions.length) { close(); return; }
        if (target < 0) return;
        setStep(recipe, target);
        render();
        stage.scrollTop = 0;
    }

    function render() {
        const recipe = getRecipe(id);
        const total = recipe?.instructions.length || 0;
        if (!recipe || total === 0) {
            position.textContent = '';
            stepText.textContent = recipe ? 'Dit recept heeft geen stappen.' : (state.loaded ? 'Dit recept bestaat niet meer.' : 'Laden…');
            prev.hidden = true;
            next.textContent = 'Sluiten';
            return;
        }
        const step = getStep(recipe);
        position.textContent = `Stap ${step + 1} van ${total}`;
        bar.style.width = `${((step + 1) / total) * 100}%`;
        stepText.textContent = recipe.instructions[step];
        prev.hidden = false;
        prev.disabled = step === 0;
        next.textContent = step === total - 1 ? 'Klaar' : 'Volgende';
    }

    function showIngredients() {
        const recipe = getRecipe(id);
        if (!recipe) return;
        const factor = getFactor(recipe);
        const checked = getChecked(recipe);
        const info = scaleInfo(recipe);
        const dialog = h('dialog', { class: 'dialog dialog-sheet' },
            h('h2', { class: 'dialog-title' }, 'Ingrediënten'),
            info.mode === 'servings'
                ? h('p', { class: 'dialog-body' }, info.label)
                : factor !== 1 && h('p', { class: 'dialog-body' }, `Hoeveelheden × ${String(factor).replace('.', ',')}`),
            h('ul', { class: 'ingredients' }, recipe.ingredients.map(text => {
                if (/:\s*$/.test(text) && !/\d/.test(text)) return h('li', { class: 'ingredient-heading' }, text.replace(/:\s*$/, ''));
                const isChecked = checked.has(ingredientKey(text));
                return h('li', null, h('button', {
                    class: `ingredient${isChecked ? ' is-checked' : ''}`, type: 'button',
                    role: 'checkbox', 'aria-checked': String(isChecked),
                    onclick: e => {
                        const on = toggleChecked(recipe, text).has(ingredientKey(text));
                        e.currentTarget.classList.toggle('is-checked', on);
                        e.currentTarget.setAttribute('aria-checked', String(on));
                    },
                },
                    h('span', { class: 'checkbox' }, icon('check')),
                    h('span', { class: 'ingredient-text' }, scaleIngredient(text, factor)),
                ));
            })),
            h('div', { class: 'dialog-actions' },
                h('button', { class: 'btn btn-primary', type: 'button', onclick: () => dialog.close() }, 'Sluiten'),
            ),
        );
        document.body.appendChild(dialog);
        dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
        dialog.addEventListener('close', () => dialog.remove());
        dialog.showModal();
    }

    // Scherm aan houden. Lukt dat niet, dan werkt de kookstand gewoon door.
    async function keepAwake() {
        if (!('wakeLock' in navigator) || wakeLock || document.visibilityState !== 'visible') return;
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => { wakeLock = null; });
        } catch { wakeLock = null; }
    }

    function onKey(e) {
        if (document.querySelector('dialog[open]')) return;
        if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); move(1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
        else if (e.key === 'Escape') close();
    }

    function onTouchStart(e) {
        const t = e.changedTouches[0];
        touchStart = { x: t.clientX, y: t.clientY };
    }

    function onTouchEnd(e) {
        if (!touchStart) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStart.x;
        const dy = t.clientY - touchStart.y;
        touchStart = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) move(dx < 0 ? 1 : -1);
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', keepAwake);
    stage.addEventListener('touchstart', onTouchStart, { passive: true });
    stage.addEventListener('touchend', onTouchEnd, { passive: true });
    const stop = on('recipes', render);
    keepAwake();
    render();

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
