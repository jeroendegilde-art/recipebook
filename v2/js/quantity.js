// Hoeveelheden schalen en zoeken. Pure functies, geen DOM. Getest in tests/.

const UNICODE_FRACTIONS = {
    '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4,
    '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5, '⅘': 4 / 5, '⅙': 1 / 6, '⅚': 5 / 6,
    '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8,
};
const FRAC_CHARS = Object.keys(UNICODE_FRACTIONS).join('');

// Breuken die we terug durven te schrijven. Alleen de gangbare keukenbreuken.
const NICE_FRACTIONS = [
    [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'],
];

// Eenheden die je weegt of afmeet: daar hoort een decimaal getal bij, geen breuk.
const METRIC_UNIT = /^\s*(?:g|gr|gram|kg|kilo|mg|ml|cl|dl|l|liter|cm|mm)\b/i;

// Eén getal in een ingrediëntregel. Volgorde is van belang: langste vorm eerst.
const NUMBER = new RegExp(
    `(\\d+)\\s*([${FRAC_CHARS}])` +          // 1: geheel + 2: unicode-breuk   "1½"
    `|(\\d+)\\s+(\\d+)\\/(\\d+)` +           // 3,4,5: gemengd getal           "1 1/2"
    `|(\\d+)\\/(\\d+)` +                     // 6,7: breuk                     "3/4"
    `|(\\d+[.,]\\d+)` +                      // 8: decimaal, punt of komma     "1,5"
    `|(\\d+)` +                              // 9: geheel getal                "250"
    `|([${FRAC_CHARS}])`,                    // 10: losse unicode-breuk        "½"
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

function trimNumber(value, decimals) {
    return value.toFixed(decimals).replace(/\.?0+$/, '').replace('.', ',');
}

/** Schrijf een geschaalde hoeveelheid zoals een kok hem zou opschrijven. */
export function formatQuantity(value, { metric = false } = {}) {
    if (!(value > 0)) return '0';

    if (metric) {
        if (value >= 100) return String(Math.round(value));
        if (value >= 10) return trimNumber(Math.round(value * 2) / 2, 1);
        return trimNumber(value, 2);
    }

    const whole = Math.floor(value + 1e-9);
    const rest = value - whole;
    if (rest < 0.03) return String(whole || 0) === '0' ? trimNumber(value, 2) : String(whole);
    if (rest > 0.97) return String(whole + 1);
    for (const [fraction, char] of NICE_FRACTIONS) {
        if (Math.abs(rest - fraction) < 0.03) return whole > 0 ? `${whole}${char}` : char;
    }
    return trimNumber(value, value < 10 ? 1 : 0);
}

// Moet dit getal met rust gelaten worden? Dan is het geen hoeveelheid.
function isNotAnAmount(text, start, end, raw) {
    const before = text.slice(0, start);
    const after = text.slice(end);

    // Percentages en graden: "18% room", "180 °C".
    if (/^\s*(?:%|°|℃|℉|graden\b)/.test(after)) return true;
    // Onderdeel van een woord of code: "E471", "T65", "type 00".
    if (/[A-Za-zÀ-ÿ]$/.test(before)) return true;
    if (/^0\d/.test(raw)) return true;
    // Tweede getal in "2 x 400 g": het eerste telt, dit is de maat per stuk.
    if (/\d\s*[x×]\s*$/i.test(before)) return true;
    // Maat per stuk: "1 blik à 400 g", "stuk gember van 3 cm".
    // "2 à 3 tenen" is een bereik en schaalt wel: daar staat een getal voor "à".
    if (/[A-Za-zÀ-ÿ)]\s+(?:à|a|van|of)\s+$/i.test(before) && METRIC_UNIT.test(after)
        && !/\bof\s+$/i.test(before)) return true;
    return false;
}

/** Schaal alle hoeveelheden in één ingrediëntregel. Tekst blijft staan. */
export function scaleIngredient(text, factor) {
    const line = String(text ?? '');
    if (factor === 1 || !(factor > 0)) return line;

    return line.replace(NUMBER, (raw, ...groups) => {
        const offset = groups[groups.length - 2];
        const match = [raw, ...groups.slice(0, 10)];
        const value = tokenValue(match);
        if (value === null) return raw;
        if (isNotAnAmount(line, offset, offset + raw.length, raw)) return raw;

        const metric = METRIC_UNIT.test(line.slice(offset + raw.length));
        return formatQuantity(value * factor, { metric });
    });
}

/** Eerste getal uit een portie-tekst: "4 personen" -> 4, "Voor 12 koekjes" -> 12. */
export function parseServings(text) {
    const m = /\d+/.exec(String(text ?? ''));
    if (!m) return null;
    const n = Number(m[0]);
    return n > 0 && n <= 500 ? n : null;
}

/** Vervang het eerste getal in de portie-tekst door het nieuwe aantal. */
export function withServings(text, count) {
    return String(text ?? '').replace(/\d+/, String(count));
}

// --- Zoeken ---

export function normalize(text) {
    return String(text ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
}

/** Vaste sleutel voor een ingrediënt, zodat een vinkje bij het ingrediënt blijft. */
export function ingredientKey(text) {
    return normalize(text).replace(/\s+/g, ' ').trim();
}

/** Elk zoekwoord moet ergens in titel, ingrediënten, notities of bron staan. */
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
