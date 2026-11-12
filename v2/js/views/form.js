// Het receptformulier. Wordt gebruikt voor bewerken én voor zelf typen.

import { h, toast, confirmDialog } from '../dom.js';
import { state } from '../store.js';

const lines = text => text.split('\n').map(line => line.trim()).filter(Boolean);

/**
 * @param recipe   bestaand recept, of {} voor een nieuw recept
 * @param onSave   krijgt de ingevulde velden
 * @param onCancel wordt aangeroepen bij annuleren
 */
export function recipeForm({ recipe = {}, defaultFolderId = '', saveLabel = 'Opslaan', onSave, onCancel }) {
    let dirty = false;
    const field = (label, control, hint) => h('label', { class: 'field' },
        h('span', { class: 'field-label' }, label),
        control,
        hint && h('span', { class: 'field-hint' }, hint),
    );

    const title = h('input', { class: 'input', type: 'text', name: 'title', required: true, value: recipe.title || '', autocomplete: 'off' });
    const servings = h('input', { class: 'input', type: 'text', name: 'servings', value: recipe.servings || '', placeholder: '4 personen', autocomplete: 'off' });
    const folder = h('select', { class: 'input', name: 'folder' },
        h('option', { value: '' }, 'Geen collectie'),
        state.folders.map(f => h('option', { value: f.id }, f.name)),
    );
    folder.value = recipe.folderId ?? defaultFolderId;
    const ingredients = h('textarea', { class: 'input', name: 'ingredients', rows: 9, placeholder: '400 g spaghetti\n150 g guanciale\n4 eieren' });
    ingredients.value = (recipe.ingredients || []).join('\n');
    const instructions = h('textarea', { class: 'input', name: 'instructions', rows: 9, placeholder: 'Kook de pasta.\nBak het spek krokant.' });
    instructions.value = (recipe.instructions || []).join('\n');
    const notes = h('textarea', { class: 'input', name: 'notes', rows: 3 });
    notes.value = recipe.notes || '';
    const source = h('input', { class: 'input', type: 'url', name: 'source', value: recipe.source || '', placeholder: 'https://', inputmode: 'url', autocomplete: 'off' });
    const image = h('input', { class: 'input', type: 'url', name: 'image', value: recipe.image || '', placeholder: 'https://', inputmode: 'url', autocomplete: 'off' });

    const form = h('form', {
        class: 'form', novalidate: true,
        oninput: () => { dirty = true; },
        onsubmit: e => {
            e.preventDefault();
            const data = {
                title: title.value.trim(),
                servings: servings.value.trim(),
                folderId: folder.value,
                ingredients: lines(ingredients.value),
                // Nummering voor de stap hoort er niet in, die zet de app er zelf voor.
                instructions: lines(instructions.value).map(step => step.replace(/^(?:stap\s*)?\d+[.):]\s+/i, '')),
                notes: notes.value.trim(),
                source: source.value.trim(),
                image: image.value.trim(),
            };
            if (!data.title) { toast('Geef het recept een titel', { tone: 'error' }); title.focus(); return; }
            if (data.ingredients.length === 0 && data.instructions.length === 0) {
                toast('Vul ingrediënten of een bereiding in', { tone: 'error' });
                ingredients.focus();
                return;
            }
            dirty = false;
            onSave(data);
        },
    },
        field('Titel', title),
        h('div', { class: 'field-row' },
            field('Porties', servings),
            field('Collectie', folder),
        ),
        field('Ingrediënten', ingredients, 'Eén per regel. Een regel die eindigt op een dubbele punt wordt een kopje.'),
        field('Bereiding', instructions, 'Eén stap per regel.'),
        field('Notities', notes),
        field('Bron', source),
        field('Afbeelding', image, 'Link naar een foto. Laat leeg voor geen foto.'),
        h('div', { class: 'form-actions' },
            h('button', {
                class: 'btn', type: 'button',
                onclick: async () => {
                    if (dirty && !(await confirmDialog({
                        title: 'Wijzigingen weggooien?', confirmLabel: 'Weggooien', cancelLabel: 'Verder bewerken', danger: true,
                    }))) return;
                    onCancel();
                },
            }, 'Annuleren'),
            h('button', { class: 'btn btn-primary', type: 'submit' }, saveLabel),
        ),
    );
    return form;
}
