// Single source of truth for recipes, collections and settings.
// Screens read `state` and listen with on(). They only write through the
// functions below. The data format is the same as v1.

import { backend } from './firebase.js';
import { parseItem, mergeAmounts, productKey } from './shopping.js';

export const state = {
    user: null,
    authReady: false,
    recipes: [],
    folders: [],
    settings: { apiKey: '', model: '', nookUrl: '', nookToken: '' },
    // prices: what you typed, { [product key]: { ah, jumbo, updatedAt } }
    // picks: the product you chose per store, { [product key]: { ah: { l, n, s, p }, jumbo: {...} } }
    shopping: { items: [], prices: {}, picks: {} },
    sync: 'connecting', // 'connecting' | 'synced' | 'offline' | 'error'
    loaded: false,      // true once recipes have arrived from cache or cloud
};

// Fallback while the model list has not been fetched yet or no choice was made.
export const DEFAULT_MODEL = 'claude-sonnet-5-5';

const listeners = new Map();
let unsubscribers = [];

export function on(topic, fn) {
    if (!listeners.has(topic)) listeners.set(topic, new Set());
    listeners.get(topic).add(fn);
    return () => listeners.get(topic)?.delete(fn);
}

function emit(topic, payload) {
    listeners.get(topic)?.forEach(fn => {
        try { fn(payload); } catch (error) { console.error(`Error in listener for "${topic}"`, error); }
    });
}

// --- Normalization: whatever is in the database, the app gets a complete recipe. ---

const asText = value => (typeof value === 'string' ? value : value == null ? '' : String(value));
const asLines = value => (Array.isArray(value) ? value.map(asText).map(s => s.trim()).filter(Boolean) : []);

export function normalizeRecipe(raw) {
    return {
        ...raw,
        id: asText(raw.id),
        title: asText(raw.title).trim() || 'Untitled recipe',
        servings: asText(raw.servings),
        ingredients: asLines(raw.ingredients),
        instructions: asLines(raw.instructions),
        notes: asText(raw.notes),
        source: asText(raw.source),
        image: asText(raw.image),
        folderId: asText(raw.folderId),
        favorite: raw.favorite === true,
        createdAt: asText(raw.createdAt),
    };
}

function normalizeFolder(raw) {
    return { ...raw, id: asText(raw.id), name: asText(raw.name).trim() || 'Untitled', createdAt: asText(raw.createdAt) };
}

function sortRecipes(list) {
    return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

function sortFolders(list) {
    return list.sort((a, b) => {
        const ao = typeof a.order === 'number' ? a.order : Infinity;
        const bo = typeof b.order === 'number' ? b.order : Infinity;
        if (ao !== bo) return ao - bo;
        return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    });
}

// --- Local copy, so the app shows something right away and stays readable offline. ---

const cacheKey = uid => `rb2:cache:${uid}`;

function readCache(uid) {
    try { return JSON.parse(localStorage.getItem(cacheKey(uid)) || 'null'); } catch { return null; }
}

function writeCache() {
    if (!state.user) return;
    try {
        localStorage.setItem(cacheKey(state.user.uid), JSON.stringify({ recipes: state.recipes, folders: state.folders }));
    } catch { /* storage full or blocked: the app carries on without a cache */ }
}

// --- Shopping list. One document: the items you need now, and the prices you
// entered before. Prices outlive the items, so next week's milk is already priced. ---

function normalizeItem(raw) {
    const amount = asText(raw.amount).trim();
    const name = asText(raw.name).trim();
    return {
        id: asText(raw.id),
        amount,
        name,
        text: [amount, name].filter(Boolean).join(' '),
        key: productKey(name),
        count: Number.isInteger(raw.count) && raw.count > 0 ? raw.count : 0, // 0: the app works it out
        checked: raw.checked === true,
        recipeTitle: asText(raw.recipeTitle),
        order: typeof raw.order === 'number' ? raw.order : 0,
    };
}

function normalizeShopping(data) {
    const items = Object.entries(data?.items && typeof data.items === 'object' ? data.items : {})
        .filter(([, raw]) => raw && typeof raw === 'object')
        .map(([id, raw]) => normalizeItem({ ...raw, id }))
        .filter(item => item.name)
        .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));

    const prices = {};
    for (const [key, raw] of Object.entries(data?.prices && typeof data.prices === 'object' ? data.prices : {})) {
        if (!raw || typeof raw !== 'object') continue;
        const entry = {};
        for (const [field, value] of Object.entries(raw)) {
            if (field === 'updatedAt') entry.updatedAt = asText(value);
            else if (typeof value === 'number' && value > 0) entry[field] = value;
        }
        if (Object.keys(entry).some(field => field !== 'updatedAt')) prices[key] = entry;
    }

    const picks = {};
    for (const [key, raw] of Object.entries(data?.picks && typeof data.picks === 'object' ? data.picks : {})) {
        if (!raw || typeof raw !== 'object') continue;
        const entry = {};
        for (const [storeId, pick] of Object.entries(raw)) {
            if (!pick || typeof pick.l !== 'string' || !pick.l || !(pick.p > 0)) continue;
            entry[storeId] = { l: pick.l, n: asText(pick.n), s: asText(pick.s), p: pick.p };
        }
        if (Object.keys(entry).length) picks[key] = entry;
    }
    return { items, prices, picks };
}

const shoppingCacheKey = uid => `rb2:shopping:${uid}`;

function readShoppingCache(uid) {
    try { return JSON.parse(localStorage.getItem(shoppingCacheKey(uid)) || 'null'); } catch { return null; }
}

function shoppingChanged() {
    if (state.user) {
        try {
            const items = Object.fromEntries(state.shopping.items.map(item => [item.id, item]));
            localStorage.setItem(shoppingCacheKey(state.user.uid), JSON.stringify({ items, prices: state.shopping.prices, picks: state.shopping.picks }));
        } catch { /* no cache, the app carries on */ }
    }
    emit('shopping');
}

function setSync(value) {
    if (state.sync === value) return;
    state.sync = value;
    emit('sync', value);
}

// --- Signing in and listening ---

export function init() {
    backend.onAuth(user => {
        stopListening();
        state.user = user;
        state.authReady = true;

        if (!user) {
            state.recipes = [];
            state.folders = [];
            state.settings = { apiKey: '', model: '', nookUrl: '', nookToken: '' };
            state.shopping = { items: [], prices: {}, picks: {} };
            state.loaded = false;
            emit('auth', null);
            return;
        }

        const cached = readCache(user.uid);
        if (cached) {
            state.recipes = sortRecipes((cached.recipes || []).map(normalizeRecipe));
            state.folders = sortFolders((cached.folders || []).map(normalizeFolder));
            state.loaded = true;
        }
        state.shopping = normalizeShopping(readShoppingCache(user.uid));
        emit('auth', user);
        startListening(user.uid);
    });

    window.addEventListener('online', () => { if (state.sync === 'offline') setSync('connecting'); });
    window.addEventListener('offline', () => setSync('offline'));
}

function startListening(uid) {
    setSync(navigator.onLine ? 'connecting' : 'offline');
    const failed = error => { console.error('Sync error', error); setSync('error'); };

    unsubscribers = [
        backend.watchCollection(['users', uid, 'recipes'], docs => {
            state.recipes = sortRecipes(docs.filter(d => d && d.id).map(normalizeRecipe));
            state.loaded = true;
            writeCache();
            setSync(navigator.onLine ? 'synced' : 'offline');
            emit('recipes');
        }, failed),

        backend.watchCollection(['users', uid, 'folders'], docs => {
            state.folders = sortFolders(docs.filter(d => d && d.id).map(normalizeFolder));
            writeCache();
            emit('folders');
        }, failed),

        // v1 keeps all settings in a single document with this name.
        backend.watchDoc(['users', uid, 'settings', 'apiKey'], data => {
            state.settings = {
                apiKey: asText(data?.claudeApiKey),
                model: asText(data?.model),
                nookUrl: asText(data?.nookUrl),
                nookToken: asText(data?.nookToken),
            };
            emit('settings');
        }, error => console.error('Loading settings failed', error)),

        // Next to the settings document, so it falls under the same access rules.
        backend.watchDoc(['users', uid, 'settings', 'shopping'], data => {
            state.shopping = normalizeShopping(data);
            shoppingChanged();
        }, error => console.error('Loading the shopping list failed', error)),
    ];
}

function stopListening() {
    unsubscribers.forEach(stop => { try { stop(); } catch { /* already stopped */ } });
    unsubscribers = [];
}

export const signIn = () => backend.signIn();
export const signOut = () => backend.signOut();

// --- Writing. First locally (visible right away), then to the cloud. ---

function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function withoutUndefined(object) {
    return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

async function write(path, data, options) {
    if (!state.user) throw new Error('Not signed in');
    try {
        await backend.set(path, withoutUndefined(data), options);
    } catch (error) {
        console.error('Saving failed', error);
        emit('write-error', error);
        throw error;
    }
}

const recipePath = id => ['users', state.user.uid, 'recipes', id];
const folderPath = id => ['users', state.user.uid, 'folders', id];

export function getRecipe(id) {
    return state.recipes.find(r => r.id === id) || null;
}

export function getFolder(id) {
    return state.folders.find(f => f.id === id) || null;
}

export function addRecipe(data) {
    const recipe = normalizeRecipe({ ...data, id: newId(), createdAt: new Date().toISOString() });
    state.recipes = sortRecipes([recipe, ...state.recipes]);
    writeCache();
    emit('recipes');
    write(recipePath(recipe.id), recipe).catch(() => {});
    return recipe;
}

/** Changes only the given fields. Other fields in the cloud stay as they are. */
export function updateRecipe(id, patch) {
    const current = getRecipe(id);
    if (!current) return null;
    const changes = { ...patch, updatedAt: new Date().toISOString() };
    const updated = normalizeRecipe({ ...current, ...changes });
    state.recipes = state.recipes.map(r => (r.id === id ? updated : r));
    writeCache();
    emit('recipes');
    write(recipePath(id), { ...changes, id }, { merge: true }).catch(() => {});
    return updated;
}

/** Deletes and returns a function that undoes it. */
export function deleteRecipe(id) {
    const removed = getRecipe(id);
    if (!removed) return null;
    state.recipes = state.recipes.filter(r => r.id !== id);
    writeCache();
    emit('recipes');
    backend.remove(recipePath(id)).catch(error => { console.error(error); emit('write-error', error); });

    return function undo() {
        state.recipes = sortRecipes([removed, ...state.recipes.filter(r => r.id !== id)]);
        writeCache();
        emit('recipes');
        write(recipePath(id), removed).catch(() => {});
    };
}

/** Adds recipes from a backup. Existing recipes (same id) are left untouched. */
export async function importRecipes(list) {
    const existing = new Set(state.recipes.map(r => r.id));
    const incoming = list
        .filter(item => item && typeof item === 'object' && (item.title || item.ingredients))
        .map(item => normalizeRecipe({
            ...item,
            id: asText(item.id) || newId(),
            createdAt: asText(item.createdAt) || new Date().toISOString(),
        }))
        .filter(recipe => !existing.has(recipe.id));

    for (const recipe of incoming) await write(recipePath(recipe.id), recipe);
    return { added: incoming.length, skipped: list.length - incoming.length };
}

export function addFolder(name) {
    const folder = { id: newId(), name: name.trim(), createdAt: new Date().toISOString(), order: state.folders.length };
    state.folders = [...state.folders, folder];
    writeCache();
    emit('folders');
    write(folderPath(folder.id), folder).catch(() => {});
    return folder;
}

export function renameFolder(id, name) {
    const changes = { name: name.trim(), updatedAt: new Date().toISOString() };
    state.folders = state.folders.map(f => (f.id === id ? { ...f, ...changes } : f));
    writeCache();
    emit('folders');
    write(folderPath(id), { ...changes, id }, { merge: true }).catch(() => {});
}

/** Deletes the collection. The recipes in it remain, without a collection. */
export function deleteFolder(id) {
    state.recipes.filter(r => r.folderId === id).forEach(r => updateRecipe(r.id, { folderId: '' }));
    state.folders = state.folders.filter(f => f.id !== id);
    writeCache();
    emit('folders');
    backend.remove(folderPath(id)).catch(error => { console.error(error); emit('write-error', error); });
}

export function moveFolder(id, direction) {
    const index = state.folders.findIndex(f => f.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= state.folders.length) return;
    const next = state.folders.slice();
    [next[index], next[target]] = [next[target], next[index]];
    state.folders = next.map((folder, order) => ({ ...folder, order }));
    writeCache();
    emit('folders');
    state.folders.forEach(folder => {
        write(folderPath(folder.id), { id: folder.id, order: folder.order }, { merge: true }).catch(() => {});
    });
}

// --- Shopping list ---

const shoppingPath = () => ['users', state.user.uid, 'settings', 'shopping'];

function storedItem(item) {
    const { id, amount, name, count, checked, recipeTitle, order } = item;
    return { id, amount, name, count, checked, recipeTitle, order };
}

function writeItems(items) {
    const data = Object.fromEntries(items.map(item => [item.id, storedItem(item)]));
    write(shoppingPath(), { items: data }, { merge: true }).catch(() => {});
}

export function getShoppingItem(id) {
    return state.shopping.items.find(item => item.id === id) || null;
}

/**
 * Add lines to the list. entries: [{ text, recipeTitle }].
 * A product that is already on the list (and not yet in the cart) gets the
 * extra amount instead of a second row.
 */
export function addShoppingItems(entries) {
    const items = state.shopping.items.slice();
    const changed = new Map();
    let added = 0;
    let merged = 0;
    let order = Date.now();

    for (const entry of entries) {
        const parsed = parseItem(entry.text);
        if (!parsed.name || !parsed.key) continue;
        const index = items.findIndex(item => !item.checked && item.key === parsed.key);
        if (index >= 0) {
            const next = normalizeItem({ ...items[index], amount: mergeAmounts(items[index].amount, parsed.amount) });
            items[index] = next;
            changed.set(next.id, next);
            merged += 1;
        } else {
            const item = normalizeItem({
                id: newId(), amount: parsed.amount, name: parsed.name,
                count: 0, checked: false, recipeTitle: entry.recipeTitle || '', order: order++,
            });
            items.push(item);
            changed.set(item.id, item);
            added += 1;
        }
    }

    if (changed.size > 0) {
        state.shopping = { ...state.shopping, items };
        shoppingChanged();
        writeItems([...changed.values()]);
    }
    return { added, merged };
}

export function updateShoppingItem(id, patch) {
    const current = getShoppingItem(id);
    if (!current) return null;
    const updated = normalizeItem({ ...current, ...patch, id });
    if (!updated.name) return null;
    state.shopping = { ...state.shopping, items: state.shopping.items.map(item => (item.id === id ? updated : item)) };
    shoppingChanged();
    writeItems([updated]);
    return updated;
}

/** Removes items and returns a function that puts them back. */
export function removeShoppingItems(ids) {
    const gone = new Set(ids);
    const removed = state.shopping.items.filter(item => gone.has(item.id));
    if (removed.length === 0) return () => {};
    state.shopping = { ...state.shopping, items: state.shopping.items.filter(item => !gone.has(item.id)) };
    shoppingChanged();
    const fields = Object.fromEntries(removed.map(item => [item.id, backend.removeField()]));
    write(shoppingPath(), { items: fields }, { merge: true }).catch(() => {});

    return function undo() {
        const present = new Set(state.shopping.items.map(item => item.id));
        const back = removed.filter(item => !present.has(item.id));
        const items = [...state.shopping.items, ...back].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
        state.shopping = { ...state.shopping, items };
        shoppingChanged();
        writeItems(back);
    };
}

/**
 * Say what a product costs at a store. Per product and store there is one
 * answer: a product you picked from the store's range, a price you typed, or
 * neither (then the app matches by itself).
 * offers: [{ key, storeId, pick?: { l, n, s, p }, price?: number }]
 */
export function setOffers(offers) {
    const prices = { ...state.shopping.prices };
    const picks = { ...state.shopping.picks };
    const data = { prices: {}, picks: {} };
    const updatedAt = new Date().toISOString();

    for (const { key, storeId, pick, price } of offers) {
        if (!key) continue;
        const priceEntry = { ...prices[key], updatedAt };
        const pickEntry = { ...picks[key] };
        delete priceEntry[storeId];
        delete pickEntry[storeId];
        data.prices[key] = { ...data.prices[key], [storeId]: backend.removeField(), updatedAt };
        data.picks[key] = { ...data.picks[key], [storeId]: backend.removeField() };

        if (pick) {
            pickEntry[storeId] = { l: pick.l, n: pick.n, s: pick.s || '', p: pick.p };
            data.picks[key][storeId] = pickEntry[storeId];
        } else if (price > 0) {
            priceEntry[storeId] = price;
            data.prices[key][storeId] = price;
        }

        if (Object.keys(priceEntry).length > 1) prices[key] = priceEntry; else delete prices[key];
        if (Object.keys(pickEntry).length > 0) picks[key] = pickEntry; else delete picks[key];
    }

    state.shopping = { ...state.shopping, prices, picks };
    shoppingChanged();
    write(shoppingPath(), data, { merge: true }).catch(() => {});
}

export async function saveSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    emit('settings');
    const data = { updatedAt: new Date().toISOString() };
    if ('apiKey' in patch) data.claudeApiKey = patch.apiKey;
    if ('model' in patch) data.model = patch.model;
    if ('nookUrl' in patch) data.nookUrl = patch.nookUrl;
    if ('nookToken' in patch) data.nookToken = patch.nookToken;
    await write(['users', state.user.uid, 'settings', 'apiKey'], data, { merge: true });
}

export function currentModel() {
    return state.settings.model || DEFAULT_MODEL;
}
