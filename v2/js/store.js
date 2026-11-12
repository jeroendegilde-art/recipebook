// Eén bron van waarheid voor recepten, collecties en instellingen.
// Schermen lezen `state` en luisteren met on(). Ze schrijven alleen via de
// functies hieronder. Dataformaat is gelijk aan v1.

import { backend } from './firebase.js';

export const state = {
    user: null,
    authReady: false,
    recipes: [],
    folders: [],
    settings: { apiKey: '', model: '', nookUrl: '', nookToken: '' },
    sync: 'connecting', // 'connecting' | 'synced' | 'offline' | 'error'
    loaded: false,      // true zodra recepten uit cache of cloud binnen zijn
};

// Fallback zolang de lijst met modellen nog niet is opgehaald of geen keuze is gemaakt.
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
        try { fn(payload); } catch (error) { console.error(`Fout in luisteraar voor "${topic}"`, error); }
    });
}

// --- Normalisatie: wat er ook in de database staat, de app krijgt een heel recept. ---

const asText = value => (typeof value === 'string' ? value : value == null ? '' : String(value));
const asLines = value => (Array.isArray(value) ? value.map(asText).map(s => s.trim()).filter(Boolean) : []);

export function normalizeRecipe(raw) {
    return {
        ...raw,
        id: asText(raw.id),
        title: asText(raw.title).trim() || 'Naamloos recept',
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
    return { ...raw, id: asText(raw.id), name: asText(raw.name).trim() || 'Naamloos', createdAt: asText(raw.createdAt) };
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

// --- Lokale kopie, zodat de app direct iets toont en offline leesbaar blijft. ---

const cacheKey = uid => `rb2:cache:${uid}`;

function readCache(uid) {
    try { return JSON.parse(localStorage.getItem(cacheKey(uid)) || 'null'); } catch { return null; }
}

function writeCache() {
    if (!state.user) return;
    try {
        localStorage.setItem(cacheKey(state.user.uid), JSON.stringify({ recipes: state.recipes, folders: state.folders }));
    } catch { /* opslag vol of geblokkeerd: de app werkt door zonder cache */ }
}

function setSync(value) {
    if (state.sync === value) return;
    state.sync = value;
    emit('sync', value);
}

// --- Aanmelden en luisteren ---

export function init() {
    backend.onAuth(user => {
        stopListening();
        state.user = user;
        state.authReady = true;

        if (!user) {
            state.recipes = [];
            state.folders = [];
            state.settings = { apiKey: '', model: '', nookUrl: '', nookToken: '' };
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
        emit('auth', user);
        startListening(user.uid);
    });

    window.addEventListener('online', () => { if (state.sync === 'offline') setSync('connecting'); });
    window.addEventListener('offline', () => setSync('offline'));
}

function startListening(uid) {
    setSync(navigator.onLine ? 'connecting' : 'offline');
    const failed = error => { console.error('Sync-fout', error); setSync('error'); };

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

        // v1 bewaart alle instellingen in één document met deze naam.
        backend.watchDoc(['users', uid, 'settings', 'apiKey'], data => {
            state.settings = {
                apiKey: asText(data?.claudeApiKey),
                model: asText(data?.model),
                nookUrl: asText(data?.nookUrl),
                nookToken: asText(data?.nookToken),
            };
            emit('settings');
        }, error => console.error('Instellingen laden mislukt', error)),
    ];
}

function stopListening() {
    unsubscribers.forEach(stop => { try { stop(); } catch { /* al gestopt */ } });
    unsubscribers = [];
}

export const signIn = () => backend.signIn();
export const signOut = () => backend.signOut();

// --- Schrijven. Eerst lokaal (direct zichtbaar), dan naar de cloud. ---

function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function withoutUndefined(object) {
    return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

async function write(path, data, options) {
    if (!state.user) throw new Error('Niet aangemeld');
    try {
        await backend.set(path, withoutUndefined(data), options);
    } catch (error) {
        console.error('Opslaan mislukt', error);
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

/** Past alleen de meegegeven velden aan. Andere velden in de cloud blijven staan. */
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

/** Verwijdert en geeft een functie terug waarmee het ongedaan kan. */
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

/** Voegt recepten uit een back-up toe. Bestaande recepten (zelfde id) blijven ongemoeid. */
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

/** Verwijdert de collectie. De recepten erin blijven bestaan, zonder collectie. */
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
