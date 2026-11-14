// Send ingredients to the Nook shopping list. Same API as v1.

import { toast } from '../dom.js';
import { state } from '../store.js';
import { openIngredientPicker } from './picker.js';

export function openNookSheet(recipe, factor) {
    openIngredientPicker({
        title: 'Send to Nook', recipe, factor, verb: 'Send', busyLabel: 'Sending…',
        onConfirm: async lines => {
            let data;
            try {
                const response = await fetch(`${state.settings.nookUrl}/api/shopping`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.settings.nookToken}` },
                    body: JSON.stringify({ items: lines }),
                });
                data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            } catch (error) {
                throw new Error(`Could not send to Nook: ${error.message}`);
            }
            const parts = [];
            if (data.added > 0) parts.push(`${data.added} added`);
            if (data.skipped > 0) parts.push(`${data.skipped} already on the list`);
            toast(parts.join(', ') || 'Sent to Nook');
        },
    });
}
