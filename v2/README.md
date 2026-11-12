# Recepten v2

Nieuwe versie van de receptenapp. Staat naast de oude app (de map hierboven) en
werkt op dezelfde Firebase-data. Je kunt beide door elkaar gebruiken.

Geen buildstap. Het zijn losse ES-modules die de browser direct laadt.

## Indeling

| Bestand | Wat het doet |
|---|---|
| `js/main.js` | Opstarten, aanmelden, schermen wisselen |
| `js/store.js` | Recepten, collecties, instellingen. Enige plek die naar Firebase schrijft |
| `js/firebase.js` | Dunne laag om de Firebase SDK |
| `js/router.js` | Navigatie via de hash, zodat de terugknop werkt |
| `js/quantity.js` | Hoeveelheden schalen en zoeken. Pure functies, getest |
| `js/viewstate.js` | Schaal, vinkjes en huidige stap per recept |
| `js/extract.js` | Uitlezen via link, foto, tekst en PDF. Overgenomen uit v1 |
| `js/messages.js` | Nederlandse vertaling van foutmeldingen uit `extract.js` |
| `js/dom.js` | Elementen bouwen, dialogen, meldingen |
| `js/views/` | Eén bestand per scherm |

## Testen

```bash
node --test v2/tests/quantity.test.mjs
```

## Afspraken in de code

- Data van de gebruiker of van internet gaat nooit via `innerHTML`. Gebruik `h()` uit `dom.js`.
- Schermen schrijven niet zelf naar Firebase. Dat doet `store.js`.
- Een wijziging stuurt alleen de gewijzigde velden (merge), zodat twee apparaten elkaar niet overschrijven.
- Wat je tijdens het koken instelt (schaal, vinkjes) staat los van de receptdata. Een sync-update wist het niet.
