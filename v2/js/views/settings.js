// Settings: account, collections, AI, Nook, appearance and backup.

import { h, icon, replaceChildren, toast, confirmDialog, promptDialog } from '../dom.js';
import {
    state, on, signOut, saveSettings, currentModel, DEFAULT_MODEL,
    addFolder, renameFolder, deleteFolder, moveFolder, importRecipes,
} from '../store.js';
import { back, paths } from '../router.js';
import { translateError } from '../messages.js';

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

    // --- AI and Nook: one form, one button ---
    const apiKey = h('input', { class: 'input', type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'sk-ant-…' });
    const showKey = h('button', {
        class: 'btn btn-small', type: 'button',
        onclick: () => {
            const visible = apiKey.type === 'text';
            apiKey.type = visible ? 'password' : 'text';
            showKey.textContent = visible ? 'Show' : 'Hide';
        },
    }, 'Show');
    const model = h('select', { class: 'input' });
    const nookUrl = h('input', { class: 'input', type: 'url', inputmode: 'url', autocomplete: 'off', placeholder: 'https://' });
    const nookToken = h('input', { class: 'input', type: 'password', autocomplete: 'off', spellcheck: 'false' });
    const aiStatus = h('p', { class: 'form-status', role: 'status' });

    function fillForm() {
        if (formTouched) return; // do not overwrite what someone is typing
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
        if (!key) { single(`${current} (add an API key for the full list)`); return; }
        try {
            const models = await fetchModels(key);
            if (models.length === 0) { single(current); return; }
            replaceChildren(model,
                models.map(m => h('option', { value: m.id }, m.display_name || m.id)),
                !models.some(m => m.id === current) && h('option', { value: current }, `${current} (saved choice)`),
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
            if (!key) { aiStatus.textContent = 'Add an API key first.'; return; }
            testButton.disabled = true;
            aiStatus.textContent = 'Testing connection…';
            try {
                await testKey(key, model.value || DEFAULT_MODEL);
                aiStatus.textContent = 'The key works. Remember to save.';
                loadModels();
            } catch (error) {
                aiStatus.textContent = translateError(error);
            } finally {
                testButton.disabled = false;
            }
        },
    }, 'Test connection');

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
                toast('Settings saved');
            } catch {
                toast('Could not save. Check your connection.', { tone: 'error' });
            }
        },
    },
        section('Read recipes with AI',
            h('p', { class: 'muted' }, 'With a Claude API key the app reads recipes from links, photos and PDFs. The key is stored with your account and works on all your devices.'),
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Claude API key'),
                h('div', { class: 'input-row' }, apiKey, showKey)),
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Model'), model),
            h('div', { class: 'button-row' }, testButton),
            aiStatus,
        ),
        section('Nook shopping list',
            h('p', { class: 'muted' }, 'Fill in both fields to send ingredients to Nook.'),
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nook address'), nookUrl),
            h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Token'), nookToken),
        ),
        h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save settings')),
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
                    try { await signOut(); } catch { toast('Could not sign out', { tone: 'error' }); }
                },
            }, 'Sign out'),
        );
    }

    // --- Collections ---
    function renderFolders() {
        replaceChildren(folders,
            state.folders.length === 0
                ? h('p', { class: 'muted' }, 'No collections yet.')
                : h('ul', { class: 'folder-list' }, state.folders.map((folder, index) => {
                    const count = state.recipes.filter(r => r.folderId === folder.id).length;
                    return h('li', { class: 'folder-item' },
                        h('span', { class: 'folder-name' }, folder.name, h('span', { class: 'chip-count' }, count)),
                        h('span', { class: 'folder-actions' },
                            h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Move ${folder.name} up`, disabled: index === 0, onclick: () => moveFolder(folder.id, -1) }, icon('up')),
                            h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Move ${folder.name} down`, disabled: index === state.folders.length - 1, onclick: () => moveFolder(folder.id, 1) }, icon('down')),
                            h('button', {
                                class: 'icon-btn', type: 'button', 'aria-label': `Rename ${folder.name}`,
                                onclick: async () => {
                                    const name = await promptDialog({ title: 'Rename collection', label: 'Name', value: folder.name });
                                    if (name && name !== folder.name) renameFolder(folder.id, name);
                                },
                            }, icon('edit')),
                            h('button', {
                                class: 'icon-btn', type: 'button', 'aria-label': `Delete ${folder.name}`,
                                onclick: async () => {
                                    const ok = await confirmDialog({
                                        title: `Delete "${folder.name}"?`,
                                        body: count > 0 ? `The ${count} ${count === 1 ? 'recipe' : 'recipes'} in this collection will be kept, without a collection.` : '',
                                        confirmLabel: 'Delete', danger: true,
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
                    const name = await promptDialog({ title: 'New collection', label: 'Name', confirmLabel: 'Create' });
                    if (name) addFolder(name);
                },
            }, icon('plus'), 'New collection'),
        );
    }


    // --- Backup ---
    const importInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    importInput.addEventListener('change', async () => {
        const file = importInput.files[0];
        importInput.value = '';
        if (!file) return;
        let data;
        try {
            data = JSON.parse(await file.text());
            if (!Array.isArray(data)) throw new Error('not a list');
        } catch {
            toast('This is not a valid backup file', { tone: 'error' });
            return;
        }
        const ok = await confirmDialog({
            title: 'Restore backup?',
            body: `This file contains ${data.length} ${data.length === 1 ? 'recipe' : 'recipes'}. Recipes you already have stay unchanged. Only missing recipes are added.`,
            confirmLabel: 'Restore',
        });
        if (!ok) return;
        try {
            const { added, skipped } = await importRecipes(data);
            toast(`${added} added, ${skipped} skipped`);
        } catch {
            toast('The restore stopped halfway. Check your connection and try again.', { tone: 'error', duration: 7000 });
        }
    });

    function downloadBackup() {
        const blob = new Blob([JSON.stringify(state.recipes, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = h('a', { href: url, download: `recipes-backup-${new Date().toISOString().slice(0, 10)}.json` });
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    replaceChildren(container,
        h('header', { class: 'topbar' },
            h('button', { class: 'btn btn-quiet back-btn', type: 'button', onclick: () => back(paths.home) }, icon('back'), 'Recipes'),
        ),
        h('div', { class: 'page' },
            h('h1', { class: 'page-title' }, 'Settings'),
            section('Account', account),
            section('Collections', folders),
            form,
            section('Backup',
                h('p', { class: 'muted' }, 'Your recipes are stored in the cloud. A backup is a file to keep just in case.'),
                h('div', { class: 'button-row' },
                    h('button', { class: 'btn', type: 'button', onclick: downloadBackup }, 'Download backup'),
                    h('button', { class: 'btn', type: 'button', onclick: () => importInput.click() }, 'Restore backup'),
                ),
                importInput,
            ),
            section('About',
                h('p', { class: 'muted' }, 'This is the new version. The previous version works on the same recipes.'),
                h('a', { class: 'btn', href: '../' }, 'Open the previous version'),
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
