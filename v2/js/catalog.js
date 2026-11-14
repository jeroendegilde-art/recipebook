// Current shelf prices for Albert Heijn and Jumbo, and matching a line on the
// shopping list to a product.
//
// The prices come from Checkjebon.nl: an open, MIT-licensed data file on GitHub
// that is refreshed daily and may be reused. The app downloads that one file
// and never talks to the stores themselves.
//
// The first half of this file is pure and tested. The loader at the bottom
// needs a browser.

import { normalize } from './quantity.js';
import { searchTerm } from './shopping.js';

export const SOURCE = {
    name: 'Checkjebon.nl',
    url: 'https://www.checkjebon.nl/',
    data: 'https://raw.githubusercontent.com/supermarkt/checkjebon/main/data/supermarkets.json',
};

const STORE_IDS = ['ah', 'jumbo'];

// --- Matching ---

/**
 * Rough Dutch stemmer. It does not need to be right, only consistent: "uien"
 * and "ui", "tomaten" and "tomaat", "rode" and "rood" must end up the same.
 */
export function stem(word) {
    let w = word;
    if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1);
    if (w.length > 3 && w.endsWith('en')) w = w.slice(0, -2);
    else if (w.length > 3 && /[^s]s$/.test(w)) w = w.slice(0, -1);
    w = w.replace(/aa|ee|oo|uu/g, pair => pair[0]);
    return w.replace(/([b-df-hj-np-tv-z])\1$/, '$1');
}

// Words in a recipe line that say how much or how it is cut, not what to buy.
const STOP = new Set([
    'blik', 'blikje', 'blikjes', 'blikken', 'pot', 'potje', 'potjes', 'pak', 'pakje', 'pakjes', 'zak', 'zakje', 'zakjes',
    'bos', 'bosje', 'bosjes', 'teen', 'tenen', 'teentje', 'teentjes', 'stuk', 'stuks', 'stukje', 'stukjes',
    'plak', 'plakken', 'plakje', 'plakjes', 'tak', 'takje', 'takjes', 'snuf', 'snufje', 'hand', 'handje', 'handvol',
    'eetlepel', 'eetlepels', 'theelepel', 'theelepels', 'el', 'tl', 'scheut', 'scheutje', 'fles', 'flesje',
    'groot', 'grote', 'klein', 'kleine', 'middelgrote', 'vers', 'verse', 'fijngesneden', 'gesneden', 'gesnipperd',
    'fijngehakt', 'gehakte', 'geperst', 'geschild', 'gewassen', 'ontdooid', 'gekookt', 'gekookte',
    'of', 'en', 'de', 'het', 'een', 'naar', 'smaak', 'in', 'met', 'voor', 'om', 'te', 'ca', 'circa', 'ongeveer', 'eventueel',
]);

const UNIT = /^(?:\d.*|g|gr|gram|kg|kilo|ml|cl|dl|l|liter|st|stuks|x|per)$/;

function words(text) {
    return normalize(text).split(/[^a-z0-9]+/).filter(word => word.length > 1 && !UNIT.test(word));
}

/** The words of a list item that name the product, stemmed. */
export function queryStems(text) {
    const all = words(searchTerm(text));
    const kept = all.filter(word => !STOP.has(word));
    return [...new Set((kept.length ? kept : all).map(stem))];
}

/** Prepare a store's products for searching. raw: [{ n: name, l: link id, p: price, s: size }] */
export function indexProducts(raw, storeId) {
    const list = [];
    for (const item of Array.isArray(raw) ? raw : []) {
        if (!item || typeof item.n !== 'string' || typeof item.l !== 'string' || !(item.p > 0)) continue;
        const stems = words(item.n).map(stem);
        const house = stems[0] === storeId;
        list.push({
            n: item.n, l: item.l, p: item.p, s: typeof item.s === 'string' ? item.s : '',
            w: house ? stems.slice(1) : stems, house,
        });
    }
    return list;
}

// How well does one query word fit a product? Dutch compounds carry their
// meaning at the end ("rundergehakt" is a kind of "gehakt"), so an ending
// counts, a beginning barely ("tomatenblokjes" are not "tomaten").
function fit(stemmed, productWords) {
    let best = 0;
    for (const word of productWords) {
        if (word === stemmed) return 1;
        if (stemmed.length >= 4 && word.endsWith(stemmed)) best = Math.max(best, 0.6);
        else if (stemmed.length >= 4 && word.startsWith(stemmed)) best = Math.max(best, 0.3);
    }
    return best;
}

function rank(products, stems) {
    const hits = [];
    for (const product of products) {
        let score = 0;
        let found = 0;
        let weakest = 1;
        for (const stemmed of stems) {
            const value = fit(stemmed, product.w);
            if (value > 0) found += 1;
            score += value;
            weakest = Math.min(weakest, value);
        }
        if (found === 0) continue;
        hits.push({ product, score, complete: found === stems.length, weakest, extra: Math.max(0, product.w.length - found) });
    }
    // Everything asked for, then the plainest product, then the house brand,
    // then the cheapest. The plain house brand is the fairest thing to compare.
    return hits.sort((a, b) => (b.complete - a.complete) || (b.score - a.score) || (a.extra - b.extra)
        || (b.product.house - a.product.house) || (a.product.p - b.product.p));
}

/** Products for a search box, best first. */
export function search(products, query, limit = 30) {
    const stems = queryStems(query);
    if (stems.length === 0) return [];
    return rank(products, stems).slice(0, limit).map(hit => hit.product);
}

const matchCache = new WeakMap();

/**
 * The product the app picks by itself for a list item, or null when it is not
 * sure. Sure means the product is named exactly like the item, give or take
 * the house brand: "knoflook" is "AH Knoflook". Anything looser goes wrong too
 * often ("bloem" finds an air freshener with flowers), so those are left for
 * you or the AI matcher to choose.
 */
export function bestMatch(products, name) {
    let cache = matchCache.get(products);
    if (!cache) { cache = new Map(); matchCache.set(products, cache); }
    if (cache.has(name)) return cache.get(name);
    const stems = queryStems(name);
    const top = stems.length ? rank(products, stems)[0] : null;
    const result = top && top.complete && top.weakest === 1 && top.extra === 0 ? top.product : null;
    cache.set(name, result);
    return result;
}

const linkCache = new WeakMap();

function byLink(products, link) {
    let map = linkCache.get(products);
    if (!map) { map = new Map(products.map(product => [product.l, product])); linkCache.set(products, map); }
    return map.get(link) || null;
}

/**
 * What an item costs at a store, and why we think so.
 *   'pick'   you chose this product; the price is today's
 *   'manual' you typed the price
 *   'auto'   the app matched a product by itself
 * Returns { price, source, product? } or null when nothing is known.
 * `catalog` may be null (not loaded): then only your own choices count.
 */
export function resolveOffer(item, storeId, shopping, catalog) {
    const products = catalog?.stores?.[storeId]?.products || null;
    const pick = shopping.picks?.[item.key]?.[storeId];
    if (pick) {
        const live = products && byLink(products, pick.l);
        const product = live || pick;
        return { price: product.p, source: 'pick', product: { n: product.n, l: product.l, s: product.s || '', p: product.p } };
    }
    const manual = shopping.prices?.[item.key]?.[storeId];
    if (manual > 0) return { price: manual, source: 'manual' };
    const match = products && bestMatch(products, item.name);
    if (match) return { price: match.p, source: 'auto', product: { n: match.n, l: match.l, s: match.s, p: match.p } };
    return null;
}

/** The page of a product on the store's own site. */
export function productUrl(catalog, storeId, link) {
    const base = catalog?.stores?.[storeId]?.url;
    return base && link ? base + link : null;
}

// --- Loading (browser) ---

const MAX_AGE = 12 * 60 * 60 * 1000;
const CACHE_NAME = 'rb2-prices';
const CACHE_KEY = './prices-cache.json';

let current = null;   // { fetchedAt, stores: { ah: { url, products }, jumbo: {...} } }
let pending = null;

export const getCatalog = () => current;

function build(saved) {
    const stores = {};
    for (const id of STORE_IDS) {
        const entry = saved.stores?.[id];
        stores[id] = { url: typeof entry?.u === 'string' ? entry.u : '', products: indexProducts(entry?.d, id) };
    }
    if (STORE_IDS.every(id => stores[id].products.length === 0)) throw new Error('No prices in the file');
    return { fetchedAt: saved.fetchedAt, stores };
}

async function readSaved() {
    try {
        const cache = await caches.open(CACHE_NAME);
        const response = await cache.match(CACHE_KEY);
        return response ? await response.json() : null;
    } catch { return null; }
}

async function download() {
    const response = await fetch(SOURCE.data, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const all = await response.json();
    const saved = { fetchedAt: Date.now(), stores: {} };
    for (const entry of Array.isArray(all) ? all : []) {
        if (STORE_IDS.includes(entry?.n)) saved.stores[entry.n] = { u: entry.u, d: entry.d };
    }
    const catalog = build(saved);
    try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(CACHE_KEY, new Response(JSON.stringify(saved), { headers: { 'Content-Type': 'application/json' } }));
    } catch { /* no storage: the prices live for this visit only */ }
    return catalog;
}

/**
 * Get the prices: from this visit, from the saved copy when it is younger
 * than half a day, otherwise from the network. When the network fails, an
 * old copy is better than nothing. Rejects only when there is nothing at all.
 */
export function loadCatalog({ force = false } = {}) {
    if (current && !force && Date.now() - current.fetchedAt < MAX_AGE) return Promise.resolve(current);
    if (pending) return pending;
    pending = (async () => {
        let saved = null;
        if (!current) {
            const stored = await readSaved();
            if (stored) { try { saved = build(stored); } catch { saved = null; } }
        }
        const old = current || saved;
        if (old && !force && Date.now() - old.fetchedAt < MAX_AGE) return (current = old);
        try {
            return (current = await download());
        } catch (error) {
            if (old) return (current = old);
            throw error;
        }
    })().finally(() => { pending = null; });
    return pending;
}
