// The shopping list: parsing items, merging amounts, prices and the comparison
// between the two stores. Pure functions, no DOM. Tested in tests/.

import { splitIngredient, normalize } from './quantity.js';

// The app does not talk to the stores. It only builds a search link, which
// opens the store's own site where you sign in, fill the basket and pay.
export const STORES = [
    {
        id: 'ah', name: 'Albert Heijn', short: 'AH', site: 'ah.nl',
        searchUrl: query => `https://www.ah.nl/zoeken?query=${encodeURIComponent(query)}`,
    },
    {
        id: 'jumbo', name: 'Jumbo', short: 'Jumbo', site: 'jumbo.com',
        searchUrl: query => `https://www.jumbo.com/producten/?searchTerms=${encodeURIComponent(query)}`,
    },
];

export const getStore = id => STORES.find(store => store.id === id) || null;

/**
 * What a price is remembered under. "Uien, gesnipperd" and "uien (grote)"
 * are the same product on the shelf, so both become "uien".
 */
export function productKey(name) {
    const clean = text => normalize(text).replace(/[.~*/[\]_()]/g, ' ').replace(/\s+/g, ' ').trim();
    const full = String(name ?? '');
    return clean(full.replace(/\([^)]*\)/g, ' ').split(',')[0]) || clean(full);
}

/** What to type in a store's search box: the product, without the prep note. */
export function searchTerm(name) {
    const full = String(name ?? '');
    const term = full.replace(/\([^)]*\)/g, ' ').split(',')[0].replace(/\s+/g, ' ').trim();
    return term || full.trim();
}

/** "2 l milk" -> { text, amount: "2 l", name: "milk", key: "milk" } */
export function parseItem(text) {
    const line = String(text ?? '').replace(/\s+/g, ' ').trim();
    const { amount, name } = splitIngredient(line);
    return { text: line, amount, name, key: productKey(name) };
}

const SIMPLE_AMOUNT = /^(\d+(?:[.,]\d+)?)\s*(.*)$/;

/**
 * Add two amounts of the same product. Same unit: one sum ("200 g" + "300 g"
 * -> "500 g"). Anything else stays readable side by side ("2 + 1 bunch").
 */
export function mergeAmounts(a, b) {
    const first = String(a ?? '').trim();
    const second = String(b ?? '').trim();
    if (!first || !second) return first || second;

    const ma = SIMPLE_AMOUNT.exec(first);
    const mb = SIMPLE_AMOUNT.exec(second);
    if (ma && mb && ma[2].toLowerCase() === mb[2].toLowerCase()) {
        const sum = Number(ma[1].replace(',', '.')) + Number(mb[1].replace(',', '.'));
        let number = String(Math.round(sum * 100) / 100);
        if (/,/.test(ma[1] + mb[1])) number = number.replace('.', ',');
        return ma[2] ? `${number} ${ma[2]}` : number;
    }
    return `${first} + ${second}`;
}

// --- How many packs does an amount take? ---

const MEASURE = /(\d+(?:[.,]\d+)?)\s*(kg|kilo|gram|gr|g|ml|cl|dl|liter|l|stuks|stuk|st)(?![a-z])/i;
const FACTOR = { kg: ['g', 1000], kilo: ['g', 1000], gram: ['g', 1], gr: ['g', 1], g: ['g', 1],
    ml: ['ml', 1], cl: ['ml', 10], dl: ['ml', 100], liter: ['ml', 1000], l: ['ml', 1000],
    stuks: ['st', 1], stuk: ['st', 1], st: ['st', 1] };

/**
 * "175 g", "0,5 l", "6 x 1 L", "ca. 100 g", "per stuk" -> { qty, unit } with
 * unit 'g', 'ml' or 'st'. null when the text holds no measure.
 */
export function parseMeasure(text) {
    const line = String(text ?? '').toLowerCase();
    const match = MEASURE.exec(line);
    if (!match) return /\bper stuk\b/.test(line) ? { qty: 1, unit: 'st' } : null;
    const [unit, factor] = FACTOR[match[2]];
    const times = /(\d+)\s*[x×]\s*$/.exec(line.slice(0, match.index));
    const qty = Number(match[1].replace(',', '.')) * factor * (times ? Number(times[1]) : 1);
    return qty > 0 ? { qty, unit } : null;
}

// "2 blikken tomaten": the number counts packs, whatever a pack weighs.
const PACK_WORD = /^(?:blik(?:je|jes|ken)?|pak(?:je|jes|ken)?|pot(?:je|jes|ten)?|zak(?:je|jes|ken)?|fles(?:je|jes|sen)?|doos(?:je)?|dozen|bak(?:je|jes|ken)?|rol(?:len)?|tube|kuipje|beker|cans?|tins?|jars?|bottles?|packs?|packets?|packages?|bags?|box(?:es)?|cartons?|tubs?)\b/i;

// "4 tenen knoflook": the number counts parts of one product, not products.
const PART_WORD = /^(?:te(?:en|nen)|teentjes?|plak(?:ken|jes?)?|tak(?:ken|jes?)?|blaadjes?|bladeren|stengels?|snuf(?:jes?)?|scheut(?:jes?)?|cloves?|slices?|sprigs?|leaf|leaves|stalks?|pinch(?:es)?|dash(?:es)?|handfuls?)\b/i;

/**
 * Packs of `product` needed for the amount on the list. Without this a 175 g
 * pack looks cheaper than a 300 g pack when you need 500 g of it.
 * Returns 1 when the amount and the pack cannot be compared (5 onions against
 * a net of 1 kg): then one pack is the honest guess.
 */
export function packsNeeded(item, product) {
    const amount = String(item.amount ?? '').trim();
    if (!amount) return 1;
    const need = parseMeasure(amount) || (/^\d+(?:[.,]\d+)?$/.test(amount)
        ? { qty: Number(amount.replace(',', '.')), unit: 'st' } : null);
    if (!need) return 1;
    if (need.unit === 'st' && PART_WORD.test(item.name)) return 1;
    if (need.unit === 'st' && PACK_WORD.test(item.name)) return Math.min(99, Math.max(1, Math.ceil(need.qty)));
    const pack = parseMeasure(product?.s) || parseMeasure(product?.n);
    if (!pack || pack.unit !== need.unit) return 1;
    return Math.min(99, Math.max(1, Math.ceil(need.qty / pack.qty - 1e-9)));
}

/** "1,99", "€ 1.99", "2" -> a number of euros. Anything else -> null. */
export function parsePrice(text) {
    const match = /^(\d{1,4})(?:[.,](\d{1,2}))?$/.exec(String(text ?? '').replace(/[€\s]/g, ''));
    if (!match) return null;
    const value = Number(`${match[1]}.${match[2] || '0'}`);
    return value > 0 ? value : null;
}

export const formatAmount = value => value.toFixed(2);
export const formatPrice = value => `€${formatAmount(value)}`;

const cents = value => Math.round(value * 100) / 100;
const isPrice = value => typeof value === 'number' && value > 0;

/**
 * Compare the stores over the items you still have to get.
 *
 * A total over a half-priced list says nothing: the store with fewer prices
 * filled in would look cheaper. So the verdict (`cheapest`, `saving`) only
 * counts items priced at both stores. Per-store totals are reported next to
 * the number of items they miss.
 */
export function compare(items, prices) {
    const open = items.filter(item => !item.checked);
    const stores = Object.fromEntries(STORES.map(store => [store.id, { total: 0, priced: 0, missing: 0 }]));
    const both = { count: 0, split: 0, ...Object.fromEntries(STORES.map(store => [store.id, 0])) };

    for (const item of open) {
        const count = item.count > 0 ? item.count : 1;
        const known = prices[item.key] || {};
        const lines = STORES.map(store => (isPrice(known[store.id]) ? known[store.id] * count : null));

        STORES.forEach((store, i) => {
            if (lines[i] === null) { stores[store.id].missing += 1; return; }
            stores[store.id].total += lines[i];
            stores[store.id].priced += 1;
        });
        if (lines.every(line => line !== null)) {
            both.count += 1;
            both.split += Math.min(...lines);
            STORES.forEach((store, i) => { both[store.id] += lines[i]; });
        }
    }

    STORES.forEach(store => {
        stores[store.id].total = cents(stores[store.id].total);
        both[store.id] = cents(both[store.id]);
    });
    both.split = cents(both.split);

    const ranked = STORES.map(store => store.id).sort((a, b) => both[a] - both[b]);
    const saving = cents(both[ranked[ranked.length - 1]] - both[ranked[0]]);
    const cheapest = both.count > 0 && saving > 0 ? ranked[0] : null;

    return {
        count: open.length,
        stores,
        both,
        cheapest,
        saving,
        // What you save on top by buying each item where it is cheapest.
        splitSaving: both.count > 0 ? cents(both[ranked[0]] - both.split) : 0,
    };
}

/** Which store is cheaper for this one product? null when unknown or equal. */
export function cheaperStore(known) {
    if (!known || !STORES.every(store => isPrice(known[store.id]))) return null;
    const ranked = STORES.slice().sort((a, b) => known[a.id] - known[b.id]);
    return known[ranked[0].id] < known[ranked[1].id] ? ranked[0].id : null;
}

/** The list as plain text, to paste somewhere else. */
export function listAsText(items) {
    return items.filter(item => !item.checked)
        .map(item => `${item.count > 1 ? `${item.count}x ` : ''}${item.text}`)
        .join('\n');
}
