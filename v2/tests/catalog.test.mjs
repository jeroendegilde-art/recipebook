import test from 'node:test';
import assert from 'node:assert/strict';
import { stem, queryStems, indexProducts, search, bestMatch, resolveOffer, productUrl } from '../js/catalog.js';
import { buildPrompt, parseAnswer, buildTranslatePrompt, parseTranslations } from '../js/aimatch.js';

const AH = indexProducts([
    { n: 'AH Knoflook', l: 'wi1/knoflook', p: 1.29, s: '2 stuks' },
    { n: 'AH Luchtverfrisser bloemen', l: 'wi2/lucht', p: 0.85, s: '250 ml' },
    { n: 'AH Tarwebloem', l: 'wi3/tarwebloem', p: 0.99, s: '1 kg' },
    { n: 'AH Halfvolle melk', l: 'wi4/melk-1l', p: 1.19, s: '1 l' },
    { n: 'AH Biologisch Halfvolle melk', l: 'wi5/bio-melk', p: 1.39, s: '1 l' },
    { n: 'AH Rundergehakt', l: 'wi6/gehakt', p: 3.19, s: '300 g' },
    { n: 'AH Rode uien', l: 'wi7/rode-uien', p: 1.09, s: '500 g' },
    { n: 'Broken', l: 'x', p: 0 },
    null,
], 'ah');

test('stem makes singular, plural and inflected forms meet', () => {
    assert.equal(stem('uien'), stem('ui'));
    assert.equal(stem('tomaten'), stem('tomaat'));
    assert.equal(stem('rode'), stem('rood'));
    assert.equal(stem('aardappelen'), stem('aardappels'));
});

test('queryStems drops amounts, packaging and prep words', () => {
    assert.deepEqual(queryStems('tenen knoflook, geperst'), [stem('knoflook')]);
    assert.deepEqual(queryStems('blik tomatenblokjes (400 g)'), [stem('tomatenblokjes')]);
    assert.deepEqual(queryStems('blik'), [stem('blik')]); // nothing else left: keep it
});

test('indexProducts skips broken entries and sets the house brand aside', () => {
    assert.equal(AH.length, 7);
    assert.equal(AH[0].house, true);
    assert.deepEqual(AH[0].w, [stem('knoflook')]);
});

test('bestMatch only answers when the name fits exactly', () => {
    assert.equal(bestMatch(AH, 'tenen knoflook').l, 'wi1/knoflook');
    assert.equal(bestMatch(AH, 'halfvolle melk').l, 'wi4/melk-1l');     // plain before organic
    assert.equal(bestMatch(AH, 'bloem'), null);                         // not the air freshener, not a guess
    assert.equal(bestMatch(AH, 'uien'), null);                          // "rode uien" is more than was asked
    assert.equal(bestMatch(AH, 'melk'), null);
    assert.equal(bestMatch(AH, 'onions'), null);
});

test('search is looser and ranks the closest first', () => {
    assert.deepEqual(search(AH, 'melk').map(p => p.l), ['wi4/melk-1l', 'wi5/bio-melk']);
    assert.equal(search(AH, 'gehakt')[0].l, 'wi6/gehakt');               // compound: ends in the word
    assert.ok(search(AH, 'bloem').some(p => p.l === 'wi3/tarwebloem'));
    assert.deepEqual(search(AH, ''), []);
});

test('resolveOffer: your product, then your price, then an exact match', () => {
    const catalog = { stores: { ah: { url: 'https://www.ah.nl/producten/product/', products: AH } } };
    const item = { key: 'knoflook', name: 'tenen knoflook' };
    const none = { picks: {}, prices: {} };

    assert.deepEqual(resolveOffer(item, 'ah', none, catalog),
        { price: 1.29, source: 'auto', product: { n: 'AH Knoflook', l: 'wi1/knoflook', s: '2 stuks', p: 1.29 } });
    assert.deepEqual(resolveOffer(item, 'ah', { picks: {}, prices: { knoflook: { ah: 2 } } }, catalog),
        { price: 2, source: 'manual' });

    // A pick wins, and gets today's price instead of the one it was saved with.
    const picked = { picks: { knoflook: { ah: { l: 'wi7/rode-uien', n: 'AH Rode uien', s: '500 g', p: 0.5 } } }, prices: { knoflook: { ah: 2 } } };
    assert.equal(resolveOffer(item, 'ah', picked, catalog).price, 1.09);
    assert.equal(resolveOffer(item, 'ah', picked, catalog).source, 'pick');
    // Without the catalog the saved price stands in.
    assert.equal(resolveOffer(item, 'ah', picked, null).price, 0.5);

    assert.equal(resolveOffer(item, 'ah', none, null), null);
    assert.equal(resolveOffer(item, 'jumbo', none, catalog), null);
    assert.equal(productUrl(catalog, 'ah', 'wi1/knoflook'), 'https://www.ah.nl/producten/product/wi1/knoflook');
    assert.equal(productUrl(null, 'ah', 'wi1/knoflook'), null);
});

test('an English item is looked up under its Dutch name', () => {
    const catalog = { stores: { ah: { url: '', products: AH } } };
    const item = { key: 'garlic', name: 'cloves garlic, minced' };
    assert.equal(resolveOffer(item, 'ah', { picks: {}, prices: {}, terms: {} }, catalog), null);
    const offer = resolveOffer(item, 'ah', { picks: {}, prices: {}, terms: { garlic: 'knoflook' } }, catalog);
    assert.equal(offer.source, 'auto');
    assert.equal(offer.product.l, 'wi1/knoflook');
});

test('translations: only usable Dutch terms come back', () => {
    const items = [{ id: 'i0', text: '2 cloves garlic' }, { id: 'i1', text: 'water' }, { id: 'i2', text: 'plain flour' }];
    assert.match(buildTranslatePrompt(items), /i0 \| 2 cloves garlic/);
    assert.deepEqual(parseTranslations('{"i0": " Knoflook ", "i1": null, "i2": 5, "i9": "x"}', items), { i0: 'knoflook' });
    assert.throws(() => parseTranslations('sorry', items));
});

test('the AI may only choose from the candidates it was given', () => {
    const tasks = [
        { id: 't0', item: '500 g bloem', store: 'Albert Heijn', candidates: [AH[1], AH[2]] },
        { id: 't1', item: 'uien', store: 'Albert Heijn', candidates: [AH[6]] },
        { id: 't2', item: 'x', store: 'Jumbo', candidates: [AH[0]] },
    ];
    const prompt = buildPrompt(tasks);
    assert.match(prompt, /t0 \| Albert Heijn \| on the list: "500 g bloem"/);
    assert.match(prompt, /  1: AH Tarwebloem \(1 kg\), €0\.99/);

    const chosen = parseAnswer('Here you go:\n{"t0": 1, "t1": null, "t2": 7, "t9": 0}', tasks);
    assert.deepEqual(Object.keys(chosen), ['t0']);
    assert.equal(chosen.t0.l, 'wi3/tarwebloem');
    assert.throws(() => parseAnswer('no json here', tasks));
});
