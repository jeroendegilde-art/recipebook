// Scaling quantities and searching. Pure functions, no DOM. Tested in tests/.

const UNICODE_FRACTIONS = {
    '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4,
    '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5, '⅘': 4 / 5, '⅙': 1 / 6, '⅚': 5 / 6,
    '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8,
};
const FRAC_CHARS = Object.keys(UNICODE_FRACTIONS).join('');

// Fractions we dare to write back. Only the common kitchen fractions.
const NICE_FRACTIONS = [
    [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'],
];

// Units you weigh or measure: these take a decimal number, not a fraction.
// Dutch and English spellings.
const METRIC_UNIT = /^\s*(?:g|gr|gram|grams|kg|kilo|kilogram|kilograms|mg|ml|milliliter|millilitre|cl|dl|l|liter|liters|litre|litres|cm|mm)\b/i;

// English containers that take a size per piece after "of": "1 can of 400 g".
// Kept to a fixed list because Dutch "of" means "or" ("boter of 100 g margarine").
const CONTAINER_OF = /\b(?:cans?|tins?|jars?|packs?|packets?|packages?|bottles?|bags?|box(?:es)?|cartons?|tubs?|tubes?|blocks?|sticks?|pieces?)\s+of\s+$/i;

// One number in an ingredient line. Order matters: longest form first.
const NUMBER = new RegExp(
    `(\\d+)\\s*([${FRAC_CHARS}])` +          // 1: whole + 2: unicode fraction "1½"
    `|(\\d+)\\s+(\\d+)\\/(\\d+)` +           // 3,4,5: mixed number            "1 1/2"
    `|(\\d+)\\/(\\d+)` +                     // 6,7: fraction                  "3/4"
    `|(\\d+[.,]\\d+)` +                      // 8: decimal, dot or comma       "1,5"
    `|(\\d+)` +                              // 9: whole number                "250"
    `|([${FRAC_CHARS}])`,                    // 10: lone unicode fraction      "½"
    'g'
);

function tokenValue(m) {
    if (m[1] !== undefined) return Number(m[1]) + UNICODE_FRACTIONS[m[2]];
    if (m[3] !== undefined) return Number(m[5]) ? Number(m[3]) + Number(m[4]) / Number(m[5]) : null;
    if (m[6] !== undefined) return Number(m[7]) ? Number(m[6]) / Number(m[7]) : null;
    if (m[8] !== undefined) return Number(m[8].replace(',', '.'));
    if (m[9] !== undefined) return Number(m[9]);
    if (m[10] !== undefined) return UNICODE_FRACTIONS[m[10]];
    return null;
}

function trimNumber(value, decimals, comma) {
    const text = value.toFixed(decimals).replace(/\.?0+$/, '');
    return comma ? text.replace('.', ',') : text;
}

/**
 * Write a scaled quantity the way a cook would write it down.
 * `comma` picks the decimal separator: comma when true, dot otherwise.
 */
export function formatQuantity(value, { metric = false, comma = false } = {}) {
    if (!(value > 0)) return '0';

    if (metric) {
        if (value >= 100) return String(Math.round(value));
        if (value >= 10) return trimNumber(Math.round(value * 2) / 2, 1, comma);
        return trimNumber(value, 2, comma);
    }

    const whole = Math.floor(value + 1e-9);
    const rest = value - whole;
    if (rest < 0.03) return String(whole || 0) === '0' ? trimNumber(value, 2, comma) : String(whole);
    if (rest > 0.97) return String(whole + 1);
    for (const [fraction, char] of NICE_FRACTIONS) {
        if (Math.abs(rest - fraction) < 0.03) return whole > 0 ? `${whole}${char}` : char;
    }
    return trimNumber(value, value < 10 ? 1 : 0, comma);
}

// Should this number be left alone? Then it is not an amount.
function isNotAnAmount(text, start, end, raw) {
    const before = text.slice(0, start);
    const after = text.slice(end);

    // Percentages and degrees: "18% room", "180 °C", "180 degrees".
    if (/^\s*(?:%|°|℃|℉|graden\b|degrees\b)/i.test(after)) return true;
    // Part of a word or code: "E471", "T65", "type 00".
    if (/[A-Za-zÀ-ÿ]$/.test(before)) return true;
    if (/^0\d/.test(raw)) return true;
    // Second number in "2 x 400 g": the first one counts, this is the size per piece.
    if (/\d\s*[x×]\s*$/i.test(before)) return true;
    // Size per piece: "1 blik à 400 g", "stuk gember van 3 cm".
    // "2 à 3 tenen" is a range and does scale: there a number precedes "à".
    if (/[A-Za-zÀ-ÿ)]\s+(?:à|a|van)\s+$/i.test(before) && METRIC_UNIT.test(after)) return true;
    // English "1 can of 400 g tomatoes". Only after a container word, because
    // Dutch "of" means "or" and those amounts do scale.
    if (CONTAINER_OF.test(before) && METRIC_UNIT.test(after)) return true;
    return false;
}

/**
 * Scale all quantities in one ingredient line. The text stays as it is.
 * The output uses the decimal separator the line itself uses: a comma when
 * any number in the line is written with one ("1,5"), otherwise a dot.
 */
export function scaleIngredient(text, factor) {
    const line = String(text ?? '');
    if (factor === 1 || !(factor > 0)) return line;
    const comma = /\d,\d/.test(line);

    return line.replace(NUMBER, (raw, ...groups) => {
        const offset = groups[groups.length - 2];
        const match = [raw, ...groups.slice(0, 10)];
        const value = tokenValue(match);
        if (value === null) return raw;
        if (isNotAnAmount(line, offset, offset + raw.length, raw)) return raw;

        const metric = METRIC_UNIT.test(line.slice(offset + raw.length));
        return formatQuantity(value * factor, { metric, comma });
    });
}

/** First number in a servings text: "4 servings" -> 4, "Makes 12 cookies" -> 12. */
export function parseServings(text) {
    const m = /\d+/.exec(String(text ?? ''));
    if (!m) return null;
    const n = Number(m[0]);
    return n > 0 && n <= 500 ? n : null;
}

/** Replace the first number in the servings text with the new count. */
export function withServings(text, count) {
    return String(text ?? '').replace(/\d+/, String(count));
}

// --- Search ---

export function normalize(text) {
    return String(text ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
}

/** Stable key for an ingredient, so a check stays with the ingredient. */
export function ingredientKey(text) {
    return normalize(text).replace(/\s+/g, ' ').trim();
}

/** Every search word must appear somewhere in title, ingredients, notes or source. */
export function matchesQuery(recipe, query) {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;
    const haystack = normalize([
        recipe.title,
        ...(Array.isArray(recipe.ingredients) ? recipe.ingredients : []),
        recipe.notes,
        recipe.source,
    ].filter(Boolean).join('\n'));
    return words.every(word => haystack.includes(word));
}

// --- Splitting a line into amount and ingredient, for the prep-list layout ---

const AMOUNT = `(?:\\d+\\s*[${FRAC_CHARS}]|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+[.,]\\d+|\\d+|[${FRAC_CHARS}])`;
const UNITS = 'g|gr|grams?|kg|kilo|mg|ml|cl|dl|l|liters?|litres?|tsp|tbsp|teaspoons?|tablespoons?|cups?|oz|lbs?|'
    + 'el|tl|eetlepels?|theelepels?|cm|mm';
const LEADING_AMOUNT = new RegExp(
    `^\\s*(${AMOUNT}(?:\\s*(?:-|–|à|to|tot)\\s*${AMOUNT})?(?:\\s*(?:${UNITS})\\b\\.?)?)\\s+(\\S.*)$`, 'i'
);

/**
 * "400 g spaghetti" -> { amount: "400 g", name: "spaghetti" }.
 * A line that does not start with a number keeps everything in `name`.
 */
export function splitIngredient(text) {
    const line = String(text ?? '').trim();
    const match = LEADING_AMOUNT.exec(line);
    if (!match) return { amount: '', name: line };
    return { amount: match[1].replace(/\s+/g, ' ').trim(), name: match[2].trim() };
}
