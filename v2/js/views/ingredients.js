// The prep list: a checklist of ingredients with the amounts in their own
// column. Used on the recipe screen and in cook mode, sharing the same checks.

import { h, icon } from '../dom.js';
import { scaleIngredient, splitIngredient, ingredientKey } from '../quantity.js';
import { getChecked, toggleChecked } from '../viewstate.js';

// Lines like "For the sauce:" are headings, not ingredients.
export const isHeading = text => /:\s*$/.test(text) && !/\d/.test(text);

/**
 * @param recipe    the recipe
 * @param factor    scale factor for the amounts
 * @param onToggle  called with the set of checked keys after every tap
 */
export function ingredientList(recipe, factor, onToggle) {
    const checked = getChecked(recipe);

    return h('ul', { class: 'ingredients' }, recipe.ingredients.map(text => {
        if (isHeading(text)) return h('li', { class: 'ingredient-heading' }, text.replace(/:\s*$/, ''));

        const isChecked = checked.has(ingredientKey(text));
        const { amount, name } = splitIngredient(scaleIngredient(text, factor));
        return h('li', null,
            h('button', {
                class: `ingredient${isChecked ? ' is-checked' : ''}`, type: 'button',
                role: 'checkbox', 'aria-checked': String(isChecked),
                onclick: e => {
                    const now = toggleChecked(recipe, text);
                    const on = now.has(ingredientKey(text));
                    e.currentTarget.classList.toggle('is-checked', on);
                    e.currentTarget.setAttribute('aria-checked', String(on));
                    onToggle?.(now);
                },
            },
                h('span', { class: 'checkbox' }, icon('check')),
                h('span', { class: 'ingredient-amount' }, amount),
                h('span', { class: 'ingredient-text' }, name),
            ),
        );
    }));
}
