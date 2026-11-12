// Run with: node --test v2/tests/
// The Dutch ingredient lines are deliberate test data: the recipes are partly Dutch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    scaleIngredient, formatQuantity, parseServings, withServings, matchesQuery, ingredientKey, splitIngredient,
} from '../js/quantity.js';

const scale = (text, factor) => scaleIngredient(text, factor);

test('factor 1 leaves the text untouched', () => {
    assert.equal(scale('1,5 dl melk', 1), '1,5 dl melk');
});

test('decimal comma (the v1 bug: 1,5 dl x2 became 2,10 dl)', () => {
    assert.equal(scale('1,5 dl melk', 2), '3 dl melk');
    assert.equal(scale('1,5 dl melk', 0.5), '0,75 dl melk');
    assert.equal(scale('0,5 l bouillon', 3), '1,5 l bouillon');
});

test('decimal dot', () => {
    assert.equal(scale('1.5 kg aardappelen', 2), '3 kg aardappelen');
});

test('weights become numbers, not fractions', () => {
    assert.equal(scale('250 g boter', 0.5), '125 g boter');
    assert.equal(scale('75 g suiker', 0.5), '37.5 g suiker');
    assert.equal(scale('5 g gist', 0.5), '2.5 g gist');
    assert.equal(scale('400 g spaghetti', 3), '1200 g spaghetti');
});

test('pieces and spoons become kitchen fractions', () => {
    assert.equal(scale('1 ui', 0.5), '½ ui');
    assert.equal(scale('3 eieren', 0.5), '1½ eieren');
    assert.equal(scale('2 eetlepels olie', 2), '4 eetlepels olie');
    assert.equal(scale('1 tl zout', 0.5), '½ tl zout');
});

test('fractions and mixed numbers as input', () => {
    assert.equal(scale('½ tl zout', 2), '1 tl zout');
    assert.equal(scale('1/2 bunch parsley', 2), '1 bunch parsley');
    assert.equal(scale('1 1/2 cups pecorino', 2), '3 cups pecorino');
    assert.equal(scale('1½ el honing', 2), '3 el honing');
    assert.equal(scale('¾ cup melk', 2), '1½ cup melk');
});

test('ranges scale on both sides', () => {
    assert.equal(scale('2-3 eieren', 2), '4-6 eieren');
    assert.equal(scale('2 à 3 tenen knoflook', 2), '4 à 6 tenen knoflook');
});

test('metric with the original in parentheses scales both', () => {
    assert.equal(scale('45 g havermout (½ cup)', 2), '90 g havermout (1 cup)');
    assert.equal(scale('1 blik (400 g) tomaten', 2), '2 blik (800 g) tomaten');
});

test('percentages and degrees are not amounts', () => {
    assert.equal(scale('200 ml room 18%', 2), '400 ml room 18%');
    assert.equal(scale('18% room, 2 el', 2), '18% room, 4 el');
    assert.equal(scale('water van 37 °C, 100 ml', 2), 'water van 37 °C, 200 ml');
    assert.equal(scale('water van 37 graden, 100 ml', 2), 'water van 37 graden, 200 ml');
    assert.equal(scale('100 ml water at 37 degrees', 2), '200 ml water at 37 degrees');
});

test('size per piece stays fixed', () => {
    assert.equal(scale('2 x 400 g blik tomaten', 2), '4 x 400 g blik tomaten');
    assert.equal(scale('1 blik à 400 g kikkererwten', 2), '2 blik à 400 g kikkererwten');
    assert.equal(scale('1 stuk gember van 3 cm', 2), '2 stuk gember van 3 cm');
});

test('English "of" after a container keeps the size per piece fixed', () => {
    assert.equal(scale('1 can of 400 g tomatoes', 2), '2 can of 400 g tomatoes');
    assert.equal(scale('2 jars of 350 ml passata', 0.5), '1 jars of 350 ml passata');
});

test('Dutch "of" means "or" and still scales', () => {
    assert.equal(scale('250 g boter of 200 g margarine', 2), '500 g boter of 400 g margarine');
});

test('English unit words count as metric', () => {
    assert.equal(scale('75 grams sugar', 0.5), '37.5 grams sugar');
    assert.equal(scale('1 litre stock', 0.25), '0.25 litre stock');
    assert.equal(scale('3 kilograms potatoes', 0.5), '1.5 kilograms potatoes');
});

test('a line written with a dot stays a dot', () => {
    assert.equal(scale('1.5 dl milk', 0.5), '0.75 dl milk');
    assert.equal(scale('0.5 l stock', 3), '1.5 l stock');
    assert.equal(scale('5 g yeast', 0.5), '2.5 g yeast');
});

test('a line written with a comma stays a comma', () => {
    assert.equal(scale('1,5 dl melk', 0.5), '0,75 dl melk');
    // The comma may be on another number in the same line.
    assert.equal(scale('5 g gist (of 2,5 g droge gist)', 0.5), '2,5 g gist (of 1,25 g droge gist)');
    assert.equal(formatQuantity(2.5, { metric: true, comma: true }), '2,5');
    assert.equal(formatQuantity(2.5, { metric: true }), '2.5');
});

test('codes and type numbers stay fixed', () => {
    assert.equal(scale('500 g bloem type 00', 2), '1000 g bloem type 00');
    assert.equal(scale('250 g T65 bloem', 2), '500 g T65 bloem');
});

test('lines without a number stay the same', () => {
    assert.equal(scale('zout naar smaak', 3), 'zout naar smaak');
    assert.equal(scale('', 2), '');
    assert.equal(scale(undefined, 2), '');
});

test('division by zero in a fraction does not crash', () => {
    assert.equal(scale('1/0 iets', 2), '1/0 iets');
});

test('formatQuantity rounds almost-whole numbers', () => {
    assert.equal(formatQuantity(1.999), '2');
    assert.equal(formatQuantity(0.3333), '⅓');
    assert.equal(formatQuantity(2.6667), '2⅔');
    assert.equal(formatQuantity(0), '0');
});

test('reading and writing back servings', () => {
    assert.equal(parseServings('4 servings'), 4);
    assert.equal(parseServings('Makes 12 cookies'), 12);
    assert.equal(parseServings('a big pot'), null);
    assert.equal(parseServings(''), null);
    assert.equal(withServings('4 servings', 6), '6 servings');
    // Dutch servings text works the same way.
    assert.equal(parseServings('4 personen'), 4);
    assert.equal(withServings('4 personen', 6), '6 personen');
});

test('search also looks in ingredients and ignores accents', () => {
    const recipe = { title: 'Spaghetti Carbonara', ingredients: ['150 g guanciale', 'crème fraîche'], notes: 'Geen room.' };
    assert.equal(matchesQuery(recipe, 'guanciale'), true);
    assert.equal(matchesQuery(recipe, 'creme'), true);
    assert.equal(matchesQuery(recipe, 'carbonara guanciale'), true);
    assert.equal(matchesQuery(recipe, 'carbonara kip'), false);
    assert.equal(matchesQuery(recipe, '   '), true);
    assert.equal(matchesQuery({ title: 'Kapot recept' }, 'kapot'), true);
});

test('a check belongs to the ingredient, not to the position', () => {
    assert.equal(ingredientKey('  250 g  Boter '), ingredientKey('250 g boter'));
    assert.notEqual(ingredientKey('250 g boter'), ingredientKey('250 g bloem'));
});

test('splitIngredient separates the amount from the ingredient', () => {
    assert.deepEqual(splitIngredient('400 g spaghetti'), { amount: '400 g', name: 'spaghetti' });
    assert.deepEqual(splitIngredient('400g spaghetti'), { amount: '400g', name: 'spaghetti' });
    assert.deepEqual(splitIngredient('4 egg yolks'), { amount: '4', name: 'egg yolks' });
    assert.deepEqual(splitIngredient('1,5 dl room'), { amount: '1,5 dl', name: 'room' });
    assert.deepEqual(splitIngredient('1½ el honing'), { amount: '1½ el', name: 'honing' });
    assert.deepEqual(splitIngredient('½ bos peterselie'), { amount: '½', name: 'bos peterselie' });
    assert.deepEqual(splitIngredient('2-3 eieren'), { amount: '2-3', name: 'eieren' });
    assert.deepEqual(splitIngredient('2 à 3 tenen knoflook'), { amount: '2 à 3', name: 'tenen knoflook' });
    assert.deepEqual(splitIngredient('1 1/2 cups pecorino'), { amount: '1 1/2 cups', name: 'pecorino' });
});

test('splitIngredient does not mistake a word for a unit', () => {
    assert.deepEqual(splitIngredient('2 leeks'), { amount: '2', name: 'leeks' });
    assert.deepEqual(splitIngredient('3 grote uien'), { amount: '3', name: 'grote uien' });
    assert.deepEqual(splitIngredient('1 liter melk'), { amount: '1 liter', name: 'melk' });
});

test('splitIngredient leaves lines without a leading amount alone', () => {
    assert.deepEqual(splitIngredient('zout naar smaak'), { amount: '', name: 'zout naar smaak' });
    assert.deepEqual(splitIngredient('18% room'), { amount: '', name: '18% room' });
    assert.deepEqual(splitIngredient('250'), { amount: '', name: '250' });
    assert.deepEqual(splitIngredient(undefined), { amount: '', name: '' });
});
