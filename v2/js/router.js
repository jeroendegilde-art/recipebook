// Navigation through the hash (#/recipe/abc). Every screen change is a step in
// the browser history, so the back button of phone and browser just works.

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
    if (first === 'new') return { name: 'add' };
    if (first === 'settings') return { name: 'settings' };
    if (first === 'recipe' && second) {
        if (third === 'cook') return { name: 'cook', id: second };
        if (third === 'edit') return { name: 'edit', id: second };
        return { name: 'recipe', id: second };
    }
    return { name: 'home' };
}

function dispatch() {
    if (location.hash === lastHash) return;
    lastHash = location.hash;
    handler(parse());
}

// How many in-app steps are behind us? Kept in history.state, so it is still
// right after a reload.
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

/** Replace the current screen, without an extra step in the history. */
export function replace(path) {
    history.replaceState({ rb: stepsBehind() }, '', `#/${path}`);
    dispatch();
}

/** Back to the previous screen. If you arrived through a direct link, go to `fallback`. */
export function back(fallback = '') {
    if (stepsBehind() > 0) history.back();
    else replace(fallback);
}

export const paths = {
    home: '',
    add: 'new',
    settings: 'settings',
    recipe: id => `recipe/${encodeURIComponent(id)}`,
    cook: id => `recipe/${encodeURIComponent(id)}/cook`,
    edit: id => `recipe/${encodeURIComponent(id)}/edit`,
};
