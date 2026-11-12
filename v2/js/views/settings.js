// Instellingen: account, collecties, AI, Nook, weergave en back-up.

import { h, icon, replaceChildren, toast, confirmDialog, promptDialog } from '../dom.js';
import {
    state, on, signOut, saveSettings, currentModel, DEFAULT_MODEL,
    addFolder, renameFolder, deleteFolder, moveFolder, importRecipes,
} from '../store.js';
import { back, paths } from '../router.js';
import { translateError } from '../messages.js';
import { applyTheme, getTheme } from '../theme.js';

const API_HEADERS = key => ({
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
});

async function fetchModels(apiKey) {
    const response = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: API_HEADERS(apiKey) });
    if (!response.ok) throw new Error(`Models API ${response.status}`);
    return (await response.json()).data || [];
}

async function testKey(apiKey, model) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...API_HEADERS(apiKey) },
        body: JSON.stringify({ model, max_tokens: 10, messages: [{ role: 'user', content: 'Say "ok"' }] }),
    });
    if (response.ok) return;
    if (response.status === 401) throw new Error('Invalid API key');
    if (response.status === 403) throw new Error('browser access');
    if (response.status === 429) throw new Error('Rate limit');
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || `API error: ${response.status}`);
}

function section(title, ...children) {
    return h('section', { class: 'section settings-section' }, h('h2', null, title), children);
}

export function mountSettings(container) {
    const account = h('div');
    const folders = h('div');
    let formTouched = false;

    // --- AI en Nook: één formulier, één knop ---
    const apiKey = h('input', { class: 'input', type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'sk-ant-…' });
    const showKey = h('button', {
        class: 'btn btn-small', type: 'button',
        onclick: () => {
            const visible = apiKey.type === 'text';
            apiKey.type = visible ? 'password' : 'text';
            showKey.textContent = visible ? 'Toon' : 'Verberg';
        },
    }, 'Toon');
    const model = h('select', { class: 'input' });
    const nookUrl = h('input', { class: 'input', type: 'url', inputmode: 'url', autocomplete: 'off', placeholder: 'https://' });
    const nookToken = h('input', { class: 'input', type: 'password', autocomplete: 'off', spellcheck: 'false' });
    const aiStatus = h('p', { class: 'form-status', role: 'status' });

    function fillForm() {
        if (formTouched) return; // overschrijf niet wat iemand net intypt
        apiKey.value = state.settings.apiKey;
        nookUrl.value = state.settings.nookUrl;
        nookToken.value = state.settings.nookToken;
        loadModels();
    }

    async function loadModels() {
        const current = currentModel();
        const single = label => {
            replaceChildren(model, h('option', { value: current }, label));
            model.value = current;
        };
        const key = apiKey.value.trim();
        if (!key) { single(`${current} (vul een API key in voor de volledige lijst)`); return; }
        try {
            const models = await fetchModels(key);
            if (models.length === 0) { single(current); return; }
            replaceChildren(model,
                models.map(m => h('option', { value: m.id }, m.display_name || m.id)),
                !models.some(m => m.id === current) && h('option', { value: current }, `${current} (opgeslagen keuze)`),
            );
            model.value = current;
        } catch {
            single(current);
        }
    }

    const testButton = h('button', {
        class: 'btn', type: 'button',
        onclick: async () => {
            const key = apiKey.value.trim();
            if (!key) { aiStatus.textContent = 'Vul eerst een API key in.'; return; }
            testButton.disabled = true;
            aiStatus.textContent = 'Verbinding testen…';
            try {
                await testKey(key, model.value || DEFAULT_MODEL);
                aiStatus.textContent = 'De key werkt. Vergeet niet op te slaan.';
                loadModels();
            } catch (error) {
                aiStatus.textContent = translateError(error);
            } finally {
                testButton.disabled = false;
            }
        },
    }, 'Test verbinding');

    const form = h('form', {
        class: 'form',
        oninput: () => { formTouched = true; },
        onsubmit: async e => {
            e.preventDefault();
            try {
                await saveSettings({
                    apiKey: apiKey.value.trim(),
                    model: model.value || state.settings.model,
                    nookUrl: nookUrl.value.trim().replace(/\/+$/, ''),
                    nookToken: nookToken.value.trim(),
                });
                formTouched = false;
                aiStatus.textContent = '';
                toast('Instellingen opgeslagen');
            } catch {
                toast('Opslaan lukte niet. Controleer je verbinding.', { tone: 'error' });
            }
        },
    },
        section('Recepten uitlezen met AI',
            h('p', { class: 'muted' }, 'Met een Claude API key leest de app recepten uit links, foto\'s en PDF\'s. De key wordt bij je account bewaard en werkt op al je apparaten.'),
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Claude API key'),
                h('div', { class: 'input-row' }, apiKey, showKey)),
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Model'), model),
            h('div', { class: 'button-row' }, testButton),
            aiStatus,
        ),
        section('Nook boodschappenlijst',
            h('p', { class: 'muted' }, 'Vul beide velden in om ingrediënten naar Nook te sturen.'),
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Adres van Nook'), nookUrl),
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Token'), nookToken),
        ),
        h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Instellingen opslaan')),
    );

    // --- Account ---
    function renderAccount() {
        const user = state.user;
        if (!user) { replaceChildren(account); return; }
        replaceChildren(account,
            h('p', null, user.displayName || user.email),
            user.displayName && h('p', { class: 'muted' }, user.email),
            h('button', {
                class: 'btn', type: 'button',
                onclick: async () => {
                    try { await signOut(); } catch { toast('Afmelden lukte niet', { tone: 'error' }); }
                },
            }, 'Afmelden'),
        );
    }

    // --- Collecties ---
    function renderFolders() {
        replaceChildren(folders,
            state.folders.length === 0
                ? h('p', { class: 'muted' }, 'Nog geen collecties.')
                : h('ul', { class: 'folder-list' }, state.folders.map((folder, index) => {
                    const count = state.recipes.filter(r => r.folderId === folder.id).length;
                    return h('li', { class: 'folder-item' },
                        h('span', { class: 'folder-name' }, folder.name, h('span', { class: 'chip-count' }, count)),
                        h('span', { class: 'folder-actions' },
                            h('button', { class: 'icon-btn', type: 'button', 'aria-label': `${folder.name} omhoog`, disabled: index === 0, onclick: () => moveFolder(folder.id, -1) }, icon('up')),
                            h('button', { class: 'icon-btn', type: 'button', 'aria-label': `${folder.name} omlaag`, disabled: index === state.folders.length - 1, onclick: () => moveFolder(folder.id, 1) }, icon('down')),
                            h('button', {
                                class: 'icon-btn', type: 'button', 'aria-label': `${folder.name} hernoemen`,
                                onclick: async () => {
                                    const name = await promptDialog({ title: 'Collectie hernoemen', label: 'Naam', value: folder.name });
                                    if (name && name !== folder.name) renameFolder(folder.id, name);
                                },
                            }, icon('edit')),
                            h('button', {
                                class: 'icon-btn', type: 'button', 'aria-label': `${folder.name} verwijderen`,
                                onclick: async () => {
                                    const ok = await confirmDialog({
                                        title: `"${folder.name}" verwijderen?`,
                                        body: count > 0 ? `De ${count} recepten in deze collectie blijven bewaard, zonder collectie.` : '',
                                        confirmLabel: 'Verwijderen', danger: true,
                                    });
                                    if (ok) deleteFolder(folder.id);
                                },
                            }, icon('trash')),
                        ),
                    );
                })),
            h('button', {
                class: 'btn', type: 'button',
                onclick: async () => {
                    const name = await promptDialog({ title: 'Nieuwe collectie', label: 'Naam', confirmLabel: 'Aanmaken' });
                    if (name) addFolder(name);
                },
            }, icon('plus'), 'Nieuwe collectie'),
        );
    }

    // --- Weergave ---
    const theme = h('select', { class: 'input', 'aria-label': 'Thema', onchange: e => applyTheme(e.target.value) },
        h('option', { value: 'auto' }, 'Volgt het apparaat'),
        h('option', { value: 'light' }, 'Licht'),
        h('option', { value: 'dark' }, 'Donker'),
    );
    theme.value = getTheme();

    // --- Back-up ---
    const importInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    importInput.addEventListener('change', async () => {
        const file = importInput.files[0];
        importInput.value = '';
        if (!file) return;
        let data;
        try {
            data = JSON.parse(await file.text());
            if (!Array.isArray(data)) throw new Error('geen lijst');
        } catch {
            toast('Dit is geen geldig back-upbestand', { tone: 'error' });
            return;
        }
        const ok = await confirmDialog({
            title: 'Back-up terugzetten?',
            body: `Dit bestand bevat ${data.length} recepten. Recepten die je al hebt blijven ongewijzigd. Alleen ontbrekende recepten worden toegevoegd.`,
            confirmLabel: 'Terugzetten',
        });
        if (!ok) return;
        try {
            const { added, skipped } = await importRecipes(data);
            toast(`${added} toegevoegd, ${skipped} overgeslagen`);
        } catch {
            toast('Terugzetten is halverwege gestopt. Controleer je verbinding en probeer opnieuw.', { tone: 'error', duration: 7000 });
        }
    });

    function downloadBackup() {
        const blob = new Blob([JSON.stringify(state.recipes, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = h('a', { href: url, download: `recepten-backup-${new Date().toISOString().slice(0, 10)}.json` });
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    replaceChildren(container,
        h('header', { class: 'topbar' },
            h('button', { class: 'btn btn-quiet back-btn', type: 'button', onclick: () => back(paths.home) }, icon('back'), 'Recepten'),
        ),
        h('div', { class: 'page' },
            h('h1', { class: 'page-title' }, 'Instellingen'),
            section('Account', account),
            section('Collecties', folders),
            form,
            section('Weergave', h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Thema'), theme)),
            section('Back-up',
                h('p', { class: 'muted' }, 'Je recepten staan in de cloud. Een back-up is een bestand voor de zekerheid.'),
                h('div', { class: 'button-row' },
                    h('button', { class: 'btn', type: 'button', onclick: downloadBackup }, 'Download back-up'),
                    h('button', { class: 'btn', type: 'button', onclick: () => importInput.click() }, 'Back-up terugzetten'),
                ),
                importInput,
            ),
            section('Over',
                h('p', { class: 'muted' }, 'Dit is de nieuwe versie. De vorige versie werkt op dezelfde recepten.'),
                h('a', { class: 'btn', href: '../' }, 'Open de vorige versie'),
            ),
        ),
    );

    const stop = [
        on('settings', fillForm),
        on('folders', renderFolders),
        on('recipes', renderFolders),
        on('auth', renderAccount),
    ];
    fillForm();
    renderAccount();
    renderFolders();

    return { destroy() { stop.forEach(off => off()); } };
}
