// Add a recipe: from a link, photo, pasted text, typed in, or a PDF.
// The reading itself happens in extract.js (ported from v1).

import { h, icon, replaceChildren, toast, safeUrl } from '../dom.js';
import { state, on, addRecipe } from '../store.js';
import { go, back, replace, paths } from '../router.js';
import { fetchRecipeFromUrl, parseRecipeFromHtml, extractRecipeFromPhotos, processPDFBulkImport } from '../extract.js';
import { translateError } from '../messages.js';
import { listState } from '../viewstate.js';
import { recipeForm } from './form.js';

const TABS = [
    ['link', 'Link'],
    ['photo', 'Photo'],
    ['paste', 'Paste'],
    ['manual', 'Type it in'],
    ['pdf', 'PDF'],
];
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const MAX_PHOTO_EDGE = 1568; // larger adds nothing for the model and only costs upload time

let lastTab = 'link';

// A new recipe goes into the collection you were looking at.
function currentFolderId() {
    return state.folders.some(f => f.id === listState.filter) ? listState.filter : '';
}

function save(data, message = 'Recipe added') {
    if (!data?.title || !(data.ingredients?.length || data.instructions?.length)) {
        throw new Error('No recipe found');
    }
    const recipe = addRecipe({ ...data, folderId: data.folderId || currentFolderId() });
    // Replace the add screen, so "back" goes to the list and not to the form.
    replace(paths.recipe(recipe.id));
    toast(message);
}

/** Button that locks while working and changes its label. */
function busyButton(label, busyLabel, task) {
    const button = h('button', { class: 'btn btn-primary btn-wide', type: 'button' }, label);
    button.addEventListener('click', async () => {
        if (button.disabled) return;
        button.disabled = true;
        button.textContent = busyLabel;
        try {
            await task();
        } catch (error) {
            toast(translateError(error), { tone: 'error', duration: 7000 });
        } finally {
            button.disabled = false;
            button.textContent = label;
        }
    });
    return button;
}

function keyNotice(text) {
    return h('p', { class: 'notice' }, text, ' ',
        h('a', { href: `#/${paths.settings}`, onclick: e => { e.preventDefault(); go(paths.settings); } }, 'Go to settings'));
}

function downscale(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve({ base64: canvas.toDataURL('image/jpeg', 0.85), type: 'image/jpeg', name: file.name });
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This photo could not be read.')); };
        img.src = url;
    });
}

function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = h('script', { src: PDFJS });
        script.onload = resolve;
        script.onerror = () => reject(new Error('PDF library not loaded'));
        document.head.appendChild(script);
    });
}

// --- The five ways ---

function linkTab() {
    const input = h('input', { class: 'input', type: 'url', inputmode: 'url', placeholder: 'https://', autocomplete: 'off', 'aria-label': 'Link to the recipe' });
    const button = busyButton('Get recipe', 'Getting recipe…', async () => {
        const url = safeUrl(input.value.trim());
        if (!url) { toast('Paste a full link that starts with https://', { tone: 'error' }); input.focus(); return; }
        save(await fetchRecipeFromUrl(url));
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); button.click(); } });
    return [
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Link to the recipe'), input),
        !state.settings.apiKey && keyNotice('Without an API key this only works on sites that publish their recipe in a structured way. Quantities are then converted roughly.'),
        button,
    ];
}

function photoTab() {
    let photos = [];
    const previews = h('div', { class: 'photos' });
    const picker = attrs => {
        const input = h('input', { type: 'file', accept: 'image/*', hidden: true, ...attrs });
        input.addEventListener('change', async () => {
            for (const file of input.files) {
                try { photos.push(await downscale(file)); } catch (error) { toast(error.message, { tone: 'error' }); }
            }
            input.value = '';
            renderPreviews();
        });
        return input;
    };
    const cameraInput = picker({ capture: 'environment' });
    const libraryInput = picker({ multiple: true });
    const button = busyButton('Read recipe', 'Reading recipe…', async () => {
        if (photos.length === 0) { toast('Add a photo first', { tone: 'error' }); return; }
        save(await extractRecipeFromPhotos(photos));
    });

    function renderPreviews() {
        replaceChildren(previews, photos.map((photo, index) => h('div', { class: 'photo' },
            h('img', { src: photo.base64, alt: `Photo ${index + 1}` }),
            h('button', {
                class: 'photo-remove', type: 'button', 'aria-label': `Remove photo ${index + 1}`,
                onclick: () => { photos = photos.filter((_, i) => i !== index); renderPreviews(); },
            }, icon('close')),
        )));
        button.hidden = photos.length === 0;
    }
    renderPreviews();

    if (!state.settings.apiKey) return [keyNotice('Reading photos needs a Claude API key.')];
    return [
        h('p', { class: 'muted' }, 'Photograph a recipe from a book or magazine. Several pages of the same recipe are fine.'),
        h('div', { class: 'button-row' },
            h('button', { class: 'btn', type: 'button', onclick: () => cameraInput.click() }, icon('camera'), 'Take photo'),
            h('button', { class: 'btn', type: 'button', onclick: () => libraryInput.click() }, 'Choose from photos'),
        ),
        cameraInput, libraryInput, previews, button,
    ];
}

function pasteTab() {
    const text = h('textarea', { class: 'input', rows: 10, placeholder: 'Paste the recipe text here', 'aria-label': 'Recipe text' });
    const source = h('input', { class: 'input', type: 'url', inputmode: 'url', placeholder: 'https://', autocomplete: 'off' });
    return [
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Recipe text'), text),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Source (optional)'), source),
        !state.settings.apiKey && keyNotice('Without an API key the text is split up by guesswork. Check the result.'),
        busyButton('Read recipe', 'Reading recipe…', async () => {
            if (!text.value.trim()) { toast('Paste the recipe text first', { tone: 'error' }); text.focus(); return; }
            save(await parseRecipeFromHtml(text.value.trim(), source.value.trim()));
        }),
    ];
}

function manualTab() {
    return [recipeForm({
        defaultFolderId: currentFolderId(),
        saveLabel: 'Save recipe',
        onSave: data => save(data),
        onCancel: () => back(paths.home),
    })];
}

function pdfTab() {
    if (!state.settings.apiKey) return [keyNotice('Reading a PDF needs a Claude API key.')];

    let found = [];
    const input = h('input', { type: 'file', accept: 'application/pdf', hidden: true });
    const status = h('p', { class: 'form-status', role: 'status' });
    const results = h('div');
    const choose = h('button', { class: 'btn btn-wide', type: 'button', onclick: () => input.click() }, 'Choose a PDF');

    function renderResults() {
        if (found.length === 0) { replaceChildren(results); return; }
        const selected = () => found.filter(item => item.on);
        const importButton = h('button', { class: 'btn btn-primary btn-wide', type: 'button' });
        const refresh = () => {
            const n = selected().length;
            importButton.textContent = n === 1 ? 'Add 1 recipe' : `Add ${n} recipes`;
            importButton.disabled = n === 0;
        };
        importButton.addEventListener('click', () => {
            const folderId = currentFolderId();
            selected().forEach(item => addRecipe({ ...item.recipe, folderId }));
            const n = selected().length;
            toast(n === 1 ? '1 recipe added' : `${n} recipes added`);
            replace(paths.home);
        });
        replaceChildren(results,
            h('ul', { class: 'ingredients' }, found.map(item => {
                const row = h('button', { class: 'ingredient', type: 'button', role: 'checkbox', 'aria-checked': 'true' },
                    h('span', { class: 'checkbox is-on' }, icon('check')),
                    h('span', { class: 'ingredient-text' }, item.recipe.title),
                );
                row.addEventListener('click', () => {
                    item.on = !item.on;
                    row.setAttribute('aria-checked', String(item.on));
                    row.classList.toggle('is-off', !item.on);
                    row.querySelector('.checkbox').classList.toggle('is-on', item.on);
                    refresh();
                });
                return h('li', null, row);
            })),
            importButton,
        );
        refresh();
    }

    input.addEventListener('change', async () => {
        const file = input.files[0];
        input.value = '';
        if (!file) return;
        choose.disabled = true;
        found = [];
        renderResults();
        try {
            status.textContent = 'Loading PDF reader…';
            await loadPdfJs();
            const recipes = await processPDFBulkImport(file, (phase, done, total) => {
                status.textContent = phase === 'reading'
                    ? `Reading page ${done} of ${total}…`
                    : `Looking for recipes, part ${Math.max(done, 1)} of ${total}…`;
            });
            found = recipes.map(recipe => ({ recipe, on: true }));
            status.textContent = found.length === 0
                ? 'No recipes found in this PDF.'
                : `Found ${found.length} ${found.length === 1 ? 'recipe' : 'recipes'} in ${file.name}.`;
            renderResults();
        } catch (error) {
            status.textContent = translateError(error);
        } finally {
            choose.disabled = false;
        }
    });

    return [
        h('p', { class: 'muted' }, 'Read in a whole cookbook in one go. This can take a few minutes.'),
        choose, input, status, results,
    ];
}

const BUILDERS = { link: linkTab, photo: photoTab, paste: pasteTab, manual: manualTab, pdf: pdfTab };

export function mountAdd(container) {
    const tabs = h('div', { class: 'segmented segmented-wide', role: 'tablist' });
    const panel = h('div', { class: 'panel', role: 'tabpanel' });

    function show(tab) {
        lastTab = tab;
        replaceChildren(tabs, TABS.map(([key, label]) => h('button', {
            class: `segment${key === tab ? ' is-selected' : ''}`, type: 'button',
            role: 'tab', 'aria-selected': String(key === tab), onclick: () => show(key),
        }, label)));
        replaceChildren(panel, BUILDERS[tab]());
    }

    replaceChildren(container,
        h('header', { class: 'topbar' },
            h('button', { class: 'btn btn-quiet back-btn', type: 'button', onclick: () => back(paths.home) }, icon('back'), 'Recipes'),
        ),
        h('div', { class: 'page' },
            h('h1', { class: 'page-title' }, 'Add recipe'),
            tabs,
            panel,
        ),
    );
    show(lastTab);

    // If the API key arrives while this screen is open, the notice disappears.
    // Not on the type-it-in tab: the form would be emptied.
    let hadKey = !!state.settings.apiKey;
    const stop = on('settings', () => {
        const hasKey = !!state.settings.apiKey;
        if (hasKey !== hadKey && lastTab !== 'manual') show(lastTab);
        hadKey = hasKey;
    });
    return { destroy: stop };
}
