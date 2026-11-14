// Startup and switching screens.
//
// Layout: the list on the left, the open screen on the right. On a phone only
// one is visible at a time (see data-route in the css). The list is never torn
// down, so scroll position, search term and filter stay put.

import { h, icon, replaceChildren, toast, dismissToast } from './dom.js';
import { state, on, init as initStore, signIn, getRecipe, updateRecipe, currentModel } from './store.js';
import { start as startRouter, back, replace, paths } from './router.js';
import { config as extractConfig } from './extract.js';
import { mountHome } from './views/home.js';
import { mountRecipe } from './views/recipe.js';
import { mountCook } from './views/cook.js';
import { mountAdd } from './views/add.js';
import { mountSettings } from './views/settings.js';
import { mountShopping } from './views/shopping.js';
import { recipeForm } from './views/form.js';

const root = document.getElementById('app');
let home = null;
let current = null;     // { destroy() } of the screen on the right
let currentKey = null;  // which screen is there now
let overlayView = null; // cook mode, when it is open
let currentRoute = { name: 'home' };
let panes = null;

extractConfig.apiKey = () => state.settings.apiKey;
extractConfig.model = () => currentModel();

// --- Sign-in screen ---

function renderLogin() {
    panes = null;
    home?.destroy();
    home = null;
    current?.destroy?.();
    overlayView?.destroy?.();
    current = null;
    overlayView = null;
    currentKey = null;
    const error = h('p', { class: 'form-status', role: 'alert' });
    const button = h('button', { class: 'btn btn-primary btn-wide', type: 'button' }, 'Sign in with Google');
    button.addEventListener('click', async () => {
        button.disabled = true;
        error.textContent = '';
        try {
            await signIn();
        } catch (e) {
            const code = e?.code || '';
            error.textContent = code === 'auth/popup-blocked' ? 'The pop-up was blocked. Allow pop-ups for this site.'
                : code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' ? 'Sign-in cancelled.'
                : code === 'auth/network-request-failed' ? 'No connection. Try again.'
                : 'Sign-in failed. Try again.';
        } finally {
            button.disabled = false;
        }
    });
    root.dataset.route = 'login';
    replaceChildren(root, h('div', { class: 'login' },
        h('h1', { class: 'app-title' }, 'Recipe Book'),
        h('p', { class: 'muted' }, 'Sign in to see your recipes. They are stored with your Google account.'),
        button,
        error,
    ));
}

// --- The app itself ---

function renderShell() {
    const listPane = h('aside', { class: 'pane pane-list' });
    const mainPane = h('main', { class: 'pane pane-main' });
    const overlay = h('div', { class: 'overlay', hidden: true });
    replaceChildren(root, listPane, mainPane, overlay);
    panes = { listPane, mainPane, overlay };
    home = mountHome(listPane);
}

function mountEdit(container, id) {
    const recipe = getRecipe(id);
    if (!recipe) {
        // Redirect after this screen change, not in the middle of it.
        queueMicrotask(() => replace(state.loaded ? paths.home : paths.recipe(id)));
        return placeholder(container);
    }
    const done = () => back(paths.recipe(id));
    replaceChildren(container,
        h('header', { class: 'topbar' },
            h('button', { class: 'btn btn-quiet back-btn', type: 'button', onclick: done }, icon('back'), 'Back'),
        ),
        h('div', { class: 'page' },
            h('h1', { class: 'page-title' }, 'Edit recipe'),
            recipeForm({
                recipe,
                onSave: data => { updateRecipe(id, data); done(); },
                onCancel: done,
            }),
        ),
    );
    return {};
}

function placeholder(container) {
    replaceChildren(container, h('div', { class: 'empty placeholder' },
        h('p', null, state.recipes.length ? 'Choose a recipe from the list.' : ''),
    ));
    return {};
}

function showRoute(route) {
    currentRoute = route;
    if (!state.user) return;
    if (!panes) renderShell();

    const { mainPane, overlay } = panes;
    dismissToast(); // a toast belongs to the screen where it appeared
    root.dataset.route = route.name;
    home.setActive(route.id || null);

    // Cook mode lies on top of the recipe. The recipe underneath stays mounted,
    // so after cooking you return to where you were.
    overlayView?.destroy?.();
    overlayView = null;
    overlay.hidden = route.name !== 'cook';
    replaceChildren(overlay);
    if (route.name === 'cook') overlayView = mountCook(overlay, route.id);

    const mainName = route.name === 'cook' ? 'recipe' : route.name;
    const key = `${mainName}:${route.id || ''}`;
    if (key === currentKey) return;
    currentKey = key;

    current?.destroy?.();
    mainPane.scrollTop = 0;
    if (mainName === 'recipe') current = mountRecipe(mainPane, route.id);
    else if (mainName === 'edit') current = mountEdit(mainPane, route.id);
    else if (mainName === 'add') current = mountAdd(mainPane);
    else if (mainName === 'settings') current = mountSettings(mainPane);
    else if (mainName === 'shopping') current = mountShopping(mainPane);
    else current = placeholder(mainPane);
}

on('auth', user => {
    if (!user) { renderLogin(); return; }
    panes = null;
    home?.destroy();
    home = null;
    currentKey = null;
    showRoute(currentRoute);
});

on('write-error', () => {
    toast('Could not save to the cloud. The change is only on this device.', { tone: 'error', duration: 7000 });
});

initStore();
startRouter(showRoute);

// Own service worker for /v2/, so the v1 worker does not hold on to these files.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Service worker not registered', error));
    });
}
