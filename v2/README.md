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
| `js/shopping.js` | Shopping list: parsing items, prices, comparing the stores. Pure functions, tested |
| `js/viewstate.js` | Scale, checks and current step per recipe |
| `js/extract.js` | Reading recipes from a link, photo, text or PDF. Ported from v1 |
| `js/messages.js` | Friendly wording for the error messages from `extract.js` |
| `js/dom.js` | Building elements, dialogs, toasts |
| `js/views/` | One file per screen |

## Testing

```bash
node --test v2/tests/*.mjs
```

## Shopping list

Ingredients from a recipe ("Add to list") and items you type end up on one
list, stored in `users/{uid}/settings/shopping`. For every item you can enter
the price at Albert Heijn and at Jumbo. Prices are remembered per product, so
they are still there the next time the product is on the list.

Limits, on purpose:

- Prices are typed by hand. Neither store has a public price API, and the app
  has no server of its own to fetch them.
- The verdict ("AH is €1.20 cheaper") only counts items priced at both stores.
  Otherwise the store with fewer prices filled in would look cheaper.
- "Shop at AH" opens a search on ah.nl per item. Ordering and paying happen on
  the store's site. The app cannot place an order.

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
