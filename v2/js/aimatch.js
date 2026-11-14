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
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('The AI gave no usable answer.');
    let data;
    try { data = JSON.parse(text.slice(start, end + 1)); } catch { throw new Error('The AI gave no usable answer.'); }

    const chosen = {};
    for (const task of tasks) {
        const index = data?.[task.id];
        if (Number.isInteger(index) && task.candidates[index]) chosen[task.id] = task.candidates[index];
    }
    return chosen;
}

export async function matchWithAI(tasks, { apiKey, model }) {
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
            body: JSON.stringify({
                model,
                max_tokens: 2000,
                messages: [{ role: 'user', content: buildPrompt(tasks) }],
            }),
            signal: controller.signal,
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            if (response.status === 401) throw new Error('Invalid API key. Check it in Settings.');
            throw new Error(error.error?.message || `The AI did not answer (${response.status}).`);
        }
        const data = await response.json();
        const text = (data.content || []).filter(block => block.type === 'text').map(block => block.text).join('\n');
        return parseAnswer(text, tasks);
    } catch (error) {
        throw error.name === 'AbortError' ? new Error('The AI took too long. Try again.') : error;
    } finally {
        clearTimeout(timer);
    }
}
