// Reading recipes: from a link, pasted text, photo or PDF.
// Ported from v1 (app.js). The logic and the prompts are deliberately kept
// the same. Changes: no more global variables (see `config`), no debug
// logging, and the Fahrenheit detection is fixed.
//
// The error messages here are terse, and other code matches on them.
// The friendly wording for the user is in messages.js.

/** Filled in at startup by main.js. */
export const config = {
    apiKey: () => '',
    model: () => '',
};

function hasApiKey() {
    return !!config.apiKey();
}

// --- Converting to metric (only used without an API key) ---

const conversions = {
    // Volume
    'cup': { metric: 'ml', factor: 237 },
    'cups': { metric: 'ml', factor: 237 },
    'fluid ounce': { metric: 'ml', factor: 30 },
    'fluid ounces': { metric: 'ml', factor: 30 },
    'fl oz': { metric: 'ml', factor: 30 },
    'pint': { metric: 'ml', factor: 473 },
    'pints': { metric: 'ml', factor: 473 },
    'quart': { metric: 'ml', factor: 946 },
    'quarts': { metric: 'ml', factor: 946 },
    'gallon': { metric: 'L', factor: 3.785 },
    'gallons': { metric: 'L', factor: 3.785 },

    // Weight
    'ounce': { metric: 'g', factor: 28.35 },
    'ounces': { metric: 'g', factor: 28.35 },
    'oz': { metric: 'g', factor: 28.35 },
    'pound': { metric: 'g', factor: 454 },
    'pounds': { metric: 'g', factor: 454 },
    'lb': { metric: 'g', factor: 454 },
    'lbs': { metric: 'g', factor: 454 },

    // Length
    'inch': { metric: 'cm', factor: 2.54 },
    'inches': { metric: 'cm', factor: 2.54 },
    'in': { metric: 'cm', factor: 2.54 },
};

function convertToMetric(text) {
    const fractionMap = {
        '½': 0.5, '⅓': 0.333, '⅔': 0.667, '¼': 0.25, '¾': 0.75,
        '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 0.167,
        '⅚': 0.833, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
    };
    const fc = Object.keys(fractionMap).join(''); // fraction unicode chars

    // 1. Temperatures
    // v1 read "2 f" in "2 fijngesneden uien" as Fahrenheit. Now a degree sign,
    // the word "degrees" or a standalone capital F is required.
    text = text.replace(/(\d+)\s*(?:°\s*F(?:ahrenheit)?\b|℉|degrees\s+F(?:ahrenheit)?\b|F\b(?![a-zà-ÿ]))/g, (_, t) =>
        `${Math.round((parseInt(t) - 32) * 5 / 9)}°C`
    );

    // 2. Smart: if source already has explicit metric in parens, prefer it
    // "1/2 cup (70g)" → "70g (1/2 cup)"   "2 oz (56g)" → "56g (2 oz)"
    const allUnits = Object.keys(conversions).join('|');
    text = text.replace(
        new RegExp(`([${fc}\\d][${fc}\\d\\s\\/]*)\\s*\\b(${allUnits})\\b\\s*\\((\\d+(?:\\.\\d+)?)\\s*(g|kg|ml|L|cm)\\)`, 'gi'),
        (_, qty, unit, val, mUnit) => `${val}${mUnit} (${qty.trim()} ${unit})`
    );

    // 3. Regular conversions — require a number or fraction before the unit
    // (\b boundaries prevent matching inside words like "pinch")
    // Skip matches preceded by "(" to avoid re-processing step-2 output
    const unitPattern = Object.keys(conversions).join('|');
    const regex = new RegExp(
        `(\\d+)(?:\\s+(\\d+\\/\\d+))?\\s*\\b(${unitPattern})\\b` +   // "2 cups", "1 1/2 lbs"
        `|([${fc}])\\s*\\b(${unitPattern})\\b` +                      // "½ cup"
        `|(\\d+\\/\\d+)\\s*\\b(${unitPattern})\\b`,                   // "1/2 cup"
        'gi'
    );

    text = text.replace(regex, (match, wholeA, mixFracA, unitA, fracCharB, unitB, fracC, unitC, offset) => {
        // Don't re-process content already inside parentheses
        if (offset > 0 && text[offset - 1] === '(') return match;

        const unit = unitA || unitB || unitC;
        if (!unit) return match;

        const conv = conversions[unit.toLowerCase()];
        if (!conv) return match;

        let value = 0;
        if (wholeA)   value = parseInt(wholeA);
        if (mixFracA) { const [n, d] = mixFracA.split('/'); value += parseInt(n) / parseInt(d); }
        if (fracCharB) value = fractionMap[fracCharB] || 1;
        if (fracC)    { const [n, d] = fracC.split('/'); value = parseInt(n) / parseInt(d); }
        if (value === 0) value = 1;

        let converted = value * conv.factor;
        if (converted >= 100) converted = Math.round(converted / 10) * 10;
        else if (converted >= 10) converted = Math.round(converted);
        else converted = Math.round(converted * 10) / 10;

        const orig = match.trim();
        if (conv.metric === 'ml' && converted >= 1000) return `${(converted / 1000).toFixed(1)}L (${orig})`;
        if (conv.metric === 'g'  && converted >= 1000) return `${(converted / 1000).toFixed(1)}kg (${orig})`;
        return `${converted}${conv.metric} (${orig})`;
    });

    return text;
}

// --- Reading with Claude ---

// Shared metric-conversion rules. The MODEL does the conversion — it knows the
// density of each ingredient, which a regex never can (a cup of oats is ~90g, a
// cup of soy milk is 240ml). This is why convertToMetric() is NOT run on model
// output anymore.
const METRIC_RULES = `CONVERT EVERY MEASUREMENT TO METRIC using real culinary knowledge of the specific ingredient. This is the single most important rule — get it right per ingredient.

- LIQUIDS (water, milk, plant milks, oil, vinegar, juice, stock/broth, wine, cream, melted butter, maple syrup, honey) → millilitres (ml).
  1 cup = 240 ml · ¾ cup = 180 ml · ⅔ cup = 160 ml · ½ cup = 120 ml · ⅓ cup = 80 ml · ¼ cup = 60 ml · 1 fl oz = 30 ml
- DRY / SOLID ingredients measured by volume (flour, oats, sugar, rice, nuts, seeds, chocolate, cocoa, fruit, berries, grated or shredded foods, breadcrumbs, etc.) → GRAMS (g) BY WEIGHT. A cup is a volume, so weigh it: use that specific ingredient's real density. NEVER treat a cup of a dry good as 240 g, and NEVER express a dry good in ml.
  Approx. weight of 1 cup: all-purpose flour ≈ 125 g · rolled oats ≈ 90 g · granulated sugar ≈ 200 g · packed brown sugar ≈ 220 g · uncooked rice ≈ 185 g · chopped nuts ≈ 120 g · chocolate chips ≈ 170 g · fresh raspberries or blueberries ≈ 125 g · grated cheese ≈ 100 g · cocoa powder ≈ 85 g. Scale proportionally (so ½ cup rolled oats ≈ 45 g, ½ cup raspberries ≈ 60 g).
- IMPERIAL WEIGHT (oz, lb) → grams (1 oz ≈ 28 g, 1 lb ≈ 454 g).
- Oven TEMPERATURES °F → °C, rounded to the nearest 5°. LENGTHS in inches → cm.
- KEEP AS WRITTEN (do NOT convert): teaspoons (tsp) and tablespoons (Tbsp) of seasonings, spices, leaveners, extracts and other small amounts; whole-item counts ("2 eggs", "1 onion", "1 clove garlic"); and vague amounts ("a pinch", "to taste").
- If the source already gives a metric weight or volume, keep it.
- ALWAYS write the metric value first with the original in parentheses, and never drop the ingredient name. e.g. "45 g rolled oats (½ cup)" · "120 ml soy milk (½ cup)" · "180 °C (350 °F)".`;

// Shared structure/completeness rules.
const STRUCTURE_RULES = `INGREDIENTS: one per array item, each as "<amount> <ingredient>" on a single line. Keep section headers ("For the sauce:") as their own item if the source groups ingredients.

METHOD / INSTRUCTIONS — MANDATORY. Never return an empty instructions list if the source describes how to make the dish. If the page seems to hide the method, reconstruct it from any step text you can find.
- Each array item = exactly ONE action (one verb / one phase). Never merge two actions.
- If the source numbers the steps, keep each as its own item. If it's one paragraph, split at action boundaries ("then", "meanwhile", a new heat level, a new ingredient group).
- Strip leading numbers and bullets — keep just the instruction prose.
- Keep times and temperatures inside the step text (temperatures converted to °C).

SERVINGS: capture the yield ("serves 4", "makes 12 cookies") as a short string; use "" only if truly absent.
NOTES: short tips, storage or serving suggestions only — no life stories, ads, or comments.

Set "found" to false only if there is no real recipe in the content.`;

// JSON Schema for structured output — guarantees parseable JSON from the model.
const RECIPE_SCHEMA = {
    type: 'object',
    properties: {
        found: { type: 'boolean' },
        title: { type: 'string' },
        servings: { type: 'string' },
        ingredients: { type: 'array', items: { type: 'string' } },
        instructions: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' }
    },
    required: ['found', 'title', 'servings', 'ingredients', 'instructions', 'notes'],
    additionalProperties: false
};

// Lenient JSON parse — structured output returns clean JSON, but tolerate fences
// or stray prose just in case (e.g. a model that ignored output_config).
function parseRecipeJson(content) {
    try { return JSON.parse(content); } catch (_) {}
    const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) { try { return JSON.parse(fence[1]); } catch (_) {} }
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start !== -1 && end > start) {
        try { return JSON.parse(content.slice(start, end + 1)); } catch (_) {}
    }
    throw new Error('Could not parse the recipe from the response.');
}

// Single reliable entry point for every model-backed extraction (URL text and
// photos). Handles structured output, generous max_tokens, a timeout, and one
// automatic retry so a transient hiccup doesn't force the user to re-run.
// `userContent` is the messages[0].content value: a string (text) or an array
// (image blocks + a text block).
//
// With `webFetch: true` the model fetches the URL itself via the server-side
// web_fetch tool (used when the CORS proxies can't reach a page). Structured
// output is skipped there and the final text block is parsed leniently.
async function callClaudeRecipe(userContent, { webFetch = false } = {}) {
    if (!config.apiKey()) {
        throw new Error('Please add your Claude API key in Settings first');
    }

    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), webFetch ? 120000 : 45000);

        try {
            const body = {
                model: config.model(),
                max_tokens: 8192,
                messages: [{ role: 'user', content: userContent }]
            };
            if (webFetch) {
                // Newer models get the dynamic-filtering variant; if the chosen
                // model rejects it (400), the retry uses the basic variant.
                body.tools = [{
                    type: attempt === 0 ? 'web_fetch_20260209' : 'web_fetch_20250910',
                    name: 'web_fetch',
                    max_uses: 3
                }];
            } else if (attempt === 0) {
                // Ask for guaranteed-valid JSON on the first attempt. If the chosen
                // model rejects it (400), the retry below drops it and parses leniently.
                body.output_config = { format: { type: 'json_schema', schema: RECIPE_SCHEMA } };
            }

            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': config.apiKey(),
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify(body),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Claude API error:', response.status, errorData);

                // Non-retryable — surface immediately.
                if (response.status === 401) throw new Error('Invalid API key. Please check it in Settings.');
                if (response.status === 403) throw new Error('API access forbidden — enable "browser access" on your key in the Anthropic Console.');

                // Retryable: rate limit, server error, or a 400 likely caused by a
                // model that doesn't support structured output (retry drops it).
                lastError = new Error(errorData.error?.message || `API error: ${response.status}`);
                if (response.status === 429) await new Promise(r => setTimeout(r, 1500));
                continue;
            }

            const data = await response.json();
            const blocks = data.content || [];

            // A failed server-side fetch comes back as HTTP 200 with an error block.
            const fetchResult = blocks.find(b => b.type === 'web_fetch_tool_result');
            if (fetchResult && fetchResult.content?.type === 'web_fetch_tool_error'
                && !blocks.some(b => b.type === 'web_fetch_tool_result' && b.content?.type === 'web_fetch_result')) {
                throw new Error(`Could not fetch that page (${fetchResult.content.error_code || 'fetch failed'}). Try Paste or Manual instead.`);
            }

            // The recipe JSON is in the last text block (earlier ones may be
            // commentary around tool calls).
            const content = blocks.filter(b => b.type === 'text').map(b => b.text).pop();
            if (!content) { lastError = new Error('Empty response from Claude API'); continue; }

            const recipe = parseRecipeJson(content);
            if (recipe.found === false) {
                throw new Error('No recipe found in that content.');
            }

            return {
                title: recipe.title || 'Untitled Recipe',
                servings: recipe.servings || '',
                ingredients: (recipe.ingredients || []).filter(Boolean),
                instructions: (recipe.instructions || []).filter(Boolean),
                notes: recipe.notes || ''
            };

        } catch (error) {
            clearTimeout(timeoutId);
            // Don't retry user-actionable errors.
            if (/Invalid API key|forbidden|No recipe found|Could not fetch that page/.test(error.message)) throw error;
            lastError = error.name === 'AbortError' ? new Error('Request timed out.') : error;
        }
    }

    throw lastError || new Error('Extraction failed. Please try again.');
}

async function extractRecipeWithClaude(text, sourceUrl = '') {
    const prompt = `You are extracting a single recipe from the web-page content below. Ignore navigation, ads, comments, author bios, personal stories, newsletter prompts and any other non-recipe text. Capture the COMPLETE recipe — every ingredient and every method step. Dropping steps or ingredients is a failure.

${METRIC_RULES}

${STRUCTURE_RULES}

CONTENT:
${text.substring(0, 16000)}`;

    const recipe = await callClaudeRecipe(prompt);
    return { ...recipe, source: sourceUrl };
}

// Fallback for when no CORS proxy can reach the page: Claude fetches the URL
// server-side with the web_fetch tool and extracts the recipe in one call.
async function extractRecipeWithWebFetch(url) {
    const prompt = `Use the web_fetch tool to fetch this recipe page, then extract the single recipe on it. Ignore navigation, ads, comments, author bios and personal stories. Capture the COMPLETE recipe — every ingredient and every method step. Dropping steps or ingredients is a failure.

URL: ${url}

${METRIC_RULES}

${STRUCTURE_RULES}

Reply with ONLY a JSON object (no prose, no code fence) with exactly these keys: "found" (boolean), "title" (string), "servings" (string), "ingredients" (array of strings), "instructions" (array of strings), "notes" (string).`;

    const recipe = await callClaudeRecipe(prompt, { webFetch: true });
    return { ...recipe, source: url, image: '' };
}


// --- Photos ---

async function extractRecipeFromPhotos(photos) {
    if (!config.apiKey()) {
        throw new Error('Please add your Claude API key in Settings to use camera import');
    }

    if (photos.length === 0) {
        throw new Error('No photos to process');
    }

    // Convert photos to base64 for Claude API
    const imageContents = await Promise.all(photos.map(async (photo) => {
        return {
            type: 'image',
            source: {
                type: 'base64',
                media_type: photo.type || 'image/jpeg',
                data: photo.base64.split(',')[1] // Remove data URL prefix
            }
        };
    }));

    const prompt = `Read the recipe in these photo(s) and extract it COMPLETELY — every ingredient and every method step. The photos may be multiple pages of the SAME recipe; combine them into one. If text is hard to read, interpret it as best you can rather than dropping it.

${METRIC_RULES}

${STRUCTURE_RULES}`;

    const recipe = await callClaudeRecipe([...imageContents, { type: 'text', text: prompt }]);
    return { ...recipe, source: '' };
}

// --- PDF cookbook ---

async function extractTextFromPDF(file, onPageProgress) {
    const pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) throw new Error('PDF library not loaded. Please refresh and try again.');

    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    let arrayBuffer;
    try { arrayBuffer = await file.arrayBuffer(); }
    catch (e) { throw new Error('Could not read the PDF file.'); }

    let pdf;
    try { pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise; }
    catch (e) { throw new Error('Could not open PDF. It may be corrupted or password-protected.'); }

    const numPages = pdf.numPages;
    let fullText = '';

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        if (onPageProgress) onPageProgress(pageNum, numPages);

        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        let pageText = '';
        let lastY = null;

        for (const item of textContent.items) {
            if (!item.str) continue;
            const y = item.transform[5];
            if (lastY !== null) {
                const dy = Math.abs(y - lastY);
                if (dy > 10) pageText += '\n\n';
                else if (dy > 4) pageText += '\n';
                else pageText += ' ';
            }
            pageText += item.str.trim();
            lastY = y;
        }

        fullText += pageText + '\n\n';
    }

    return fullText.trim();
}

async function extractRecipesFromChunk(text, chunkIndex, totalChunks) {
    const prompt = `Extract ALL recipes from this cookbook text (section ${chunkIndex + 1} of ${totalChunks}).

Return a JSON array where each recipe is:
{
  "title": "Recipe Name",
  "servings": "4 servings",
  "ingredients": ["ingredient 1", "ingredient 2"],
  "instructions": ["step 1", "step 2"],
  "notes": ""
}

RULES:
1. Extract EVERY distinct recipe you find, even if incomplete at the edges
2. Copy measurements EXACTLY as written — do NOT convert any units
3. Each instruction = one cooking action (never merge two steps)
4. Return [] if no recipes are found in this text
5. Return ONLY the JSON array, no other text

COOKBOOK TEXT:
${text}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey(),
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: config.model(),
            max_tokens: 8192,
            messages: [{ role: 'user', content: prompt }]
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (response.status === 429) throw new Error('Rate limit reached. Please wait a moment and try again.');
        throw new Error(err.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content[0].text;

    const start = content.indexOf('[');
    const end = content.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) return [];

    try {
        const recipes = JSON.parse(content.slice(start, end + 1));
        return recipes.filter(r => r.title && (r.ingredients?.length > 0 || r.instructions?.length > 0));
    } catch (e) {
        console.error(`Chunk ${chunkIndex}: JSON parse failed`, e);
        return [];
    }
}

async function processPDFBulkImport(file, onProgress) {
    if (!config.apiKey()) throw new Error('Please add your Claude API key in Settings first.');

    onProgress('reading', 0, 1, 'Reading PDF...');
    const fullText = await extractTextFromPDF(file, (page, total) => {
        onProgress('reading', page, total, `Reading page ${page} of ${total}...`);
    });

    if (!fullText || fullText.length < 50) {
        throw new Error('No readable text found. The PDF may be image-based — try the Camera tab to photograph pages instead.');
    }

    const CHUNK_SIZE = 20000;
    const OVERLAP = 1000;
    const chunks = [];
    let i = 0;
    while (i < fullText.length) {
        chunks.push(fullText.slice(i, i + CHUNK_SIZE));
        if (i + CHUNK_SIZE >= fullText.length) break;
        i += CHUNK_SIZE - OVERLAP;
    }

    onProgress('extracting', 0, chunks.length,
        `${Math.round(fullText.length / 1000)}K chars found. Extracting recipes (0/${chunks.length})...`);

    const allRecipes = [];
    const seenTitles = new Set();

    for (let ci = 0; ci < chunks.length; ci++) {
        onProgress('extracting', ci + 1, chunks.length,
            `Extracting recipes... (${ci + 1} of ${chunks.length} sections)`);

        try {
            const found = await extractRecipesFromChunk(chunks[ci], ci, chunks.length);
            for (const r of found) {
                const key = r.title.toLowerCase().trim().replace(/\s+/g, ' ');
                if (!seenTitles.has(key)) {
                    seenTitles.add(key);
                    allRecipes.push({
                        title: r.title,
                        servings: r.servings || '',
                        ingredients: (r.ingredients || []).map(convertToMetric),
                        instructions: (r.instructions || []).map(convertToMetric),
                        notes: r.notes || ''
                    });
                }
            }
        } catch (e) {
            console.error(`Chunk ${ci} failed:`, e.message);
        }
    }

    return allRecipes;
}

// --- Fetching and parsing a web page ---

// CORS proxies to try in order. Free proxies come and go (corsproxy.io now
// requires a key; allorigins/codetabs are frequently down), so when all of them
// fail and there's an API key, fetchRecipeFromUrl falls back to Claude's own
// server-side web fetch.
const CORS_PROXIES = [
    // Jina Reader returns the raw page HTML (incl. JSON-LD) with CORS headers.
    { url: (url) => `https://r.jina.ai/${url}`, headers: { 'X-Return-Format': 'html' } },
    { url: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
    { url: (url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}` },
];

// A proxy "success" isn't enough: blocked sites come back as "Access Denied"
// pages and some proxies return truncated HTML. Only accept a page that
// actually carries recipe markup.
function looksLikeRecipePage(html) {
    return /"recipeIngredient"|itemprop=["']?recipeIngredient|wprm-recipe|tasty-recipes|mv-create-ingredients|class=["'][^"']*\bingredients?\b/i.test(html);
}

// Query every proxy at once and take the first usable page, so a dead proxy
// doesn't stall the scan while it times out.
async function fetchWithProxy(url) {
    const attempts = CORS_PROXIES.map(async (proxy) => {
        const proxyUrl = proxy.url(url);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        try {
            const response = await fetch(proxyUrl, {
                signal: controller.signal,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    ...proxy.headers
                }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await response.text();
            if (!looksLikeRecipePage(text)) throw new Error('No recipe markup in response');
            return text;
        } catch (e) {
            throw e;
        } finally {
            clearTimeout(timeoutId);
        }
    });

    try {
        return await Promise.any(attempts);
    } catch (e) {
        throw new Error('All proxies failed');
    }
}

async function fetchRecipeFromUrl(url) {
    // Only the network fetch should be reported as a CORS/proxy failure.
    // Extraction errors (bad key, no recipe, etc.) must surface to the user as-is.
    let html;
    try {
        html = await fetchWithProxy(url);
    } catch (error) {
        console.error('Error fetching recipe page:', error);
        // Proxies down or the site blocks them: let Claude fetch the page itself.
        if (hasApiKey()) return extractRecipeWithWebFetch(url);
        throw new Error('Could not fetch recipe — the page proxies are unavailable. Add a Claude API key in Settings, or use Paste / Manual instead.');
    }

    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Parse JSON-LD — used for the image always, and as the recipe source when
    // there's no API key.
    let jsonLdRecipe = null;
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
        try {
            const recipeData = findRecipeInJsonLd(JSON.parse(script.textContent));
            if (recipeData) { jsonLdRecipe = parseJsonLdRecipe(recipeData, url); break; }
        } catch (e) { /* try next script */ }
    }

    // Best available image (JSON-LD, then og:image), resolved to an absolute URL.
    let image = (jsonLdRecipe && jsonLdRecipe.image) || '';
    if (!image) {
        const ogImg = doc.querySelector('meta[property="og:image"]');
        const imgSrc = ogImg?.getAttribute('content') || '';
        try { image = imgSrc ? new URL(imgSrc, url).href : ''; } catch (e) { image = imgSrc; }
    }

    // WITH A KEY: always normalize through the model. This is the rock-solid path
    // — correct per-ingredient metric conversion, complete method capture, and a
    // built-in retry. We feed it the cleaned page text PLUS any structured data
    // the page exposed, so nothing (like the method) gets silently dropped.
    if (hasApiKey()) {
        let content = extractCleanText(doc);
        if (jsonLdRecipe && (jsonLdRecipe.ingredients.length || jsonLdRecipe.instructions.length)) {
            content += '\n\n--- STRUCTURED RECIPE DATA FROM THE PAGE ---\n';
            if (jsonLdRecipe.title) content += `Title: ${jsonLdRecipe.title}\n`;
            if (jsonLdRecipe.ingredients.length) content += `Ingredients:\n${jsonLdRecipe.ingredients.join('\n')}\n`;
            if (jsonLdRecipe.instructions.length) content += `Method:\n${jsonLdRecipe.instructions.join('\n')}\n`;
            if (jsonLdRecipe.notes) content += `Notes: ${jsonLdRecipe.notes}\n`;
        }
        if (content.trim().length > 60) {
            let claudeRecipe;
            try {
                claudeRecipe = await extractRecipeWithClaude(content, url);
            } catch (error) {
                // The proxy may have served a stripped-down page; fetch it directly.
                if (!/No recipe found/.test(error.message)) throw error;
                claudeRecipe = await extractRecipeWithWebFetch(url);
            }
            claudeRecipe.image = claudeRecipe.image || image;
            return claudeRecipe;
        }
    }

    // NO KEY (or no usable text): structured/heuristic parse + the light regex
    // converter. Note: without a model this can't tell dry from liquid, so volume
    // conversions stay approximate — add an API key for accurate metric.
    let recipe = (jsonLdRecipe && jsonLdRecipe.ingredients.length)
        ? jsonLdRecipe
        : parseRecipeHeuristically(doc, url);
    recipe.image = recipe.image || image;
    recipe.ingredients = (recipe.ingredients || []).map(convertToMetric);
    recipe.instructions = (recipe.instructions || []).map(convertToMetric);
    return recipe;
}

function findRecipeInJsonLd(data) {
    if (Array.isArray(data)) {
        for (const item of data) {
            const found = findRecipeInJsonLd(item);
            if (found) return found;
        }
    } else if (typeof data === 'object' && data !== null) {
        if (data['@type'] === 'Recipe' || data['@type']?.includes?.('Recipe')) {
            return data;
        }
        if (data['@graph']) {
            return findRecipeInJsonLd(data['@graph']);
        }
    }
    return null;
}

function parseJsonLdRecipe(data, url) {
    // Extract image
    let img = data.image;
    if (Array.isArray(img)) img = img[0];
    if (img && typeof img === 'object') img = img.url || img['@id'] || '';
    const image = typeof img === 'string' ? img : '';
    const recipe = {
        title: data.name || '',
        ingredients: [],
        instructions: [],
        source: url,
        notes: data.description || '',
        image
    };

    // Parse ingredients
    if (data.recipeIngredient) {
        recipe.ingredients = Array.isArray(data.recipeIngredient)
            ? data.recipeIngredient
            : [data.recipeIngredient];
    }

    // Parse instructions
    if (data.recipeInstructions) {
        const instructions = data.recipeInstructions;
        if (Array.isArray(instructions)) {
            recipe.instructions = instructions.map(inst => {
                if (typeof inst === 'string') return inst;
                if (inst.text) return inst.text;
                if (inst.itemListElement) {
                    return inst.itemListElement.map(i => i.text || i).join(' ');
                }
                return '';
            }).filter(Boolean);
        } else if (typeof instructions === 'string') {
            recipe.instructions = instructions.split(/\n|(?:\d+\.\s)/).filter(Boolean);
        }
    }

    return recipe;
}

function parseRecipeHeuristically(doc, url) {
    const recipe = {
        title: '',
        ingredients: [],
        instructions: [],
        source: url,
        notes: ''
    };

    // Find title
    const titleSelectors = [
        'h1.recipe-title', 'h1.entry-title', '.recipe-name',
        '[itemprop="name"]', 'h1', 'h2.recipe-title'
    ];
    for (const selector of titleSelectors) {
        const el = doc.querySelector(selector);
        if (el && el.textContent.trim()) {
            recipe.title = el.textContent.trim();
            break;
        }
    }

    // Find ingredients
    const ingredientSelectors = [
        '.recipe-ingredients li', '.ingredients li', '[itemprop="recipeIngredient"]',
        '.ingredient-list li', '.wprm-recipe-ingredient', '.tasty-recipe-ingredients li',
        'ul.ingredients li', '.recipe-ingred_txt'
    ];
    for (const selector of ingredientSelectors) {
        const els = doc.querySelectorAll(selector);
        if (els.length > 0) {
            recipe.ingredients = Array.from(els).map(el => el.textContent.trim()).filter(Boolean);
            break;
        }
    }

    // Find instructions
    const instructionSelectors = [
        '.recipe-instructions li', '.instructions li', '[itemprop="recipeInstructions"]',
        '.recipe-directions li', '.wprm-recipe-instruction', '.tasty-recipe-instructions li',
        'ol.instructions li', '.recipe-method li', '.direction-list li'
    ];
    for (const selector of instructionSelectors) {
        const els = doc.querySelectorAll(selector);
        if (els.length > 0) {
            recipe.instructions = Array.from(els).map(el => el.textContent.trim()).filter(Boolean);
            break;
        }
    }

    // If still no instructions, try to find a paragraph-based format
    if (recipe.instructions.length === 0) {
        const instructionContainers = doc.querySelectorAll('.instructions, .directions, .recipe-directions, .method');
        for (const container of instructionContainers) {
            const paragraphs = container.querySelectorAll('p');
            if (paragraphs.length > 0) {
                recipe.instructions = Array.from(paragraphs).map(p => p.textContent.trim()).filter(Boolean);
                break;
            }
        }
    }

    return recipe;
}

// Parse recipe from pasted HTML/text content
async function parseRecipeFromHtml(content, sourceUrl = '') {
    // If Claude API is available, use it for best results
    if (hasApiKey()) {
        // Extract text content for Claude
        let textContent = content;
        const isHtml = content.includes('<') && content.includes('>');

        if (isHtml) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            textContent = extractCleanText(doc);
        }

        try {
            return await extractRecipeWithClaude(textContent, sourceUrl);
        } catch (error) {
            console.error('Claude extraction failed, falling back to heuristic:', error);
            // Fall through to heuristic parsing
        }
    }

    // Fallback: heuristic parsing (no API key or Claude failed)
    const isHtml = content.includes('<') && content.includes('>');

    if (isHtml) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/html');

        // Try JSON-LD first (most reliable)
        const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
            try {
                const data = JSON.parse(script.textContent);
                const recipeData = findRecipeInJsonLd(data);
                if (recipeData) {
                    const recipe = parseJsonLdRecipe(recipeData, sourceUrl);
                    recipe.ingredients = recipe.ingredients.map(convertToMetric);
                    recipe.instructions = recipe.instructions.map(convertToMetric);
                    return recipe;
                }
            } catch (e) {
                // Continue to fallback
            }
        }

        // Try heuristic HTML parsing
        const recipe = parseRecipeHeuristically(doc, sourceUrl);
        if (recipe.ingredients.length > 0) {
            recipe.ingredients = recipe.ingredients.map(convertToMetric);
            recipe.instructions = recipe.instructions.map(convertToMetric);
            return recipe;
        }

        // Fall back to text extraction from HTML
        const textContent = extractCleanText(doc);
        return parseRecipeFromText(textContent, sourceUrl);

    } else {
        // Plain text - parse intelligently
        return parseRecipeFromText(content, sourceUrl);
    }
}

// Extract clean text from HTML, removing noise
function extractCleanText(doc) {
    // Remove script, style, nav, header, footer, aside elements
    const removeSelectors = [
        'script', 'style', 'nav', 'header', 'footer', 'aside',
        '.advertisement', '.ad', '.sidebar', '.comments', '.social',
        '.share', '.related', '.newsletter', '.popup', '[role="navigation"]',
        '.nav', '.menu', '.breadcrumb', '.author-bio', '.post-meta'
    ];

    removeSelectors.forEach(selector => {
        doc.querySelectorAll(selector).forEach(el => el.remove());
    });

    return doc.body ? doc.body.textContent : doc.textContent;
}

// Noise words/phrases to filter out
const NOISE_PATTERNS = [
    /^(skip to|jump to|print|save|share|pin|tweet|facebook|instagram|pinterest|email|subscribe)/i,
    /^(advertisement|sponsored|related|you may also|recommended)/i,
    /^(read more|see more|view all|click here|learn more)/i,
    /^(comments?|leave a reply|reviews?|\d+ stars?)/i,
    /^(prep time|cook time|total time|servings?|yield|calories|nutrition)/i,
    /^(course|cuisine|keyword|author|published|updated)/i,
    /^\s*[\u2605\u2606\u2b50]+\s*$/,  // Star ratings
    /^(menu|home|about|contact|privacy|terms|copyright)/i,
    /^(search|login|sign up|cart|checkout)/i,
    /^\d+\s*(min|mins|minutes|hour|hours|hr|hrs)$/i,  // Just time values
    /^(rate this|did you make|tag us|follow us)/i,
];

// Check if a line is likely noise
function isNoiseLine(line) {
    const trimmed = line.trim();
    if (trimmed.length < 3) return true;
    if (trimmed.length > 300) return true;  // Too long, probably a paragraph of blog text

    for (const pattern of NOISE_PATTERNS) {
        if (pattern.test(trimmed)) return true;
    }

    // Check for typical website navigation/UI patterns
    if (/^[\W\s]*$/.test(trimmed)) return true;  // Only symbols/whitespace
    if (/^(×|x|close|cancel|ok|yes|no)$/i.test(trimmed)) return true;

    return false;
}

// Check if line looks like an ingredient
function looksLikeIngredient(line) {
    const trimmed = line.trim();

    // Must be reasonable length
    if (trimmed.length < 3 || trimmed.length > 150) return false;

    // Common ingredient patterns
    const patterns = [
        /^\d/, // Starts with number
        /^[½⅓⅔¼¾⅛⅜⅝⅞]/, // Starts with fraction
        /^(one|two|three|four|five|six|seven|eight|nine|ten|a |an )\s/i,
        /\d+\s*(cup|tbsp|tsp|tablespoon|teaspoon|oz|ounce|lb|pound|g|gram|ml|liter|pinch|dash|bunch|clove|can|package|pkg|stick|slice|piece)/i,
        /^(salt|pepper|oil|butter|sugar|flour|egg|milk|water|garlic|onion|chicken|beef|pork|fish)/i,
    ];

    for (const pattern of patterns) {
        if (pattern.test(trimmed)) return true;
    }

    // Contains measurement words
    if (/\b(cup|tbsp|tsp|tablespoon|teaspoon|ounce|pound|gram|ml|liter|chopped|diced|minced|sliced|fresh|dried)\b/i.test(trimmed)) {
        return true;
    }

    return false;
}

// Check if line looks like an instruction step
function looksLikeInstruction(line) {
    const trimmed = line.trim();

    // Must be reasonable length (instructions are usually longer than ingredients)
    if (trimmed.length < 15 || trimmed.length > 500) return false;

    // Starts with step number or action verb
    const patterns = [
        /^\d+[\.\)]\s/,  // "1. " or "1) "
        /^step\s*\d/i,   // "Step 1"
        /^(preheat|heat|add|mix|stir|combine|pour|place|put|cook|bake|fry|boil|simmer|whisk|beat|fold|knead|roll|spread|brush|drizzle|sprinkle|season|serve|remove|transfer|let|allow|set|cover|refrigerate|freeze|slice|dice|chop|mince|grate|melt|sauté|roast|grill|blend|puree|strain|drain|rinse|wash|dry|pat|toss|coat|dip|marinate|stuff|fill|layer|arrange|garnish|top|finish)\b/i,
    ];

    for (const pattern of patterns) {
        if (pattern.test(trimmed)) return true;
    }

    // Contains cooking action verbs (even mid-sentence)
    const actionVerbs = /(preheat|heat|add|mix|stir|combine|pour|cook|bake|fry|boil|simmer|whisk|beat|fold|knead|roll|until|minutes|degrees|oven)/i;
    if (actionVerbs.test(trimmed) && trimmed.length > 30) {
        return true;
    }

    return false;
}

// Parse recipe from plain text (the smart parser)
function parseRecipeFromText(text, sourceUrl = '') {
    const recipe = {
        title: '',
        ingredients: [],
        instructions: [],
        source: sourceUrl,
        notes: ''
    };

    // Split into lines and clean
    const lines = text.split(/\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .filter(l => !isNoiseLine(l));

    // Find title - look for a reasonable title near the start
    // Skip obvious non-titles
    for (let i = 0; i < Math.min(20, lines.length); i++) {
        const line = lines[i];
        if (line.length >= 5 && line.length <= 80) {
            // Skip if it looks like an ingredient or instruction
            if (looksLikeIngredient(line)) continue;
            if (looksLikeInstruction(line)) continue;
            // Skip if it's a section header
            if (/^(ingredients?|instructions?|directions?|method|steps?|notes?)$/i.test(line)) continue;

            recipe.title = line;
            break;
        }
    }

    // Collect all potential ingredients and instructions
    let inIngredients = false;
    let inInstructions = false;
    const potentialIngredients = [];
    const potentialInstructions = [];

    for (const line of lines) {
        const lower = line.toLowerCase();

        // Detect section headers
        if (/^ingredients?:?$/i.test(line) || lower === 'what you need' || lower === 'you will need') {
            inIngredients = true;
            inInstructions = false;
            continue;
        }
        if (/^(instructions?|directions?|method|steps?|how to make|preparation):?$/i.test(line)) {
            inIngredients = false;
            inInstructions = true;
            continue;
        }
        if (/^(notes?|tips?|variations?):?$/i.test(line)) {
            inIngredients = false;
            inInstructions = false;
            continue;
        }

        // Skip the title
        if (line === recipe.title) continue;

        // Categorize based on context and content
        if (inIngredients) {
            if (looksLikeIngredient(line) || line.length < 80) {
                potentialIngredients.push(cleanIngredient(line));
            }
        } else if (inInstructions) {
            if (looksLikeInstruction(line) || line.length > 20) {
                potentialInstructions.push(cleanInstruction(line));
            }
        } else {
            // Auto-detect
            if (looksLikeIngredient(line)) {
                potentialIngredients.push(cleanIngredient(line));
            } else if (looksLikeInstruction(line)) {
                potentialInstructions.push(cleanInstruction(line));
            }
        }
    }

    // Filter and dedupe
    recipe.ingredients = [...new Set(potentialIngredients)]
        .filter(i => i.length > 2)
        .map(convertToMetric);

    recipe.instructions = [...new Set(potentialInstructions)]
        .filter(i => i.length > 10)
        .map(convertToMetric);

    return recipe;
}

// Clean up ingredient line
function cleanIngredient(line) {
    return line
        .replace(/^[\-\*\•\u2022\u25E6\u25AA\u25CF]\s*/, '')  // Remove bullets
        .replace(/^\d+[\.\)]\s*/, '')  // Remove numbering
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .trim();
}

// Clean up instruction line
function cleanInstruction(line) {
    return line
        .replace(/^[\-\*\•\u2022]\s*/, '')  // Remove bullets
        .replace(/^\d+[\.\)]\s*/, '')  // Remove step numbers (we'll re-add them)
        .replace(/^step\s*\d+:?\s*/i, '')  // Remove "Step X:"
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .trim();
}

export {
    convertToMetric,
    fetchRecipeFromUrl,
    parseRecipeFromHtml,
    extractRecipeWithClaude,
    extractRecipeFromPhotos,
    processPDFBulkImport,
};
