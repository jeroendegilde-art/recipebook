// The recipe form. Used for editing and for typing a recipe in.

import { h, toast, confirmDialog } from '../dom.js';
import { state } from '../store.js';

const lines = text => text.split('\n').map(line => line.trim()).filter(Boolean);

/**
 * @param recipe   existing recipe, or {} for a new recipe
 * @param onSave   receives the filled-in fields
 * @param onCancel called on cancel
 */
export function recipeForm({ recipe = {}, defaultFolderId = '', saveLabel = 'Save', onSave, onCancel }) {
    let dirty = false;
    const field = (label, control, hint) => h('label', { class: 'field' },
        h('span', { class: 'field-label' }, label),
        control,
        hint && h('span', { class: 'field-hint' }, hint),
    );

    const title = h('input', { class: 'input', type: 'text', name: 'title', required: true, value: recipe.title || '', autocomplete: 'off' });
    const servings = h('input', { class: 'input', type: 'text', name: 'servings', value: recipe.servings || '', placeholder: '4 servings', autocomplete: 'off' });
    const folder = h('select', { class: 'input', name: 'folder' },
        h('option', { value: '' }, 'No collection'),
        state.folders.map(f => h('option', { value: f.id }, f.name)),
    );
    folder.value = recipe.folderId ?? defaultFolderId;
    const ingredients = h('textarea', { class: 'input', name: 'ingredients', rows: 9, placeholder: '400 g spaghetti\n150 g guanciale\n4 eggs' });
    ingredients.value = (recipe.ingredients || []).join('\n');
    const instructions = h('textarea', { class: 'input', name: 'instructions', rows: 9, placeholder: 'Cook the pasta.\nFry the guanciale until crisp.' });
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
                // Step numbering does not belong in the text; the app adds it itself.
                instructions: lines(instructions.value).map(step => step.replace(/^(?:(?:step|stap)\s*)?\d+[.):]\s+/i, '')),
                notes: notes.value.trim(),
                source: source.value.trim(),
                image: image.value.trim(),
            };
            if (!data.title) { toast('Give the recipe a title', { tone: 'error' }); title.focus(); return; }
            if (data.ingredients.length === 0 && data.instructions.length === 0) {
                toast('Add ingredients or a method', { tone: 'error' });
                ingredients.focus();
                return;
            }
            dirty = false;
            onSave(data);
        },
    },
        field('Title', title),
        h('div', { class: 'field-row' },
            field('Servings', servings),
            field('Collection', folder),
        ),
        field('Ingredients', ingredients, 'One per line. A line that ends with a colon becomes a heading.'),
        field('Method', instructions, 'One step per line.'),
        field('Notes', notes),
        field('Source', source),
        field('Image', image, 'Link to a photo. Leave empty for no photo.'),
        h('div', { class: 'form-actions' },
            h('button', {
                class: 'btn', type: 'button',
                onclick: async () => {
                    if (dirty && !(await confirmDialog({
                        title: 'Discard changes?', confirmLabel: 'Discard', cancelLabel: 'Keep editing', danger: true,
                    }))) return;
                    onCancel();
                },
            }, 'Cancel'),
            h('button', { class: 'btn btn-primary', type: 'submit' }, saveLabel),
        ),
    );
    return form;
}
