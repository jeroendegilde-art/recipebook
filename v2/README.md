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
| `js/shopping.js` | Shopping list: parsing items, packs, comparing the stores. Pure functions, tested |
| `js/catalog.js` | Store prices: downloading them and matching an item to a product. Matching is tested |
| `js/aimatch.js` | Lets Claude choose a product from the store's range |
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
list, stored in `users/{uid}/settings/shopping`. Every item shows what it costs
at Albert Heijn and at Jumbo.

Where the prices come from: the open data file of
[Checkjebon.nl](https://www.checkjebon.nl/) (MIT licensed, refreshed daily, on
GitHub). The app downloads that one file, keeps the two stores, and saves it
for half a day. It never talks to the stores themselves, so there is no server
and nothing to break when a store changes its app.

How an item gets its price, in this order:

1. A product you picked from the store's range. Remembered per product, with
   today's price every time.
2. A price you typed.
3. A product the app matched by itself. Only when the name fits exactly
   ("knoflook" is "AH Knoflook"). Looser matching goes wrong too often.

For what is left, "Choose with AI" does two things with the API key from
Settings. First it asks Claude what each item is called in a Dutch store
("ground beef" is "rundergehakt"); recipes are often in English, the stores are
not. That name is remembered per product. Then it lets Claude choose from the
candidates in the store's range.

The price shown covers the packs your amount takes: 500 g of mince is three
packs of 175 g or two of 300 g. `packsNeeded` in `js/shopping.js` does that.

Limits, on purpose:

- The verdict only counts items priced at both stores. Otherwise the store with
  fewer prices would look cheaper.
- Offers and bonus prices are not in the data.
- "5 onions" against a net of 1 kg cannot be converted: the app counts one pack.
- Without an API key, English items find nothing: search the product by hand.
- "Shop at AH" opens the product pages on ah.nl. Ordering and paying happen
  there. Neither store offers a way for an app like this to place an order.

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
