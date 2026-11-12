// What you set per recipe while cooking: scale, checks, current step.
// This is kept apart from the recipe data, so a sync update cannot clear it.

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
    try { storage.setItem(key, JSON.stringify(value)); } catch { /* storage not available */ }
}

// --- Scale. Holds until you close the app. ---

export function getFactor(recipe) {
    const factor = read(sessionStorage, `rb2:factor:${recipe.id}`, 1);
    return typeof factor === 'number' && factor > 0 ? factor : 1;
}

export function setFactor(recipe, factor) {
    write(sessionStorage, `rb2:factor:${recipe.id}`, factor);
}

/** Describes how the scale is shown: as a number of servings, or as a multiplier. */
export function scaleInfo(recipe) {
    const factor = getFactor(recipe);
    const base = parseServings(recipe.servings);
    if (!base) return { mode: 'factor', factor };
    const count = Math.max(1, Math.round(base * factor));
    return { mode: 'servings', factor, base, count, label: withServings(recipe.servings, count) };
}

// --- Checks. Stored per ingredient (by text), not per position. ---

const checkedKey = id => `rb2:checked:${id}`;

export function getChecked(recipe) {
    const stored = new Set(read(localStorage, checkedKey(recipe.id), []));
    // Only checks that still belong to an existing ingredient count.
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
    try { localStorage.removeItem(checkedKey(recipe.id)); } catch { /* nothing to clear */ }
}

// --- Current step in cook mode. ---

export function getStep(recipe) {
    const step = read(sessionStorage, `rb2:step:${recipe.id}`, 0);
    const last = Math.max(0, recipe.instructions.length - 1);
    return Number.isInteger(step) ? Math.min(Math.max(step, 0), last) : 0;
}

export function setStep(recipe, step) {
    write(sessionStorage, `rb2:step:${recipe.id}`, step);
}

// --- Filter, search term and sort order of the list. ---

export const listState = read(sessionStorage, 'rb2:list', { filter: 'all', query: '', sort: 'recent' });

export function saveListState() {
    write(sessionStorage, 'rb2:list', listState);
}
