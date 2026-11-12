// The error messages thrown by the extraction code (extract.js) are terse and
// technical. Here they are mapped to friendly wording before the user sees
// them. Unknown messages get a general sentence, followed by the original for
// anyone who wants to look it up.

const TRANSLATIONS = [
    [/add your Claude API key|API key in Settings/i, 'Add your Claude API key in Settings first.'],
    [/Invalid API key/i, 'The API key is not valid. Check it in Settings.'],
    [/forbidden|browser access/i, 'This API key cannot be used from the browser. Turn on "browser access" in the Anthropic Console.'],
    [/No recipe found/i, 'No recipe found in this content.'],
    [/Could not fetch that page/i, 'This page could not be loaded. Try Paste or Type it in.'],
    [/page proxies are unavailable|All proxies failed/i, 'The page could not be loaded. Add an API key, or use Paste or Type it in.'],
    [/timed out/i, 'That took too long. Try again.'],
    [/Rate limit|429/i, 'Too many requests in a row. Wait a moment and try again.'],
    [/Could not parse the recipe/i, 'The answer could not be read. Try again.'],
    [/Empty response/i, 'The answer came back empty. Try again.'],
    [/No photos/i, 'Add a photo first.'],
    [/PDF library not loaded/i, 'The PDF reader could not be loaded. Check your connection.'],
    [/Could not read the PDF|Could not open PDF/i, 'This PDF could not be opened. It may be damaged or protected.'],
    [/No readable text found/i, 'No readable text found. The PDF probably consists of scans. Use Photo instead.'],
    [/Failed to fetch|NetworkError|Load failed/i, 'No connection. Check your internet and try again.'],
];

export function translateError(error) {
    const original = String(error?.message || error || '');
    for (const [pattern, friendly] of TRANSLATIONS) {
        if (pattern.test(original)) return friendly;
    }
    return original ? `Something went wrong: ${original}` : 'Something went wrong.';
}
