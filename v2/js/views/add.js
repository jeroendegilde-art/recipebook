// Recept toevoegen: via link, foto, geplakte tekst, zelf typen of een PDF.
// Het uitlezen zelf gebeurt in extract.js (overgenomen uit v1).

import { h, icon, replaceChildren, toast, safeUrl } from '../dom.js';
import { state, on, addRecipe } from '../store.js';
import { go, back, replace, paths } from '../router.js';
import { fetchRecipeFromUrl, parseRecipeFromHtml, extractRecipeFromPhotos, processPDFBulkImport } from '../extract.js';
import { translateError } from '../messages.js';
import { listState } from '../viewstate.js';
import { recipeForm } from './form.js';

const TABS = [
    ['link', 'Link'],
    ['photo', 'Foto'],
    ['paste', 'Plakken'],
    ['manual', 'Zelf typen'],
    ['pdf', 'PDF'],
];
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const MAX_PHOTO_EDGE = 1568; // groter voegt voor het model niets toe en kost alleen uploadtijd

let lastTab = 'link';

// Nieuw recept komt in de collectie waar je op dat moment in keek.
function currentFolderId() {
    return state.folders.some(f => f.id === listState.filter) ? listState.filter : '';
}

function save(data, message = 'Recept toegevoegd') {
    if (!data?.title || !(data.ingredients?.length || data.instructions?.length)) {
        throw new Error('No recipe found');
    }
    const recipe = addRecipe({ ...data, folderId: data.folderId || currentFolderId() });
    // Vervang het toevoeg-scherm, zodat "terug" naar de lijst gaat en niet naar het formulier.
    replace(paths.recipe(recipe.id));
    toast(message);
}

/** Knop die tijdens het werk vergrendelt en zijn tekst aanpast. */
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
        h('a', { href: `#/${paths.settings}`, onclick: e => { e.preventDefault(); go(paths.settings); } }, 'Naar instellingen'));
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
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Deze foto kon niet worden gelezen.')); };
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

// --- De vijf manieren ---

function linkTab() {
    const input = h('input', { class: 'input', type: 'url', inputmode: 'url', placeholder: 'https://', autocomplete: 'off', 'aria-label': 'Link naar het recept' });
    const button = busyButton('Recept ophalen', 'Bezig met ophalen…', async () => {
        const url = safeUrl(input.value.trim());
        if (!url) { toast('Plak een volledige link, beginnend met https://', { tone: 'error' }); input.focus(); return; }
        save(await fetchRecipeFromUrl(url));
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); button.click(); } });
    return [
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Link naar het recept'), input),
        !state.settings.apiKey && keyNotice('Zonder API key lukt dit alleen bij sites die hun recept netjes aanbieden. Hoeveelheden worden dan grof omgerekend.'),
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
    const button = busyButton('Recept uitlezen', 'Bezig met uitlezen…', async () => {
        if (photos.length === 0) { toast('Voeg eerst een foto toe', { tone: 'error' }); return; }
        save(await extractRecipeFromPhotos(photos));
    });

    function renderPreviews() {
        replaceChildren(previews, photos.map((photo, index) => h('div', { class: 'photo' },
            h('img', { src: photo.base64, alt: `Foto ${index + 1}` }),
            h('button', {
                class: 'photo-remove', type: 'button', 'aria-label': `Verwijder foto ${index + 1}`,
                onclick: () => { photos = photos.filter((_, i) => i !== index); renderPreviews(); },
            }, icon('close')),
        )));
        button.hidden = photos.length === 0;
    }
    renderPreviews();

    if (!state.settings.apiKey) return [keyNotice('Voor het uitlezen van foto\'s is een Claude API key nodig.')];
    return [
        h('p', { class: 'muted' }, 'Fotografeer een recept uit een boek of tijdschrift. Meerdere pagina\'s van hetzelfde recept mag.'),
        h('div', { class: 'button-row' },
            h('button', { class: 'btn', type: 'button', onclick: () => cameraInput.click() }, icon('camera'), 'Maak foto'),
            h('button', { class: 'btn', type: 'button', onclick: () => libraryInput.click() }, 'Kies uit foto\'s'),
        ),
        cameraInput, libraryInput, previews, button,
    ];
}

function pasteTab() {
    const text = h('textarea', { class: 'input', rows: 10, placeholder: 'Plak hier de tekst van het recept', 'aria-label': 'Tekst van het recept' });
    const source = h('input', { class: 'input', type: 'url', inputmode: 'url', placeholder: 'https://', autocomplete: 'off' });
    return [
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Tekst van het recept'), text),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Bron (mag leeg blijven)'), source),
        !state.settings.apiKey && keyNotice('Zonder API key wordt de tekst op goed geluk ingedeeld. Controleer het resultaat.'),
        busyButton('Recept uitlezen', 'Bezig met uitlezen…', async () => {
            if (!text.value.trim()) { toast('Plak eerst de tekst van het recept', { tone: 'error' }); text.focus(); return; }
            save(await parseRecipeFromHtml(text.value.trim(), source.value.trim()));
        }),
    ];
}

function manualTab() {
    return [recipeForm({
        defaultFolderId: currentFolderId(),
        saveLabel: 'Recept opslaan',
        onSave: data => save(data),
        onCancel: () => back(paths.home),
    })];
}

function pdfTab() {
    if (!state.settings.apiKey) return [keyNotice('Voor het uitlezen van een PDF is een Claude API key nodig.')];

    let found = [];
    const input = h('input', { type: 'file', accept: 'application/pdf', hidden: true });
    const status = h('p', { class: 'form-status', role: 'status' });
    const results = h('div');
    const choose = h('button', { class: 'btn btn-wide', type: 'button', onclick: () => input.click() }, 'Kies een PDF');

    function renderResults() {
        if (found.length === 0) { replaceChildren(results); return; }
        const selected = () => found.filter(item => item.on);
        const importButton = h('button', { class: 'btn btn-primary btn-wide', type: 'button' });
        const refresh = () => {
            const n = selected().length;
            importButton.textContent = n === 1 ? 'Voeg 1 recept toe' : `Voeg ${n} recepten toe`;
            importButton.disabled = n === 0;
        };
        importButton.addEventListener('click', () => {
            const folderId = currentFolderId();
            selected().forEach(item => addRecipe({ ...item.recipe, folderId }));
            toast(`${selected().length} recepten toegevoegd`);
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
            status.textContent = 'PDF-lezer laden…';
            await loadPdfJs();
            const recipes = await processPDFBulkImport(file, (phase, done, total) => {
                status.textContent = phase === 'reading'
                    ? `Pagina ${done} van ${total} lezen…`
                    : `Recepten zoeken, deel ${Math.max(done, 1)} van ${total}…`;
            });
            found = recipes.map(recipe => ({ recipe, on: true }));
            status.textContent = found.length === 0
                ? 'Geen recepten gevonden in deze PDF.'
                : `${found.length} ${found.length === 1 ? 'recept' : 'recepten'} gevonden in ${file.name}.`;
            renderResults();
        } catch (error) {
            status.textContent = translateError(error);
        } finally {
            choose.disabled = false;
        }
    });

    return [
        h('p', { class: 'muted' }, 'Lees een heel kookboek in één keer in. Dit kan een paar minuten duren.'),
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
            h('button', { class: 'btn btn-quiet back-btn', type: 'button', onclick: () => back(paths.home) }, icon('back'), 'Recepten'),
        ),
        h('div', { class: 'page' },
            h('h1', { class: 'page-title' }, 'Recept toevoegen'),
            tabs,
            panel,
        ),
    );
    show(lastTab);

    // Komt de API key binnen terwijl dit scherm open staat, dan verdwijnt de melding.
    // Niet bij zelf typen: daar zou het formulier leeg raken.
    let hadKey = !!state.settings.apiKey;
    const stop = on('settings', () => {
        const hasKey = !!state.settings.apiKey;
        if (hasKey !== hadKey && lastTab !== 'manual') show(lastTab);
        hadKey = hasKey;
    });
    return { destroy: stop };
}
