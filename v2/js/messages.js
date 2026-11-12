// Foutmeldingen uit de uitleescode (extract.js) zijn Engels. Hier worden ze
// vertaald voordat de gebruiker ze ziet. Onbekende meldingen krijgen een
// algemene Nederlandse zin, met het origineel erachter voor wie wil zoeken.

const TRANSLATIONS = [
    [/add your Claude API key|API key in Settings/i, 'Vul eerst je Claude API key in bij Instellingen.'],
    [/Invalid API key/i, 'De API key klopt niet. Controleer hem bij Instellingen.'],
    [/forbidden|browser access/i, 'Deze API key mag niet vanuit de browser gebruikt worden. Zet "browser access" aan in de Anthropic Console.'],
    [/No recipe found/i, 'Geen recept gevonden in deze inhoud.'],
    [/Could not fetch that page/i, 'Deze pagina kon niet worden opgehaald. Probeer Plakken of Zelf typen.'],
    [/page proxies are unavailable|All proxies failed/i, 'De pagina kon niet worden opgehaald. Vul een API key in, of gebruik Plakken of Zelf typen.'],
    [/timed out/i, 'Het duurde te lang. Probeer het opnieuw.'],
    [/Rate limit|429/i, 'Te veel verzoeken achter elkaar. Wacht even en probeer opnieuw.'],
    [/Could not parse the recipe/i, 'Het antwoord kon niet worden gelezen. Probeer het opnieuw.'],
    [/Empty response/i, 'Er kwam een leeg antwoord terug. Probeer het opnieuw.'],
    [/No photos/i, 'Voeg eerst een foto toe.'],
    [/PDF library not loaded/i, 'De PDF-lezer kon niet worden geladen. Controleer je verbinding.'],
    [/Could not read the PDF|Could not open PDF/i, 'Deze PDF kon niet worden geopend. Hij is mogelijk beschadigd of beveiligd.'],
    [/No readable text found/i, 'Geen leesbare tekst gevonden. De PDF bestaat waarschijnlijk uit scans. Gebruik dan Foto.'],
    [/Failed to fetch|NetworkError|Load failed/i, 'Geen verbinding. Controleer je internet en probeer opnieuw.'],
];

export function translateError(error) {
    const original = String(error?.message || error || '');
    for (const [pattern, dutch] of TRANSLATIONS) {
        if (pattern.test(original)) return dutch;
    }
    return original ? `Er ging iets mis: ${original}` : 'Er ging iets mis.';
}
