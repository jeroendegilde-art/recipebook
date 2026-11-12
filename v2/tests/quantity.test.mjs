// Draaien met: node --test v2/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    scaleIngredient, formatQuantity, parseServings, withServings, matchesQuery, ingredientKey,
} from '../js/quantity.js';

const scale = (text, factor) => scaleIngredient(text, factor);

test('factor 1 laat de tekst ongemoeid', () => {
    assert.equal(scale('1,5 dl melk', 1), '1,5 dl melk');
});

test('decimale komma (de bug uit v1: 1,5 dl x2 werd 2,10 dl)', () => {
    assert.equal(scale('1,5 dl melk', 2), '3 dl melk');
    assert.equal(scale('1,5 dl melk', 0.5), '0,75 dl melk');
    assert.equal(scale('0,5 l bouillon', 3), '1,5 l bouillon');
});

test('decimale punt', () => {
    assert.equal(scale('1.5 kg aardappelen', 2), '3 kg aardappelen');
});

test('gewichten worden getallen, geen breuken', () => {
    assert.equal(scale('250 g boter', 0.5), '125 g boter');
    assert.equal(scale('75 g suiker', 0.5), '37,5 g suiker');
    assert.equal(scale('5 g gist', 0.5), '2,5 g gist');
    assert.equal(scale('400 g spaghetti', 3), '1200 g spaghetti');
});

test('stuks en lepels worden keukenbreuken', () => {
    assert.equal(scale('1 ui', 0.5), '½ ui');
    assert.equal(scale('3 eieren', 0.5), '1½ eieren');
    assert.equal(scale('2 eetlepels olie', 2), '4 eetlepels olie');
    assert.equal(scale('1 tl zout', 0.5), '½ tl zout');
});

test('breuken en gemengde getallen als invoer', () => {
    assert.equal(scale('½ tl zout', 2), '1 tl zout');
    assert.equal(scale('1/2 bunch parsley', 2), '1 bunch parsley');
    assert.equal(scale('1 1/2 cups pecorino', 2), '3 cups pecorino');
    assert.equal(scale('1½ el honing', 2), '3 el honing');
    assert.equal(scale('¾ cup melk', 2), '1½ cup melk');
});

test('bereiken schalen aan beide kanten', () => {
    assert.equal(scale('2-3 eieren', 2), '4-6 eieren');
    assert.equal(scale('2 à 3 tenen knoflook', 2), '4 à 6 tenen knoflook');
});

test('metrisch met origineel tussen haakjes schaalt allebei', () => {
    assert.equal(scale('45 g havermout (½ cup)', 2), '90 g havermout (1 cup)');
    assert.equal(scale('1 blik (400 g) tomaten', 2), '2 blik (800 g) tomaten');
});

test('percentages en graden zijn geen hoeveelheden', () => {
    assert.equal(scale('200 ml room 18%', 2), '400 ml room 18%');
    assert.equal(scale('18% room, 2 el', 2), '18% room, 4 el');
    assert.equal(scale('water van 37 °C, 100 ml', 2), 'water van 37 °C, 200 ml');
});

test('maat per stuk blijft staan', () => {
    assert.equal(scale('2 x 400 g blik tomaten', 2), '4 x 400 g blik tomaten');
    assert.equal(scale('1 blik à 400 g kikkererwten', 2), '2 blik à 400 g kikkererwten');
    assert.equal(scale('1 stuk gember van 3 cm', 2), '2 stuk gember van 3 cm');
});

test('codes en typenummers blijven staan', () => {
    assert.equal(scale('500 g bloem type 00', 2), '1000 g bloem type 00');
    assert.equal(scale('250 g T65 bloem', 2), '500 g T65 bloem');
});

test('regels zonder getal blijven gelijk', () => {
    assert.equal(scale('zout naar smaak', 3), 'zout naar smaak');
    assert.equal(scale('', 2), '');
    assert.equal(scale(undefined, 2), '');
});

test('delen door nul in een breuk crasht niet', () => {
    assert.equal(scale('1/0 iets', 2), '1/0 iets');
});

test('formatQuantity rondt net-niet-hele getallen af', () => {
    assert.equal(formatQuantity(1.999), '2');
    assert.equal(formatQuantity(0.3333), '⅓');
    assert.equal(formatQuantity(2.6667), '2⅔');
    assert.equal(formatQuantity(0), '0');
});

test('porties lezen en terugschrijven', () => {
    assert.equal(parseServings('4 personen'), 4);
    assert.equal(parseServings('Voor 12 koekjes'), 12);
    assert.equal(parseServings('een flinke pan'), null);
    assert.equal(parseServings(''), null);
    assert.equal(withServings('4 personen', 6), '6 personen');
});

test('zoeken kijkt ook in ingrediënten en negeert accenten', () => {
    const recipe = { title: 'Spaghetti Carbonara', ingredients: ['150 g guanciale', 'crème fraîche'], notes: 'Geen room.' };
    assert.equal(matchesQuery(recipe, 'guanciale'), true);
    assert.equal(matchesQuery(recipe, 'creme'), true);
    assert.equal(matchesQuery(recipe, 'carbonara guanciale'), true);
    assert.equal(matchesQuery(recipe, 'carbonara kip'), false);
    assert.equal(matchesQuery(recipe, '   '), true);
    assert.equal(matchesQuery({ title: 'Kapot recept' }, 'kapot'), true);
});

test('vinkje hangt aan het ingrediënt, niet aan de positie', () => {
    assert.equal(ingredientKey('  250 g  Boter '), ingredientKey('250 g boter'));
    assert.notEqual(ingredientKey('250 g boter'), ingredientKey('250 g bloem'));
});
