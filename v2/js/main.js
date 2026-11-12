// Opstarten en schermen wisselen.
//
// Indeling: links de lijst, rechts het geopende scherm. Op een telefoon is er
// één tegelijk zichtbaar (zie data-route in de css). De lijst wordt nooit
// afgebroken, dus scrollpositie, zoekterm en filter blijven staan.

import { h, icon, replaceChildren, toast, dismissToast } from './dom.js';
import { state, on, init as initStore, signIn, getRecipe, updateRecipe, currentModel } from './store.js';
import { start as startRouter, back, replace, paths } from './router.js';
import { config as extractConfig } from './extract.js';
import { applyTheme } from './theme.js';
import { mountHome } from './views/home.js';
import { mountRecipe } from './views/recipe.js';
import { mountCook } from './views/cook.js';
import { mountAdd } from './views/add.js';
import { mountSettings } from './views/settings.js';
import { recipeForm } from './views/form.js';

const root = document.getElementById('app');
let home = null;
let current = null;     // { destroy() } van het scherm rechts
let currentKey = null;  // welk scherm daar nu staat
let overlayView = null; // de kookstand, als die open is
let currentRoute = { name: 'home' };
let panes = null;

applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());

extractConfig.apiKey = () => state.settings.apiKey;
extractConfig.model = () => currentModel();

// --- Aanmeldscherm ---

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
    const button = h('button', { class: 'btn btn-primary btn-wide', type: 'button' }, 'Aanmelden met Google');
    button.addEventListener('click', async () => {
        button.disabled = true;
        error.textContent = '';
        try {
            await signIn();
        } catch (e) {
            const code = e?.code || '';
            error.textContent = code === 'auth/popup-blocked' ? 'De pop-up werd geblokkeerd. Sta pop-ups toe voor deze site.'
                : code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' ? 'Aanmelden afgebroken.'
                : code === 'auth/network-request-failed' ? 'Geen verbinding. Probeer het opnieuw.'
                : 'Aanmelden lukte niet. Probeer het opnieuw.';
        } finally {
            button.disabled = false;
        }
    });
    root.dataset.route = 'login';
    replaceChildren(root, h('div', { class: 'login' },
        h('h1', { class: 'app-title' }, 'Recepten'),
        h('p', { class: 'muted' }, 'Meld je aan om je recepten te zien. Ze worden bewaard bij je Google-account.'),
        button,
        error,
    ));
}

// --- De app zelf ---

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
        // Na deze schermwissel doorsturen, niet er middenin.
        queueMicrotask(() => replace(state.loaded ? paths.home : paths.recipe(id)));
        return placeholder(container);
    }
    const done = () => back(paths.recipe(id));
    replaceChildren(container,
        h('header', { class: 'topbar' },
            h('button', { class: 'btn btn-quiet back-btn', type: 'button', onclick: done }, icon('back'), 'Terug'),
        ),
        h('div', { class: 'page' },
            h('h1', { class: 'page-title' }, 'Recept bewerken'),
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
        h('p', null, state.recipes.length ? 'Kies een recept uit de lijst.' : ''),
    ));
    return {};
}

function showRoute(route) {
    currentRoute = route;
    if (!state.user) return;
    if (!panes) renderShell();

    const { mainPane, overlay } = panes;
    dismissToast(); // een melding hoort bij het scherm waar hij ontstond
    root.dataset.route = route.name;
    home.setActive(route.id || null);

    // De kookstand ligt over het recept heen. Het recept eronder blijft staan,
    // zodat je na het koken terugkomt waar je was.
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
    toast('Opslaan in de cloud lukte niet. De wijziging staat alleen op dit apparaat.', { tone: 'error', duration: 7000 });
});

initStore();
startRouter(showRoute);

// Eigen service worker voor /v2/, zodat die van v1 deze bestanden niet vasthoudt.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Service worker niet geregistreerd', error));
    });
}
