# Recipe Book v2

New version of the recipe app. It lives next to the old app (the folder above)
and works on the same Firebase data. You can use both side by side.

No build step. These are plain ES modules that the browser loads directly.

## Layout

| File | What it does |
|---|---|
| `js/main.js` | Startup, sign-in, switching screens |
| `js/store.js` | Recipes, collections, settings. The only place that writes to Firebase |
| `js/firebase.js` | Thin layer around the Firebase SDK |
| `js/router.js` | Navigation through the hash, so the back button works |
| `js/quantity.js` | Scaling quantities and searching. Pure functions, tested |
| `js/viewstate.js` | Scale, checks and current step per recipe |
| `js/extract.js` | Reading recipes from a link, photo, text or PDF. Ported from v1 |
| `js/messages.js` | Friendly wording for the error messages from `extract.js` |
| `js/dom.js` | Building elements, dialogs, toasts |
| `js/views/` | One file per screen |

## Testing

```bash
node --test v2/tests/quantity.test.mjs
```

## Conventions in the code

- Data from the user or from the internet never goes through `innerHTML`. Use `h()` from `dom.js`.
- Screens do not write to Firebase themselves. `store.js` does that.
- A change sends only the changed fields (merge), so two devices do not overwrite each other.
- What you set while cooking (scale, checks) is kept apart from the recipe data. A sync update does not clear it.

## Look

The design is called "The Pass": a restaurant kitchen during service. Graphite
ground, one heat-lamp orange, condensed capitals, and paper tickets as the only
light surface. Dark only, because the app is read next to a stove in the
evening. The tokens and the reasoning are at the top of `css/app.css`.

Fonts are self-hosted in `fonts/` (Sofia Sans Condensed and Hanken Grotesk,
both under the SIL Open Font License), so the app looks the same offline.
