// Let the model choose the product for list items the app could not match by
// itself. "bloem" is "AH Tarwebloem", not an air freshener: that takes
// knowing what a cook means, which word matching does not.
//
// The model only chooses from products that are really in the store's range
// today. It never makes up a product or a price.

/**
 * tasks: [{ id, item, store, candidates: [{ n, s, p }] }]
 * The prompt is a pure function of the tasks, so it can be tested.
 */
export function buildPrompt(tasks) {
    const blocks = tasks.map(task => [
        `${task.id} | ${task.store} | on the list: "${task.item}"`,
        ...task.candidates.map((c, i) => `  ${i}: ${c.n}${c.s ? ` (${c.s})` : ''}, €${c.p.toFixed(2)}`),
    ].join('\n'));

    return [
        'You help with a Dutch grocery list. For each line below, choose the product a home cook would put in the basket for that ingredient.',
        '',
        'Rules:',
        '- Choose the plain, basic version of the ingredient. Prefer the store brand over a premium brand.',
        '- The product must be the ingredient itself, not something flavoured with it or containing it.',
        '- When the line has an amount, prefer the smallest pack that covers it.',
        '- When no candidate is the ingredient, answer null. A wrong product is worse than none.',
        '',
        'Answer with one JSON object and nothing else: each id mapped to the number of the chosen candidate, or null.',
        'Example: {"t0": 2, "t1": null}',
        '',
        ...blocks,
    ].join('\n');
}

/** Read the answer. Returns { [taskId]: candidate } for valid choices only. */
export function parseAnswer(text, tasks) {
    const data = parseJson(text);
    const chosen = {};
    for (const task of tasks) {
        const index = data?.[task.id];
        if (Number.isInteger(index) && task.candidates[index]) chosen[task.id] = task.candidates[index];
    }
    return chosen;
}

/**
 * The recipes may be in English, the stores name their products in Dutch.
 * Ask for the words you would type in a Dutch store's search box.
 * items: [{ id, text }]
 */
export function buildTranslatePrompt(items) {
    return [
        'These are lines from a grocery list, possibly in English. The shop is a Dutch supermarket (Albert Heijn, Jumbo).',
        'For each line, give the Dutch product name to type in the supermarket\'s search box.',
        '',
        'Rules:',
        '- One to three words, lower case, the plain product: "2 cloves garlic, minced" -> "knoflook", "plain flour" -> "tarwebloem", "double cream" -> "slagroom".',
        '- Leave out amounts, units, packaging and how it is cut or cooked.',
        '- A line that is already Dutch: give its plain product name ("uien, gesnipperd" -> "uien").',
        '- Not something a supermarket sells (water, "salt to taste" is fine: "zout"): answer null.',
        '',
        'Answer with one JSON object and nothing else: each id mapped to the Dutch term, or null.',
        'Example: {"i0": "knoflook", "i1": null}',
        '',
        ...items.map(item => `${item.id} | ${item.text}`),
    ].join('\n');
}

/** Returns { [itemId]: term } for usable answers only. */
export function parseTranslations(text, items) {
    const data = parseJson(text);
    const terms = {};
    for (const item of items) {
        const term = data?.[item.id];
        if (typeof term !== 'string') continue;
        const clean = term.replace(/\s+/g, ' ').trim().toLowerCase();
        if (clean && clean.length <= 40) terms[item.id] = clean;
    }
    return terms;
}

function parseJson(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('The AI gave no usable answer.');
    try { return JSON.parse(text.slice(start, end + 1)); } catch { throw new Error('The AI gave no usable answer.'); }
}

async function ask(prompt, { apiKey, model }) {
    if (!apiKey) throw new Error('Add your Claude API key in Settings first.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
            signal: controller.signal,
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            if (response.status === 401) throw new Error('Invalid API key. Check it in Settings.');
            throw new Error(error.error?.message || `The AI did not answer (${response.status}).`);
        }
        const data = await response.json();
        return (data.content || []).filter(block => block.type === 'text').map(block => block.text).join('\n');
    } catch (error) {
        throw error.name === 'AbortError' ? new Error('The AI took too long. Try again.') : error;
    } finally {
        clearTimeout(timer);
    }
}

export async function matchWithAI(tasks, options) {
    return parseAnswer(await ask(buildPrompt(tasks), options), tasks);
}

export async function translateWithAI(items, options) {
    return parseTranslations(await ask(buildTranslatePrompt(items), options), items);
}
