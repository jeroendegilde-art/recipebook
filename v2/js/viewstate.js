// Wat je per recept hebt ingesteld terwijl je kookt: schaal, vinkjes, huidige stap.
// Dit staat los van de receptdata, zodat een sync-update het niet kan wissen.

import { ingredientKey, parseServings, withServings } from './quantity.js';

function read(storage, key, fallback) {
    try {
        const raw = storage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function write(storage, key, value) {
    try { storage.setItem(key, JSON.stringify(value)); } catch { /* opslag niet beschikbaar */ }
}

// --- Schaal. Geldt tot je de app sluit. ---

export function getFactor(recipe) {
    const factor = read(sessionStorage, `rb2:factor:${recipe.id}`, 1);
    return typeof factor === 'number' && factor > 0 ? factor : 1;
}

export function setFactor(recipe, factor) {
    write(sessionStorage, `rb2:factor:${recipe.id}`, factor);
}

/** Beschrijft hoe de schaal getoond wordt: als aantal porties, of als vermenigvuldiger. */
export function scaleInfo(recipe) {
    const factor = getFactor(recipe);
    const base = parseServings(recipe.servings);
    if (!base) return { mode: 'factor', factor };
    const count = Math.max(1, Math.round(base * factor));
    return { mode: 'servings', factor, base, count, label: withServings(recipe.servings, count) };
}

// --- Vinkjes. Bewaard per ingrediënt (op tekst), niet per positie. ---

const checkedKey = id => `rb2:checked:${id}`;

export function getChecked(recipe) {
    const stored = new Set(read(localStorage, checkedKey(recipe.id), []));
    // Alleen vinkjes die nog bij een bestaand ingrediënt horen tellen mee.
    const current = new Set(recipe.ingredients.map(ingredientKey));
    return new Set([...stored].filter(key => current.has(key)));
}

export function toggleChecked(recipe, ingredient) {
    const checked = getChecked(recipe);
    const key = ingredientKey(ingredient);
    if (checked.has(key)) checked.delete(key); else checked.add(key);
    write(localStorage, checkedKey(recipe.id), [...checked]);
    return checked;
}

export function clearChecked(recipe) {
    try { localStorage.removeItem(checkedKey(recipe.id)); } catch { /* niets te wissen */ }
}

// --- Huidige stap in de kookstand. ---

export function getStep(recipe) {
    const step = read(sessionStorage, `rb2:step:${recipe.id}`, 0);
    const last = Math.max(0, recipe.instructions.length - 1);
    return Number.isInteger(step) ? Math.min(Math.max(step, 0), last) : 0;
}

export function setStep(recipe, step) {
    write(sessionStorage, `rb2:step:${recipe.id}`, step);
}

// --- Filter, zoekterm en sortering van de lijst. ---

export const listState = read(sessionStorage, 'rb2:list', { filter: 'all', query: '', sort: 'recent' });

export function saveListState() {
    write(sessionStorage, 'rb2:list', listState);
}
