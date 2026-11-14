import test from 'node:test';
import assert from 'node:assert/strict';
import {
    productKey, searchTerm, parseItem, mergeAmounts, parsePrice, formatPrice, compare, cheaperStore, listAsText,
} from '../js/shopping.js';

test('productKey drops preparation notes and accents', () => {
    assert.equal(productKey('Uien, gesnipperd'), 'uien');
    assert.equal(productKey('crème fraîche (125 g)'), 'creme fraiche');
    assert.equal(productKey('  Halfvolle   melk '), 'halfvolle melk');
    assert.equal(productKey('(optional)'), 'optional');
});

test('searchTerm keeps the product as written, without the prep note', () => {
    assert.equal(searchTerm('Uien, gesnipperd'), 'Uien');
    assert.equal(searchTerm('crème fraîche (125 g)'), 'crème fraîche');
    assert.equal(searchTerm('(optional)'), '(optional)');
});

test('parseItem splits amount and name', () => {
    assert.deepEqual(parseItem(' 2 l  milk '), { text: '2 l milk', amount: '2 l', name: 'milk', key: 'milk' });
    assert.deepEqual(parseItem('bread'), { text: 'bread', amount: '', name: 'bread', key: 'bread' });
});

test('mergeAmounts sums equal units and keeps the rest readable', () => {
    assert.equal(mergeAmounts('200 g', '300 g'), '500 g');
    assert.equal(mergeAmounts('1,5 l', '0,5 L'), '2 l');
    assert.equal(mergeAmounts('1', '2'), '3');
    assert.equal(mergeAmounts('2', '1 bunch'), '2 + 1 bunch');
    assert.equal(mergeAmounts('', '2 l'), '2 l');
    assert.equal(mergeAmounts('', ''), '');
});

test('parsePrice accepts comma and dot, rejects the rest', () => {
    assert.equal(parsePrice('1,99'), 1.99);
    assert.equal(parsePrice('€ 2.5'), 2.5);
    assert.equal(parsePrice('3'), 3);
    assert.equal(parsePrice('0'), null);
    assert.equal(parsePrice('abc'), null);
    assert.equal(parsePrice('1,999'), null);
    assert.equal(parsePrice(''), null);
    assert.equal(formatPrice(2.5), '€2.50');
});

const item = (key, extra = {}) => ({ id: key, text: key, name: key, key, count: 1, checked: false, ...extra });

test('compare only judges items priced at both stores', () => {
    const items = [item('milk'), item('bread', { count: 2 }), item('eggs'), item('salt', { checked: true })];
    const prices = {
        milk: { ah: 1.29, jumbo: 1.19 },
        bread: { ah: 2.0, jumbo: 2.4 },
        eggs: { ah: 3.0 },             // Jumbo unknown: must not make Jumbo look cheaper
        salt: { ah: 9, jumbo: 1 },     // already in the cart: ignored
    };
    const result = compare(items, prices);
    assert.equal(result.count, 3);
    assert.deepEqual(result.stores.ah, { total: 8.29, priced: 3, missing: 0 });
    assert.deepEqual(result.stores.jumbo, { total: 5.99, priced: 2, missing: 1 });
    assert.equal(result.both.count, 2);
    assert.equal(result.both.ah, 5.29);
    assert.equal(result.both.jumbo, 5.99);
    assert.equal(result.cheapest, 'ah');
    assert.equal(result.saving, 0.7);
    assert.equal(result.both.split, 5.19);
    assert.equal(result.splitSaving, 0.1);
});

test('compare has no verdict without overlap or with a tie', () => {
    assert.equal(compare([item('milk')], { milk: { ah: 1 } }).cheapest, null);
    assert.equal(compare([item('milk')], { milk: { ah: 1, jumbo: 1 } }).cheapest, null);
    assert.equal(compare([], {}).count, 0);
});

test('cheaperStore', () => {
    assert.equal(cheaperStore({ ah: 1, jumbo: 2 }), 'ah');
    assert.equal(cheaperStore({ ah: 2, jumbo: 1 }), 'jumbo');
    assert.equal(cheaperStore({ ah: 1, jumbo: 1 }), null);
    assert.equal(cheaperStore({ ah: 1 }), null);
    assert.equal(cheaperStore(undefined), null);
});

test('listAsText skips what is already in the cart', () => {
    const items = [item('2 l milk'), item('bread', { count: 2 }), item('salt', { checked: true })];
    assert.equal(listAsText(items), '2 l milk\n2x bread');
});
