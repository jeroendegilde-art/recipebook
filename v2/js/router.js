// Navigatie via de hash (#/recept/abc). Elke schermwissel is een stap in de
// browsergeschiedenis, dus de terugknop van telefoon en browser werkt gewoon.

let handler = () => {};
let lastHash = null;

export function parse(hash = location.hash) {
    let parts;
    try {
        parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    } catch {
        parts = [];
    }
    const [first, second, third] = parts;

    if (!first) return { name: 'home' };
    if (first === 'nieuw') return { name: 'add' };
    if (first === 'instellingen') return { name: 'settings' };
    if (first === 'recept' && second) {
        if (third === 'koken') return { name: 'cook', id: second };
        if (third === 'bewerken') return { name: 'edit', id: second };
        return { name: 'recipe', id: second };
    }
    return { name: 'home' };
}

function dispatch() {
    if (location.hash === lastHash) return;
    lastHash = location.hash;
    handler(parse());
}

// Hoeveel stappen binnen de app liggen er achter ons? Staat in history.state,
// dus het klopt ook na herladen.
const stepsBehind = () => history.state?.rb ?? 0;

export function start(onRoute) {
    handler = onRoute;
    window.addEventListener('popstate', dispatch);
    window.addEventListener('hashchange', dispatch);
    dispatch();
}

export function go(path) {
    const target = `#/${path}`;
    if (location.hash === target || (!path && !location.hash)) return;
    history.pushState({ rb: stepsBehind() + 1 }, '', target);
    dispatch();
}

/** Vervang het huidige scherm, zonder extra stap in de geschiedenis. */
export function replace(path) {
    history.replaceState({ rb: stepsBehind() }, '', `#/${path}`);
    dispatch();
}

/** Terug naar het vorige scherm. Kwam je via een directe link, dan naar `fallback`. */
export function back(fallback = '') {
    if (stepsBehind() > 0) history.back();
    else replace(fallback);
}

export const paths = {
    home: '',
    add: 'nieuw',
    settings: 'instellingen',
    recipe: id => `recept/${encodeURIComponent(id)}`,
    cook: id => `recept/${encodeURIComponent(id)}/koken`,
    edit: id => `recept/${encodeURIComponent(id)}/bewerken`,
};
