// Recipe Book Application
// ========================

// Storage keys
const STORAGE_KEY = 'recipeBook';
const API_KEY_STORAGE = 'recipeBookApiKey';
const FOLDERS_STORAGE = 'recipeBookFolders';

// State
let recipes = [];
let folders = [];
let currentRecipeId = null;
let currentFolderId = 'all';
let currentUser = null;
let claudeApiKey = null;
let firebaseReady = false;
let unsubscribeFirebase = null;
let unsubscribeFolders = null;
let unsubscribeUserSettings = null;

// DOM Elements
const elements = {
    sidebar: document.getElementById('sidebar'),
    recipeList: document.getElementById('recipeList'),
    mainContent: document.getElementById('mainContent'),
    emptyState: document.getElementById('emptyState'),
    recipeDetail: document.getElementById('recipeDetail'),
    searchInput: document.getElementById('searchInput'),

    // Buttons
    addRecipeBtn: document.getElementById('addRecipeBtn'),
    emptyAddBtn: document.getElementById('emptyAddBtn'),
    mobileAddBtn: document.getElementById('mobileAddBtn'),
    menuBtn: document.getElementById('menuBtn'),
    toggleTheme: document.getElementById('toggleTheme'),
    syncBtn: document.getElementById('syncBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    editRecipeBtn: document.getElementById('editRecipeBtn'),
    deleteRecipeBtn: document.getElementById('deleteRecipeBtn'),

    // Recipe detail
    recipeTitle: document.getElementById('recipeTitle'),
    recipeSource: document.getElementById('recipeSource'),
    recipeMeta: document.getElementById('recipeMeta'),
    servingsDisplay: document.getElementById('servingsDisplay'),
    servingsText: document.getElementById('servingsText'),
    copyIngredientsBtn: document.getElementById('copyIngredientsBtn'),
    ingredientsList: document.getElementById('ingredientsList'),
    instructionsList: document.getElementById('instructionsList'),
    notesSection: document.getElementById('notesSection'),
    recipeNotes: document.getElementById('recipeNotes'),

    // Add modal
    addModal: document.getElementById('addModal'),
    modalBackdrop: document.getElementById('modalBackdrop'),
    closeModalBtn: document.getElementById('closeModalBtn'),

    // Add modal tabs
    urlTab: document.getElementById('urlTab'),
    pasteTab: document.getElementById('pasteTab'),
    textTab: document.getElementById('textTab'),

    // Add modal inputs
    recipeUrl: document.getElementById('recipeUrl'),
    pasteSource: document.getElementById('pasteSource'),
    pasteHtml: document.getElementById('pasteHtml'),
    manualTitle: document.getElementById('manualTitle'),
    manualServings: document.getElementById('manualServings'),
    manualIngredients: document.getElementById('manualIngredients'),
    manualInstructions: document.getElementById('manualInstructions'),
    manualSource: document.getElementById('manualSource'),
    manualNotes: document.getElementById('manualNotes'),

    // Add modal buttons
    fetchUrlBtn: document.getElementById('fetchUrlBtn'),
    parseHtmlBtn: document.getElementById('parseHtmlBtn'),
    saveManualBtn: document.getElementById('saveManualBtn'),

    // Edit modal
    editModal: document.getElementById('editModal'),
    editModalBackdrop: document.getElementById('editModalBackdrop'),
    closeEditModalBtn: document.getElementById('closeEditModalBtn'),
    editTitle: document.getElementById('editTitle'),
    editServings: document.getElementById('editServings'),
    editIngredients: document.getElementById('editIngredients'),
    editInstructions: document.getElementById('editInstructions'),
    editSource: document.getElementById('editSource'),
    editNotes: document.getElementById('editNotes'),
    saveEditBtn: document.getElementById('saveEditBtn'),

    // Sync modal
    syncModal: document.getElementById('syncModal'),
    syncModalBackdrop: document.getElementById('syncModalBackdrop'),
    closeSyncModalBtn: document.getElementById('closeSyncModalBtn'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile'),

    // Settings modal
    settingsModal: document.getElementById('settingsModal'),
    settingsModalBackdrop: document.getElementById('settingsModalBackdrop'),
    closeSettingsModalBtn: document.getElementById('closeSettingsModalBtn'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    testApiBtn: document.getElementById('testApiBtn'),
    apiStatus: document.getElementById('apiStatus'),

    // Toast
    toastContainer: document.getElementById('toastContainer'),

    // Sync status
    syncStatus: document.getElementById('syncStatus'),
    syncStatusText: document.querySelector('.sync-status-text'),

    // Profile
    profileBtn: document.getElementById('profileBtn'),
    profileAvatar: document.getElementById('profileAvatar'),
    profileName: document.getElementById('profileName'),
    profileModal: document.getElementById('profileModal'),
    profileModalBackdrop: document.getElementById('profileModalBackdrop'),
    closeProfileModalBtn: document.getElementById('closeProfileModalBtn'),
    signedOutState: document.getElementById('signedOutState'),
    signedInState: document.getElementById('signedInState'),
    googleSignInBtn: document.getElementById('googleSignInBtn'),
    signOutBtn: document.getElementById('signOutBtn'),
    profileModalAvatar: document.getElementById('profileModalAvatar'),
    profileModalName: document.getElementById('profileModalName'),
    profileModalEmail: document.getElementById('profileModalEmail'),

    // Folders
    foldersList: document.getElementById('foldersList'),
    addFolderBtn: document.getElementById('addFolderBtn'),
    folderModal: document.getElementById('folderModal'),
    folderModalBackdrop: document.getElementById('folderModalBackdrop'),
    closeFolderModalBtn: document.getElementById('closeFolderModalBtn'),
    folderModalTitle: document.getElementById('folderModalTitle'),
    folderNameInput: document.getElementById('folderNameInput'),
    saveFolderBtn: document.getElementById('saveFolderBtn'),
    deleteFolderBtn: document.getElementById('deleteFolderBtn'),
    manualFolder: document.getElementById('manualFolder'),
    editFolder: document.getElementById('editFolder'),

    // Login screen
    loginScreen: document.getElementById('loginScreen'),
    loginGoogleBtn: document.getElementById('loginGoogleBtn'),
    loginHint: document.getElementById('loginHint'),
    app: document.getElementById('app')
};

// ============================================
// Unit Conversion
// ============================================

const conversions = {
    // Volume
    'cup': { metric: 'ml', factor: 237 },
    'cups': { metric: 'ml', factor: 237 },
    'tablespoon': { metric: 'ml', factor: 15 },
    'tablespoons': { metric: 'ml', factor: 15 },
    'tbsp': { metric: 'ml', factor: 15 },
    'teaspoon': { metric: 'ml', factor: 5 },
    'teaspoons': { metric: 'ml', factor: 5 },
    'tsp': { metric: 'ml', factor: 5 },
    'fluid ounce': { metric: 'ml', factor: 30 },
    'fluid ounces': { metric: 'ml', factor: 30 },
    'fl oz': { metric: 'ml', factor: 30 },
    'pint': { metric: 'ml', factor: 473 },
    'pints': { metric: 'ml', factor: 473 },
    'quart': { metric: 'ml', factor: 946 },
    'quarts': { metric: 'ml', factor: 946 },
    'gallon': { metric: 'L', factor: 3.785 },
    'gallons': { metric: 'L', factor: 3.785 },

    // Weight
    'ounce': { metric: 'g', factor: 28.35 },
    'ounces': { metric: 'g', factor: 28.35 },
    'oz': { metric: 'g', factor: 28.35 },
    'pound': { metric: 'g', factor: 454 },
    'pounds': { metric: 'g', factor: 454 },
    'lb': { metric: 'g', factor: 454 },
    'lbs': { metric: 'g', factor: 454 },

    // Length
    'inch': { metric: 'cm', factor: 2.54 },
    'inches': { metric: 'cm', factor: 2.54 },
    'in': { metric: 'cm', factor: 2.54 },
};

function convertToMetric(text) {
    // Convert temperatures
    text = text.replace(/(\d+)\s*°?\s*F(?:ahrenheit)?/gi, (match, temp) => {
        const celsius = Math.round((parseInt(temp) - 32) * 5 / 9);
        return `${celsius}°C`;
    });

    // Convert fractions to decimals
    const fractionMap = {
        '½': 0.5, '⅓': 0.333, '⅔': 0.667, '¼': 0.25, '¾': 0.75,
        '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8, '⅙': 0.167,
        '⅚': 0.833, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
    };

    // Build regex pattern for all units
    const unitPattern = Object.keys(conversions).join('|');
    const regex = new RegExp(
        `(\\d+)?\\s*([${Object.keys(fractionMap).join('')}]|\\d+\\/\\d+)?\\s*(${unitPattern})(?:\\s|$|,|\\.)`,
        'gi'
    );

    text = text.replace(regex, (match, whole, fraction, unit) => {
        let value = 0;

        if (whole) {
            value = parseInt(whole);
        }

        if (fraction) {
            if (fractionMap[fraction]) {
                value += fractionMap[fraction];
            } else if (fraction.includes('/')) {
                const [num, denom] = fraction.split('/');
                value += parseInt(num) / parseInt(denom);
            }
        }

        if (value === 0) value = 1;

        const unitLower = unit.toLowerCase();
        const conversion = conversions[unitLower];

        if (conversion) {
            let converted = value * conversion.factor;
            // Round nicely
            if (converted >= 100) {
                converted = Math.round(converted / 10) * 10;
            } else if (converted >= 10) {
                converted = Math.round(converted);
            } else {
                converted = Math.round(converted * 10) / 10;
            }

            // Convert ml to L if over 1000
            if (conversion.metric === 'ml' && converted >= 1000) {
                return `${(converted / 1000).toFixed(1)}L `;
            }
            // Convert g to kg if over 1000
            if (conversion.metric === 'g' && converted >= 1000) {
                return `${(converted / 1000).toFixed(1)}kg `;
            }

            return `${converted}${conversion.metric} `;
        }

        return match;
    });

    return text;
}

// ============================================
// Claude API Recipe Extraction
// ============================================

async function extractRecipeWithClaude(text, sourceUrl = '') {
    if (!claudeApiKey) {
        throw new Error('Please add your Claude API key in Settings first');
    }

    const prompt = `Extract the recipe from this text. Ignore all website navigation, ads, blog content, life stories, and other non-recipe content. Focus ONLY on the actual recipe.

Return a JSON object with exactly this structure:
{
  "title": "Recipe Name",
  "servings": "4 servings",
  "ingredients": ["ingredient 1", "ingredient 2"],
  "instructions": ["step 1", "step 2"],
  "notes": "any tips or notes"
}

IMPORTANT RULES:
1. Convert ALL measurements to metric (cups to ml, oz to grams, F to C, etc.)
2. Each ingredient should be a single line with quantity and item
3. Each instruction should be a complete step, not fragments
4. Remove any step numbers from instructions (just the text)
5. CRITICAL: Extract the servings/yield - look for "serves X", "makes X", "X servings", "X portions", "yield: X", "for X people". Format as "X servings" or "Makes X cookies" etc.
6. If servings is not explicitly stated, try to infer from context or use ""
7. Ignore prep time, cook time, ratings, comments, author info
8. If you can't find a valid recipe, return {"error": "No recipe found"}
9. Return ONLY the JSON object, no other text

TEXT TO EXTRACT FROM:
${text.substring(0, 15000)}`;

    try {
        console.log('Calling Claude API...');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': claudeApiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 2048,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Claude API error response:', response.status, errorData);

            if (response.status === 401) {
                throw new Error('Invalid API key. Please check your Claude API key in Settings.');
            }
            if (response.status === 403) {
                throw new Error('API access forbidden. Make sure your API key has browser access enabled in the Anthropic Console.');
            }
            if (response.status === 429) {
                throw new Error('Rate limit exceeded. Please wait a moment and try again.');
            }
            if (response.status === 500 || response.status === 502 || response.status === 503) {
                throw new Error('Claude API is temporarily unavailable. Please try again later.');
            }

            const errorMsg = errorData.error?.message || `API error: ${response.status}`;
            throw new Error(errorMsg);
        }

        const data = await response.json();
        console.log('Claude API response received');

        if (!data.content || !data.content[0] || !data.content[0].text) {
            throw new Error('Invalid response from Claude API');
        }

        const content = data.content[0].text;

        // Parse the JSON from Claude's response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error('Could not find JSON in response:', content);
            throw new Error('Could not parse recipe from response');
        }

        const recipe = JSON.parse(jsonMatch[0]);

        if (recipe.error) {
            throw new Error(recipe.error);
        }

        return {
            title: recipe.title || 'Untitled Recipe',
            ingredients: recipe.ingredients || [],
            instructions: recipe.instructions || [],
            source: sourceUrl,
            notes: recipe.notes || ''
        };

    } catch (error) {
        console.error('Claude API error:', error);

        // Provide more helpful error messages
        if (error.name === 'AbortError') {
            throw new Error('Request timed out. Please try again.');
        }
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            throw new Error('Could not connect to Claude API. This may be a CORS issue - browser direct access must be enabled on your API key.');
        }

        throw error;
    }
}

// Check if API key is configured
function hasApiKey() {
    return !!claudeApiKey;
}

// ============================================
// Recipe Parsing
// ============================================

// Multiple CORS proxies to try as fallbacks
const CORS_PROXIES = [
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
];

async function fetchWithProxy(url) {
    let lastError;

    for (const proxyFn of CORS_PROXIES) {
        const proxyUrl = proxyFn(url);
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(proxyUrl, {
                signal: controller.signal,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const text = await response.text();
                // Check if we got actual HTML content
                if (text.includes('<') && text.length > 500) {
                    return text;
                }
            }
        } catch (e) {
            lastError = e;
            console.log(`Proxy failed: ${proxyUrl.substring(0, 50)}...`, e.message);
        }
    }

    throw lastError || new Error('All proxies failed');
}

async function fetchRecipeFromUrl(url) {
    try {
        const html = await fetchWithProxy(url);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Try to find recipe data
        let recipe = {
            title: '',
            ingredients: [],
            instructions: [],
            source: url,
            notes: ''
        };

        // Try JSON-LD first (many recipe sites use this)
        const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
            try {
                const data = JSON.parse(script.textContent);
                const recipeData = findRecipeInJsonLd(data);
                if (recipeData) {
                    recipe = parseJsonLdRecipe(recipeData, url);
                    break;
                }
            } catch (e) {
                // Continue to next script or fallback
            }
        }

        // If JSON-LD didn't work, try heuristic parsing
        if (!recipe.title || recipe.ingredients.length === 0) {
            recipe = parseRecipeHeuristically(doc, url);
        }

        // Convert to metric
        recipe.ingredients = recipe.ingredients.map(convertToMetric);
        recipe.instructions = recipe.instructions.map(convertToMetric);

        return recipe;

    } catch (error) {
        console.error('Error fetching recipe:', error);
        throw new Error('Could not fetch recipe. CORS proxies may be unavailable. Try the manual input instead.');
    }
}

function findRecipeInJsonLd(data) {
    if (Array.isArray(data)) {
        for (const item of data) {
            const found = findRecipeInJsonLd(item);
            if (found) return found;
        }
    } else if (typeof data === 'object' && data !== null) {
        if (data['@type'] === 'Recipe' || data['@type']?.includes?.('Recipe')) {
            return data;
        }
        if (data['@graph']) {
            return findRecipeInJsonLd(data['@graph']);
        }
    }
    return null;
}

function parseJsonLdRecipe(data, url) {
    const recipe = {
        title: data.name || '',
        ingredients: [],
        instructions: [],
        source: url,
        notes: data.description || ''
    };

    // Parse ingredients
    if (data.recipeIngredient) {
        recipe.ingredients = Array.isArray(data.recipeIngredient)
            ? data.recipeIngredient
            : [data.recipeIngredient];
    }

    // Parse instructions
    if (data.recipeInstructions) {
        const instructions = data.recipeInstructions;
        if (Array.isArray(instructions)) {
            recipe.instructions = instructions.map(inst => {
                if (typeof inst === 'string') return inst;
                if (inst.text) return inst.text;
                if (inst.itemListElement) {
                    return inst.itemListElement.map(i => i.text || i).join(' ');
                }
                return '';
            }).filter(Boolean);
        } else if (typeof instructions === 'string') {
            recipe.instructions = instructions.split(/\n|(?:\d+\.\s)/).filter(Boolean);
        }
    }

    return recipe;
}

function parseRecipeHeuristically(doc, url) {
    const recipe = {
        title: '',
        ingredients: [],
        instructions: [],
        source: url,
        notes: ''
    };

    // Find title
    const titleSelectors = [
        'h1.recipe-title', 'h1.entry-title', '.recipe-name',
        '[itemprop="name"]', 'h1', 'h2.recipe-title'
    ];
    for (const selector of titleSelectors) {
        const el = doc.querySelector(selector);
        if (el && el.textContent.trim()) {
            recipe.title = el.textContent.trim();
            break;
        }
    }

    // Find ingredients
    const ingredientSelectors = [
        '.recipe-ingredients li', '.ingredients li', '[itemprop="recipeIngredient"]',
        '.ingredient-list li', '.wprm-recipe-ingredient', '.tasty-recipe-ingredients li',
        'ul.ingredients li', '.recipe-ingred_txt'
    ];
    for (const selector of ingredientSelectors) {
        const els = doc.querySelectorAll(selector);
        if (els.length > 0) {
            recipe.ingredients = Array.from(els).map(el => el.textContent.trim()).filter(Boolean);
            break;
        }
    }

    // Find instructions
    const instructionSelectors = [
        '.recipe-instructions li', '.instructions li', '[itemprop="recipeInstructions"]',
        '.recipe-directions li', '.wprm-recipe-instruction', '.tasty-recipe-instructions li',
        'ol.instructions li', '.recipe-method li', '.direction-list li'
    ];
    for (const selector of instructionSelectors) {
        const els = doc.querySelectorAll(selector);
        if (els.length > 0) {
            recipe.instructions = Array.from(els).map(el => el.textContent.trim()).filter(Boolean);
            break;
        }
    }

    // If still no instructions, try to find a paragraph-based format
    if (recipe.instructions.length === 0) {
        const instructionContainers = doc.querySelectorAll('.instructions, .directions, .recipe-directions, .method');
        for (const container of instructionContainers) {
            const paragraphs = container.querySelectorAll('p');
            if (paragraphs.length > 0) {
                recipe.instructions = Array.from(paragraphs).map(p => p.textContent.trim()).filter(Boolean);
                break;
            }
        }
    }

    return recipe;
}

// Parse recipe from pasted HTML/text content
async function parseRecipeFromHtml(content, sourceUrl = '') {
    // If Claude API is available, use it for best results
    if (hasApiKey()) {
        // Extract text content for Claude
        let textContent = content;
        const isHtml = content.includes('<') && content.includes('>');

        if (isHtml) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            textContent = extractCleanText(doc);
        }

        try {
            return await extractRecipeWithClaude(textContent, sourceUrl);
        } catch (error) {
            console.error('Claude extraction failed, falling back to heuristic:', error);
            // Fall through to heuristic parsing
        }
    }

    // Fallback: heuristic parsing (no API key or Claude failed)
    const isHtml = content.includes('<') && content.includes('>');

    if (isHtml) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/html');

        // Try JSON-LD first (most reliable)
        const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
            try {
                const data = JSON.parse(script.textContent);
                const recipeData = findRecipeInJsonLd(data);
                if (recipeData) {
                    const recipe = parseJsonLdRecipe(recipeData, sourceUrl);
                    recipe.ingredients = recipe.ingredients.map(convertToMetric);
                    recipe.instructions = recipe.instructions.map(convertToMetric);
                    return recipe;
                }
            } catch (e) {
                // Continue to fallback
            }
        }

        // Try heuristic HTML parsing
        const recipe = parseRecipeHeuristically(doc, sourceUrl);
        if (recipe.ingredients.length > 0) {
            recipe.ingredients = recipe.ingredients.map(convertToMetric);
            recipe.instructions = recipe.instructions.map(convertToMetric);
            return recipe;
        }

        // Fall back to text extraction from HTML
        const textContent = extractCleanText(doc);
        return parseRecipeFromText(textContent, sourceUrl);

    } else {
        // Plain text - parse intelligently
        return parseRecipeFromText(content, sourceUrl);
    }
}

// Extract clean text from HTML, removing noise
function extractCleanText(doc) {
    // Remove script, style, nav, header, footer, aside elements
    const removeSelectors = [
        'script', 'style', 'nav', 'header', 'footer', 'aside',
        '.advertisement', '.ad', '.sidebar', '.comments', '.social',
        '.share', '.related', '.newsletter', '.popup', '[role="navigation"]',
        '.nav', '.menu', '.breadcrumb', '.author-bio', '.post-meta'
    ];

    removeSelectors.forEach(selector => {
        doc.querySelectorAll(selector).forEach(el => el.remove());
    });

    return doc.body ? doc.body.textContent : doc.textContent;
}

// Noise words/phrases to filter out
const NOISE_PATTERNS = [
    /^(skip to|jump to|print|save|share|pin|tweet|facebook|instagram|pinterest|email|subscribe)/i,
    /^(advertisement|sponsored|related|you may also|recommended)/i,
    /^(read more|see more|view all|click here|learn more)/i,
    /^(comments?|leave a reply|reviews?|\d+ stars?)/i,
    /^(prep time|cook time|total time|servings?|yield|calories|nutrition)/i,
    /^(course|cuisine|keyword|author|published|updated)/i,
    /^\s*[\u2605\u2606\u2b50]+\s*$/,  // Star ratings
    /^(menu|home|about|contact|privacy|terms|copyright)/i,
    /^(search|login|sign up|cart|checkout)/i,
    /^\d+\s*(min|mins|minutes|hour|hours|hr|hrs)$/i,  // Just time values
    /^(rate this|did you make|tag us|follow us)/i,
];

// Check if a line is likely noise
function isNoiseLine(line) {
    const trimmed = line.trim();
    if (trimmed.length < 3) return true;
    if (trimmed.length > 300) return true;  // Too long, probably a paragraph of blog text

    for (const pattern of NOISE_PATTERNS) {
        if (pattern.test(trimmed)) return true;
    }

    // Check for typical website navigation/UI patterns
    if (/^[\W\s]*$/.test(trimmed)) return true;  // Only symbols/whitespace
    if (/^(×|x|close|cancel|ok|yes|no)$/i.test(trimmed)) return true;

    return false;
}

// Check if line looks like an ingredient
function looksLikeIngredient(line) {
    const trimmed = line.trim();

    // Must be reasonable length
    if (trimmed.length < 3 || trimmed.length > 150) return false;

    // Common ingredient patterns
    const patterns = [
        /^\d/, // Starts with number
        /^[½⅓⅔¼¾⅛⅜⅝⅞]/, // Starts with fraction
        /^(one|two|three|four|five|six|seven|eight|nine|ten|a |an )\s/i,
        /\d+\s*(cup|tbsp|tsp|tablespoon|teaspoon|oz|ounce|lb|pound|g|gram|ml|liter|pinch|dash|bunch|clove|can|package|pkg|stick|slice|piece)/i,
        /^(salt|pepper|oil|butter|sugar|flour|egg|milk|water|garlic|onion|chicken|beef|pork|fish)/i,
    ];

    for (const pattern of patterns) {
        if (pattern.test(trimmed)) return true;
    }

    // Contains measurement words
    if (/\b(cup|tbsp|tsp|tablespoon|teaspoon|ounce|pound|gram|ml|liter|chopped|diced|minced|sliced|fresh|dried)\b/i.test(trimmed)) {
        return true;
    }

    return false;
}

// Check if line looks like an instruction step
function looksLikeInstruction(line) {
    const trimmed = line.trim();

    // Must be reasonable length (instructions are usually longer than ingredients)
    if (trimmed.length < 15 || trimmed.length > 500) return false;

    // Starts with step number or action verb
    const patterns = [
        /^\d+[\.\)]\s/,  // "1. " or "1) "
        /^step\s*\d/i,   // "Step 1"
        /^(preheat|heat|add|mix|stir|combine|pour|place|put|cook|bake|fry|boil|simmer|whisk|beat|fold|knead|roll|spread|brush|drizzle|sprinkle|season|serve|remove|transfer|let|allow|set|cover|refrigerate|freeze|slice|dice|chop|mince|grate|melt|sauté|roast|grill|blend|puree|strain|drain|rinse|wash|dry|pat|toss|coat|dip|marinate|stuff|fill|layer|arrange|garnish|top|finish)\b/i,
    ];

    for (const pattern of patterns) {
        if (pattern.test(trimmed)) return true;
    }

    // Contains cooking action verbs (even mid-sentence)
    const actionVerbs = /(preheat|heat|add|mix|stir|combine|pour|cook|bake|fry|boil|simmer|whisk|beat|fold|knead|roll|until|minutes|degrees|oven)/i;
    if (actionVerbs.test(trimmed) && trimmed.length > 30) {
        return true;
    }

    return false;
}

// Parse recipe from plain text (the smart parser)
function parseRecipeFromText(text, sourceUrl = '') {
    const recipe = {
        title: '',
        ingredients: [],
        instructions: [],
        source: sourceUrl,
        notes: ''
    };

    // Split into lines and clean
    const lines = text.split(/\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .filter(l => !isNoiseLine(l));

    // Find title - look for a reasonable title near the start
    // Skip obvious non-titles
    for (let i = 0; i < Math.min(20, lines.length); i++) {
        const line = lines[i];
        if (line.length >= 5 && line.length <= 80) {
            // Skip if it looks like an ingredient or instruction
            if (looksLikeIngredient(line)) continue;
            if (looksLikeInstruction(line)) continue;
            // Skip if it's a section header
            if (/^(ingredients?|instructions?|directions?|method|steps?|notes?)$/i.test(line)) continue;

            recipe.title = line;
            break;
        }
    }

    // Collect all potential ingredients and instructions
    let inIngredients = false;
    let inInstructions = false;
    const potentialIngredients = [];
    const potentialInstructions = [];

    for (const line of lines) {
        const lower = line.toLowerCase();

        // Detect section headers
        if (/^ingredients?:?$/i.test(line) || lower === 'what you need' || lower === 'you will need') {
            inIngredients = true;
            inInstructions = false;
            continue;
        }
        if (/^(instructions?|directions?|method|steps?|how to make|preparation):?$/i.test(line)) {
            inIngredients = false;
            inInstructions = true;
            continue;
        }
        if (/^(notes?|tips?|variations?):?$/i.test(line)) {
            inIngredients = false;
            inInstructions = false;
            continue;
        }

        // Skip the title
        if (line === recipe.title) continue;

        // Categorize based on context and content
        if (inIngredients) {
            if (looksLikeIngredient(line) || line.length < 80) {
                potentialIngredients.push(cleanIngredient(line));
            }
        } else if (inInstructions) {
            if (looksLikeInstruction(line) || line.length > 20) {
                potentialInstructions.push(cleanInstruction(line));
            }
        } else {
            // Auto-detect
            if (looksLikeIngredient(line)) {
                potentialIngredients.push(cleanIngredient(line));
            } else if (looksLikeInstruction(line)) {
                potentialInstructions.push(cleanInstruction(line));
            }
        }
    }

    // Filter and dedupe
    recipe.ingredients = [...new Set(potentialIngredients)]
        .filter(i => i.length > 2)
        .map(convertToMetric);

    recipe.instructions = [...new Set(potentialInstructions)]
        .filter(i => i.length > 10)
        .map(convertToMetric);

    return recipe;
}

// Clean up ingredient line
function cleanIngredient(line) {
    return line
        .replace(/^[\-\*\•\u2022\u25E6\u25AA\u25CF]\s*/, '')  // Remove bullets
        .replace(/^\d+[\.\)]\s*/, '')  // Remove numbering
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .trim();
}

// Clean up instruction line
function cleanInstruction(line) {
    return line
        .replace(/^[\-\*\•\u2022]\s*/, '')  // Remove bullets
        .replace(/^\d+[\.\)]\s*/, '')  // Remove step numbers (we'll re-add them)
        .replace(/^step\s*\d+:?\s*/i, '')  // Remove "Step X:"
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .trim();
}

// ============================================
// YouTube Transcript Extraction (legacy - may not work)
// ============================================

async function fetchYoutubeTranscript(url) {
    // Extract video ID
    const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (!videoIdMatch) {
        throw new Error('Invalid YouTube URL');
    }
    const videoId = videoIdMatch[1];

    // Try multiple transcript services
    const services = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`,
    ];

    try {
        // First, get video title
        const response = await fetch(services[0]);
        const html = await response.text();

        // Extract title
        const titleMatch = html.match(/<title>([^<]+)<\/title>/);
        let title = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : 'YouTube Recipe';

        // Try to get transcript from the page
        // YouTube embeds caption tracks in the page
        const captionMatch = html.match(/"captionTracks":\s*(\[.*?\])/);

        if (captionMatch) {
            try {
                const captionTracks = JSON.parse(captionMatch[1]);
                if (captionTracks.length > 0) {
                    // Get the first caption track URL
                    const captionUrl = captionTracks[0].baseUrl;
                    const captionResponse = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(captionUrl)}`);
                    const captionXml = await captionResponse.text();

                    // Parse the XML transcript
                    const transcript = parseYoutubeTranscript(captionXml);
                    return parseRecipeFromTranscript(transcript, title, url);
                }
            } catch (e) {
                console.error('Error parsing captions:', e);
            }
        }

        // If no captions available, try a third-party service
        const transcriptServiceUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://youtubetranscript.com/?server_vid2=${videoId}`)}`;
        const transcriptResponse = await fetch(transcriptServiceUrl);
        const transcriptHtml = await transcriptResponse.text();

        // Extract transcript from the service response
        const parser = new DOMParser();
        const doc = parser.parseFromString(transcriptHtml, 'text/html');
        const textElements = doc.querySelectorAll('.transcript-text, p, .text');

        if (textElements.length > 0) {
            const transcript = Array.from(textElements).map(el => el.textContent.trim()).join(' ');
            return parseRecipeFromTranscript(transcript, title, url);
        }

        throw new Error('Could not extract transcript. The video may not have captions available.');

    } catch (error) {
        console.error('YouTube extraction error:', error);
        throw new Error('Could not extract recipe from video. Try a video with captions enabled, or copy the recipe manually.');
    }
}

function parseYoutubeTranscript(xml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const textNodes = doc.querySelectorAll('text');

    return Array.from(textNodes)
        .map(node => node.textContent.replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim())
        .join(' ');
}

function parseRecipeFromTranscript(transcript, title, url) {
    // This is a heuristic approach to extract recipe info from spoken content
    const recipe = {
        title: title,
        ingredients: [],
        instructions: [],
        source: url,
        notes: 'Extracted from video transcript. Please review and adjust as needed.'
    };

    // Common patterns for ingredients in speech
    const ingredientPatterns = [
        /(?:you(?:'ll)? need|ingredients?(?:\s+are)?|grab|take|get|add)\s*:?\s*([^.]+)/gi,
        /(\d+(?:\/\d+)?(?:\s*(?:cup|tablespoon|teaspoon|tbsp|tsp|ounce|oz|pound|lb|gram|g|ml|liter|pinch|dash|bunch|clove|slice|piece)s?)?(?:\s+of)?\s+\w+(?:\s+\w+)?)/gi
    ];

    // Extract potential ingredients
    const foundIngredients = new Set();
    for (const pattern of ingredientPatterns) {
        let match;
        while ((match = pattern.exec(transcript)) !== null) {
            const ingredient = match[1] || match[0];
            if (ingredient.length > 3 && ingredient.length < 100) {
                foundIngredients.add(ingredient.trim());
            }
        }
    }

    recipe.ingredients = Array.from(foundIngredients).slice(0, 20);

    // For instructions, split transcript into sentences and look for action words
    const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const actionWords = ['add', 'mix', 'stir', 'pour', 'heat', 'cook', 'bake', 'fry', 'boil', 'simmer',
                         'chop', 'dice', 'slice', 'cut', 'preheat', 'combine', 'whisk', 'fold',
                         'season', 'serve', 'let', 'place', 'put', 'set', 'remove', 'transfer'];

    const instructions = sentences.filter(sentence => {
        const lower = sentence.toLowerCase();
        return actionWords.some(word => lower.includes(word));
    }).map(s => s.trim());

    recipe.instructions = instructions.slice(0, 15);

    // Convert to metric
    recipe.ingredients = recipe.ingredients.map(convertToMetric);
    recipe.instructions = recipe.instructions.map(convertToMetric);

    return recipe;
}

// ============================================
// Storage
// ============================================

function loadRecipes() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        recipes = data ? JSON.parse(data) : [];
    } catch (e) {
        recipes = [];
    }
}

function saveRecipes() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Firebase sync functions
function getRecipesPath() {
    // If user is logged in, use user-specific path
    if (currentUser) {
        return ['users', currentUser.uid, 'recipes'];
    }
    // Otherwise use shared recipes collection (for backwards compatibility)
    return ['recipes'];
}

async function syncRecipeToFirebase(recipe) {
    if (!window.firebaseDb) {
        console.log('Firebase not available, skipping sync');
        return;
    }

    if (!currentUser) {
        console.log('No user logged in, skipping sync');
        return;
    }

    try {
        const path = getRecipesPath();
        console.log('Syncing recipe to path:', path.join('/'), recipe.id);
        const docRef = window.firebaseDoc(window.firebaseDb, ...path, recipe.id);
        await window.firebaseSetDoc(docRef, recipe);
        console.log('Recipe synced to Firebase:', recipe.id);
    } catch (error) {
        console.error('Error syncing recipe to Firebase:', error);
        showToast('Failed to sync recipe: ' + error.message, 'error');
    }
}

async function deleteRecipeFromFirebase(id) {
    if (!window.firebaseDb) {
        console.log('Firebase not available, skipping delete');
        return;
    }

    if (!currentUser) {
        console.log('No user logged in, skipping delete');
        return;
    }

    try {
        const path = getRecipesPath();
        console.log('Deleting recipe from path:', path.join('/'), id);
        const docRef = window.firebaseDoc(window.firebaseDb, ...path, id);
        await window.firebaseDeleteDoc(docRef);
        console.log('Recipe deleted from Firebase:', id);
    } catch (error) {
        console.error('Error deleting recipe from Firebase:', error);
        showToast('Failed to delete recipe: ' + error.message, 'error');
    }
}

function updateSyncStatus(connected, message) {
    if (elements.syncStatus) {
        elements.syncStatus.classList.remove('connected', 'disconnected');
        elements.syncStatus.classList.add(connected ? 'connected' : 'disconnected');
    }
    if (elements.syncStatusText) {
        elements.syncStatusText.textContent = message;
    }
}

function setupFirebaseListener() {
    if (!window.firebaseDb) {
        updateSyncStatus(false, 'Offline mode');
        return;
    }

    if (!currentUser) {
        console.log('No user logged in, cannot setup Firebase listener');
        updateSyncStatus(false, 'Not signed in');
        return;
    }

    // Unsubscribe from previous listener if exists
    if (unsubscribeFirebase) {
        unsubscribeFirebase();
        unsubscribeFirebase = null;
    }

    try {
        const path = getRecipesPath();
        console.log('Setting up Firebase listener for path:', path.join('/'));

        const recipesRef = window.firebaseCollection(window.firebaseDb, ...path);
        const q = window.firebaseQuery(recipesRef, window.firebaseOrderBy('createdAt', 'desc'));

        // Set firebaseReady immediately so syncing can happen
        firebaseReady = true;
        updateSyncStatus(true, 'Connecting...');

        unsubscribeFirebase = window.firebaseOnSnapshot(q, (snapshot) => {
            const firebaseRecipes = [];
            snapshot.forEach((doc) => {
                firebaseRecipes.push(doc.data());
            });

            // Update local recipes with Firebase data
            recipes = firebaseRecipes;
            saveRecipes(); // Keep localStorage as backup

            // Re-render UI
            renderRecipeList(elements.searchInput.value);

            // Update current recipe view if needed
            if (currentRecipeId) {
                const currentRecipe = getRecipe(currentRecipeId);
                if (currentRecipe) {
                    selectRecipe(currentRecipeId);
                } else {
                    // Current recipe was deleted
                    currentRecipeId = null;
                    if (recipes.length > 0) {
                        selectRecipe(recipes[0].id);
                    } else {
                        elements.recipeDetail.style.display = 'none';
                        elements.emptyState.style.display = 'flex';
                    }
                }
            }

            // Update sync status
            updateSyncStatus(true, 'Synced');
            console.log('Recipes synced from Firebase:', firebaseRecipes.length);
        }, (error) => {
            console.error('Firebase listener error:', error);
            firebaseReady = false;
            updateSyncStatus(false, 'Sync error');
            showToast('Sync error: ' + error.message, 'error');
        });

    } catch (error) {
        console.error('Error setting up Firebase listener:', error);
        firebaseReady = false;
        updateSyncStatus(false, 'Connection failed');
    }
}

function addRecipe(recipeData) {
    const recipe = {
        id: generateId(),
        createdAt: new Date().toISOString(),
        ...recipeData
    };
    recipes.unshift(recipe);
    saveRecipes();

    // Sync to Firebase
    syncRecipeToFirebase(recipe);

    return recipe;
}

function updateRecipe(id, updates) {
    const index = recipes.findIndex(r => r.id === id);
    if (index !== -1) {
        recipes[index] = { ...recipes[index], ...updates, updatedAt: new Date().toISOString() };
        saveRecipes();

        // Sync to Firebase
        syncRecipeToFirebase(recipes[index]);

        return recipes[index];
    }
    return null;
}

function deleteRecipe(id) {
    const index = recipes.findIndex(r => r.id === id);
    if (index !== -1) {
        recipes.splice(index, 1);
        saveRecipes();

        // Delete from Firebase
        deleteRecipeFromFirebase(id);

        return true;
    }
    return false;
}

function getRecipe(id) {
    return recipes.find(r => r.id === id);
}

// ============================================
// Folders Management
// ============================================

function loadFolders() {
    try {
        const data = localStorage.getItem(FOLDERS_STORAGE);
        folders = data ? JSON.parse(data) : [];
    } catch (e) {
        folders = [];
    }
}

function saveFolders() {
    localStorage.setItem(FOLDERS_STORAGE, JSON.stringify(folders));
}

async function syncFolderToFirebase(folder) {
    if (!window.firebaseDb || !currentUser) {
        console.log('Cannot sync folder: Firebase or user not available');
        return;
    }

    try {
        console.log('Syncing folder to Firebase:', folder.name);
        const docRef = window.firebaseDoc(window.firebaseDb, 'users', currentUser.uid, 'folders', folder.id);
        await window.firebaseSetDoc(docRef, folder);
        console.log('Folder synced successfully');
    } catch (error) {
        console.error('Error syncing folder to Firebase:', error);
    }
}

async function deleteFolderFromFirebase(id) {
    if (!window.firebaseDb || !currentUser) {
        console.log('Cannot delete folder: Firebase or user not available');
        return;
    }

    try {
        console.log('Deleting folder from Firebase:', id);
        const docRef = window.firebaseDoc(window.firebaseDb, 'users', currentUser.uid, 'folders', id);
        await window.firebaseDeleteDoc(docRef);
        console.log('Folder deleted successfully');
    } catch (error) {
        console.error('Error deleting folder from Firebase:', error);
    }
}

function addFolder(name) {
    const folder = {
        id: generateId(),
        name: name.trim(),
        createdAt: new Date().toISOString()
    };
    folders.push(folder);
    saveFolders();
    syncFolderToFirebase(folder);
    return folder;
}

function updateFolder(id, name) {
    const folder = folders.find(f => f.id === id);
    if (folder) {
        folder.name = name.trim();
        folder.updatedAt = new Date().toISOString();
        saveFolders();
        syncFolderToFirebase(folder);
        return folder;
    }
    return null;
}

function deleteFolder(id) {
    const index = folders.findIndex(f => f.id === id);
    if (index !== -1) {
        folders.splice(index, 1);
        saveFolders();
        deleteFolderFromFirebase(id);

        // Remove folder from recipes
        recipes.forEach(recipe => {
            if (recipe.folderId === id) {
                recipe.folderId = '';
                syncRecipeToFirebase(recipe);
            }
        });
        saveRecipes();

        return true;
    }
    return false;
}

function renderFoldersList() {
    const allRecipesCount = recipes.length;

    let html = `
        <button class="folder-item ${currentFolderId === 'all' ? 'active' : ''}" data-folder="all">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            All Recipes
            <span class="folder-count">${allRecipesCount}</span>
        </button>
    `;

    folders.forEach(folder => {
        const count = recipes.filter(r => r.folderId === folder.id).length;
        html += `
            <button class="folder-item ${currentFolderId === folder.id ? 'active' : ''}" data-folder="${folder.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                ${escapeHtml(folder.name)}
                <span class="folder-count">${count}</span>
            </button>
        `;
    });

    elements.foldersList.innerHTML = html;

    // Add click handlers
    elements.foldersList.querySelectorAll('.folder-item').forEach(btn => {
        btn.addEventListener('click', () => {
            currentFolderId = btn.dataset.folder;
            renderFoldersList();
            renderRecipeList(elements.searchInput.value);
        });

        // Long press or right-click to edit folder (not "all")
        if (btn.dataset.folder !== 'all') {
            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                openEditFolderModal(btn.dataset.folder);
            });
        }
    });
}

function updateFolderSelects() {
    const options = '<option value="">No folder</option>' +
        folders.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');

    if (elements.manualFolder) elements.manualFolder.innerHTML = options;
    if (elements.editFolder) elements.editFolder.innerHTML = options;
}

function openEditFolderModal(folderId) {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    elements.folderModalTitle.textContent = 'Edit Folder';
    elements.folderNameInput.value = folder.name;
    elements.folderNameInput.dataset.editId = folderId;
    elements.deleteFolderBtn.style.display = 'block';
    openModal(elements.folderModal);
}

// ============================================
// Auth Functions
// ============================================

function showLoginScreen() {
    elements.loginScreen.style.display = 'flex';
    elements.app.style.display = 'none';
}

function hideLoginScreen() {
    elements.loginScreen.style.display = 'none';
    elements.app.style.display = 'flex';
}

function updateAuthUI() {
    if (currentUser) {
        // Signed in - hide login, show app
        hideLoginScreen();

        elements.profileName.textContent = currentUser.displayName || currentUser.email;

        if (currentUser.photoURL) {
            elements.profileAvatar.innerHTML = `<img src="${currentUser.photoURL}" alt="Profile">`;
        }

        elements.signedOutState.style.display = 'none';
        elements.signedInState.style.display = 'block';
        elements.profileModalAvatar.src = currentUser.photoURL || '';
        elements.profileModalName.textContent = currentUser.displayName || 'User';
        elements.profileModalEmail.textContent = currentUser.email;
    } else {
        // Signed out - show login screen
        showLoginScreen();

        elements.profileName.textContent = 'Sign In';
        elements.profileAvatar.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
        `;
        elements.signedOutState.style.display = 'block';
        elements.signedInState.style.display = 'none';
    }
}

// Save API key to Firebase user settings
async function saveApiKeyToFirebase(apiKey) {
    if (!currentUser || !window.firebaseDb) return;

    try {
        const docRef = window.firebaseDoc(window.firebaseDb, 'users', currentUser.uid, 'settings', 'apiKey');
        await window.firebaseSetDoc(docRef, {
            claudeApiKey: apiKey,
            updatedAt: new Date().toISOString()
        });
        console.log('API key saved to Firebase');
    } catch (error) {
        console.error('Error saving API key to Firebase:', error);
    }
}

// Load API key from Firebase user settings
function setupUserSettingsListener() {
    if (!currentUser || !window.firebaseDb) return;

    try {
        const docRef = window.firebaseDoc(window.firebaseDb, 'users', currentUser.uid, 'settings', 'apiKey');

        unsubscribeUserSettings = window.firebaseOnSnapshot(docRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                if (data.claudeApiKey) {
                    claudeApiKey = data.claudeApiKey;
                    localStorage.setItem(API_KEY_STORAGE, claudeApiKey);
                    console.log('API key loaded from Firebase');

                    // Update the settings modal if open
                    if (elements.apiKeyInput) {
                        elements.apiKeyInput.value = claudeApiKey;
                    }
                }
            }
        }, (error) => {
            console.error('Error loading user settings:', error);
        });
    } catch (error) {
        console.error('Error setting up user settings listener:', error);
    }
}

async function signInWithGoogle() {
    if (!window.firebaseAuth || !window.firebaseGoogleProvider) {
        elements.loginHint.textContent = 'Authentication not available. Please try again later.';
        elements.loginHint.classList.add('error');
        return;
    }

    elements.loginGoogleBtn.disabled = true;
    elements.loginGoogleBtn.textContent = 'Signing in...';
    elements.loginHint.textContent = '';
    elements.loginHint.classList.remove('error');

    try {
        // For Firefox, we need to use signInWithRedirect if popup is blocked
        const result = await window.firebaseSignInWithPopup(window.firebaseAuth, window.firebaseGoogleProvider);
        currentUser = result.user;
        // Auth state change will handle the rest
    } catch (error) {
        console.error('Sign in error:', error);

        let errorMessage = 'Sign in failed. ';

        // Handle specific Firebase auth errors
        if (error.code === 'auth/popup-blocked') {
            errorMessage = 'Popup was blocked. Please allow popups for this site and try again.';
        } else if (error.code === 'auth/popup-closed-by-user') {
            errorMessage = 'Sign in was cancelled. Please try again.';
        } else if (error.code === 'auth/cancelled-popup-request') {
            errorMessage = 'Sign in was cancelled. Please try again.';
        } else if (error.code === 'auth/network-request-failed') {
            errorMessage = 'Network error. Please check your connection and try again.';
        } else if (error.code === 'auth/unauthorized-domain') {
            errorMessage = 'This domain is not authorized for sign in. Please contact support.';
        } else if (error.message) {
            errorMessage += error.message;
        }

        elements.loginHint.textContent = errorMessage;
        elements.loginHint.classList.add('error');
        elements.loginGoogleBtn.disabled = false;
        elements.loginGoogleBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
        `;
    }
}

async function signOutUser() {
    if (!window.firebaseAuth) return;

    try {
        await window.firebaseSignOut(window.firebaseAuth);
        currentUser = null;

        // Unsubscribe from user-specific listeners
        if (unsubscribeFirebase) unsubscribeFirebase();
        if (unsubscribeFolders) unsubscribeFolders();
        if (unsubscribeUserSettings) unsubscribeUserSettings();

        // Clear data
        recipes = [];
        folders = [];
        claudeApiKey = null;

        // Show login screen
        showLoginScreen();
        closeModal(elements.profileModal);
    } catch (error) {
        console.error('Sign out error:', error);
        showToast('Sign out failed', 'error');
    }
}

function setupFoldersListener() {
    if (!window.firebaseDb || !currentUser) return;

    try {
        const foldersRef = window.firebaseCollection(window.firebaseDb, 'users', currentUser.uid, 'folders');
        const q = window.firebaseQuery(foldersRef, window.firebaseOrderBy('createdAt', 'asc'));

        unsubscribeFolders = window.firebaseOnSnapshot(q, (snapshot) => {
            const firebaseFolders = [];
            snapshot.forEach((doc) => {
                firebaseFolders.push(doc.data());
            });

            folders = firebaseFolders;
            saveFolders();
            renderFoldersList();
            updateFolderSelects();
        }, (error) => {
            console.error('Folders listener error:', error);
        });
    } catch (error) {
        console.error('Error setting up folders listener:', error);
    }
}

// ============================================
// UI Functions
// ============================================

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function renderRecipeList(filter = '') {
    // Filter by search term
    let filteredRecipes = filter
        ? recipes.filter(r => r.title.toLowerCase().includes(filter.toLowerCase()))
        : recipes;

    // Filter by folder
    if (currentFolderId !== 'all') {
        filteredRecipes = filteredRecipes.filter(r => r.folderId === currentFolderId);
    }

    if (filteredRecipes.length === 0 && recipes.length === 0) {
        elements.recipeList.innerHTML = '';
        elements.emptyState.style.display = 'flex';
        elements.recipeDetail.style.display = 'none';
        return;
    }

    if (filteredRecipes.length === 0) {
        elements.recipeList.innerHTML = '<div class="empty-folder">No recipes in this folder</div>';
        elements.emptyState.style.display = 'none';
        elements.recipeDetail.style.display = 'none';
        return;
    }

    elements.emptyState.style.display = 'none';

    elements.recipeList.innerHTML = filteredRecipes.map(recipe => `
        <button class="recipe-item ${recipe.id === currentRecipeId ? 'active' : ''}" data-id="${recipe.id}">
            <span class="recipe-item-title">${escapeHtml(recipe.title)}</span>
            <span class="recipe-item-meta">${recipe.ingredients.length} ingredients</span>
        </button>
    `).join('');

    // Add click handlers
    elements.recipeList.querySelectorAll('.recipe-item').forEach(item => {
        item.addEventListener('click', () => {
            selectRecipe(item.dataset.id);
            // Close sidebar on mobile
            if (window.innerWidth <= 768) {
                elements.sidebar.classList.remove('open');
            }
        });
    });
}

function selectRecipe(id) {
    currentRecipeId = id;
    const recipe = getRecipe(id);

    if (!recipe) {
        elements.recipeDetail.style.display = 'none';
        elements.emptyState.style.display = 'flex';
        return;
    }

    elements.emptyState.style.display = 'none';
    elements.recipeDetail.style.display = 'block';

    // Update content
    elements.recipeTitle.textContent = recipe.title;

    if (recipe.source) {
        elements.recipeSource.href = recipe.source;
        elements.recipeSource.textContent = new URL(recipe.source).hostname;
        elements.recipeSource.style.display = 'inline';
    } else {
        elements.recipeSource.style.display = 'none';
    }

    // Show servings if available
    if (recipe.servings) {
        elements.servingsText.textContent = recipe.servings;
        elements.servingsDisplay.style.display = 'flex';
    } else {
        elements.servingsDisplay.style.display = 'none';
    }

    elements.ingredientsList.innerHTML = recipe.ingredients
        .map(ing => `<li>${escapeHtml(ing)}</li>`)
        .join('');

    elements.instructionsList.innerHTML = recipe.instructions
        .map(inst => `<li>${escapeHtml(inst)}</li>`)
        .join('');

    if (recipe.notes) {
        elements.notesSection.style.display = 'block';
        elements.recipeNotes.textContent = recipe.notes;
    } else {
        elements.notesSection.style.display = 'none';
    }

    // Update sidebar selection
    renderRecipeList(elements.searchInput.value);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function openModal(modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.input-tabs .tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}Tab`);
    });
}

function setButtonLoading(button, loading) {
    button.classList.toggle('loading', loading);
    button.disabled = loading;
}

// ============================================
// Event Handlers
// ============================================

function setupEventListeners() {
    // Add recipe buttons
    [elements.addRecipeBtn, elements.emptyAddBtn, elements.mobileAddBtn].forEach(btn => {
        btn?.addEventListener('click', () => openModal(elements.addModal));
    });

    // Close modals
    elements.closeModalBtn.addEventListener('click', () => closeModal(elements.addModal));
    elements.modalBackdrop.addEventListener('click', () => closeModal(elements.addModal));
    elements.closeEditModalBtn.addEventListener('click', () => closeModal(elements.editModal));
    elements.editModalBackdrop.addEventListener('click', () => closeModal(elements.editModal));
    elements.closeSyncModalBtn.addEventListener('click', () => closeModal(elements.syncModal));
    elements.syncModalBackdrop.addEventListener('click', () => closeModal(elements.syncModal));
    elements.closeSettingsModalBtn.addEventListener('click', () => closeModal(elements.settingsModal));
    elements.settingsModalBackdrop.addEventListener('click', () => closeModal(elements.settingsModal));
    elements.closeProfileModalBtn?.addEventListener('click', () => closeModal(elements.profileModal));
    elements.profileModalBackdrop?.addEventListener('click', () => closeModal(elements.profileModal));
    elements.closeFolderModalBtn?.addEventListener('click', () => closeModal(elements.folderModal));
    elements.folderModalBackdrop?.addEventListener('click', () => closeModal(elements.folderModal));

    // Profile button
    elements.profileBtn?.addEventListener('click', () => {
        openModal(elements.profileModal);
    });

    // Google Sign In
    elements.googleSignInBtn?.addEventListener('click', signInWithGoogle);

    // Sign Out
    elements.signOutBtn?.addEventListener('click', signOutUser);

    // Add folder button
    elements.addFolderBtn?.addEventListener('click', () => {
        elements.folderModalTitle.textContent = 'New Folder';
        elements.folderNameInput.value = '';
        elements.folderNameInput.dataset.editId = '';
        elements.deleteFolderBtn.style.display = 'none';
        openModal(elements.folderModal);
    });

    // Save folder
    elements.saveFolderBtn?.addEventListener('click', () => {
        const name = elements.folderNameInput.value.trim();
        if (!name) {
            showToast('Please enter a folder name', 'error');
            return;
        }

        const editId = elements.folderNameInput.dataset.editId;
        if (editId) {
            updateFolder(editId, name);
            showToast('Folder updated');
        } else {
            addFolder(name);
            showToast('Folder created');
        }

        closeModal(elements.folderModal);
        renderFoldersList();
        updateFolderSelects();
    });

    // Delete folder
    elements.deleteFolderBtn?.addEventListener('click', () => {
        const editId = elements.folderNameInput.dataset.editId;
        if (editId && confirm('Delete this folder? Recipes in it will be moved to "All Recipes".')) {
            deleteFolder(editId);
            currentFolderId = 'all';
            closeModal(elements.folderModal);
            renderFoldersList();
            renderRecipeList();
            updateFolderSelects();
            showToast('Folder deleted');
        }
    });

    // Login screen Google button
    elements.loginGoogleBtn?.addEventListener('click', signInWithGoogle);

    // Settings button
    elements.settingsBtn.addEventListener('click', () => {
        // Load current API key (masked)
        if (claudeApiKey) {
            elements.apiKeyInput.value = claudeApiKey;
            elements.apiStatus.innerHTML = '<span style="color: var(--success);">✓ API key configured</span>';
        } else {
            elements.apiKeyInput.value = '';
            elements.apiStatus.innerHTML = '<span style="color: var(--text-muted);">No API key set</span>';
        }
        openModal(elements.settingsModal);
    });

    // Save settings
    elements.saveSettingsBtn.addEventListener('click', async () => {
        const apiKey = elements.apiKeyInput.value.trim();

        if (apiKey) {
            claudeApiKey = apiKey;
            localStorage.setItem(API_KEY_STORAGE, apiKey);

            // Save to Firebase for cross-device sync
            await saveApiKeyToFirebase(apiKey);

            elements.apiStatus.innerHTML = '<span style="color: var(--success);">✓ API key saved and synced!</span>';
            showToast('API key saved! It will sync across your devices.');
        } else {
            claudeApiKey = null;
            localStorage.removeItem(API_KEY_STORAGE);

            // Remove from Firebase too
            await saveApiKeyToFirebase('');

            elements.apiStatus.innerHTML = '<span style="color: var(--text-muted);">API key removed</span>';
            showToast('API key removed.');
        }

        setTimeout(() => closeModal(elements.settingsModal), 1000);
    });

    // Test API connection
    elements.testApiBtn.addEventListener('click', async () => {
        const apiKey = elements.apiKeyInput.value.trim();

        if (!apiKey) {
            elements.apiStatus.innerHTML = '<span style="color: var(--danger);">Please enter an API key first</span>';
            return;
        }

        elements.testApiBtn.disabled = true;
        elements.testApiBtn.textContent = 'Testing...';
        elements.apiStatus.innerHTML = '<span style="color: var(--text-muted);">Connecting to Claude API...</span>';

        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 10,
                    messages: [{
                        role: 'user',
                        content: 'Say "ok"'
                    }]
                })
            });

            if (response.ok) {
                elements.apiStatus.innerHTML = '<span style="color: var(--success);">✓ Connection successful! API key is valid.</span>';
                // Auto-save the working key
                claudeApiKey = apiKey;
                localStorage.setItem(API_KEY_STORAGE, apiKey);
            } else {
                const errorData = await response.json().catch(() => ({}));
                let errorMsg = 'Connection failed';

                if (response.status === 401) {
                    errorMsg = 'Invalid API key';
                } else if (response.status === 403) {
                    errorMsg = 'Browser access not enabled. Create a new key with "Allow browser access" checked.';
                } else if (response.status === 429) {
                    errorMsg = 'Rate limited. Wait a moment and try again.';
                } else if (errorData.error?.message) {
                    errorMsg = errorData.error.message;
                }

                elements.apiStatus.innerHTML = `<span style="color: var(--danger);">✗ ${errorMsg}</span>`;
            }
        } catch (error) {
            console.error('API test error:', error);
            let errorMsg = 'Could not connect to API';

            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                errorMsg = 'Network error. Check if browser access is enabled on your API key.';
            }

            elements.apiStatus.innerHTML = `<span style="color: var(--danger);">✗ ${errorMsg}</span>`;
        } finally {
            elements.testApiBtn.disabled = false;
            elements.testApiBtn.textContent = 'Test Connection';
        }
    });

    // Tab switching
    document.querySelectorAll('.input-tabs .tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // URL extraction
    elements.fetchUrlBtn.addEventListener('click', async () => {
        const url = elements.recipeUrl.value.trim();
        if (!url) {
            showToast('Please enter a URL', 'error');
            return;
        }

        setButtonLoading(elements.fetchUrlBtn, true);

        try {
            const recipeData = await fetchRecipeFromUrl(url);
            if (!recipeData.title || recipeData.ingredients.length === 0) {
                throw new Error('Could not extract recipe data');
            }

            const recipe = addRecipe(recipeData);
            closeModal(elements.addModal);
            elements.recipeUrl.value = '';
            renderRecipeList();
            selectRecipe(recipe.id);
            showToast('Recipe added successfully!');

        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setButtonLoading(elements.fetchUrlBtn, false);
        }
    });

    // Paste HTML extraction
    elements.parseHtmlBtn.addEventListener('click', async () => {
        const html = elements.pasteHtml.value.trim();
        const sourceUrl = elements.pasteSource.value.trim();

        if (!html) {
            showToast('Please paste page content', 'error');
            return;
        }

        // Show loading state
        elements.parseHtmlBtn.disabled = true;
        const originalText = elements.parseHtmlBtn.textContent;
        elements.parseHtmlBtn.textContent = hasApiKey() ? 'Extracting with AI...' : 'Extracting...';

        try {
            const recipeData = await parseRecipeFromHtml(html, sourceUrl);
            if (!recipeData.title || recipeData.ingredients.length === 0) {
                throw new Error('Could not extract recipe. Try the Manual tab instead.');
            }

            const recipe = addRecipe(recipeData);
            closeModal(elements.addModal);
            elements.pasteHtml.value = '';
            elements.pasteSource.value = '';
            renderRecipeList();
            selectRecipe(recipe.id);
            showToast('Recipe added successfully!');

        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            elements.parseHtmlBtn.disabled = false;
            elements.parseHtmlBtn.textContent = originalText;
        }
    });

    // Manual save
    elements.saveManualBtn.addEventListener('click', () => {
        const title = elements.manualTitle.value.trim();
        const servings = elements.manualServings.value.trim();
        const ingredientsText = elements.manualIngredients.value.trim();
        const instructionsText = elements.manualInstructions.value.trim();

        if (!title) {
            showToast('Please enter a recipe title', 'error');
            return;
        }

        if (!ingredientsText) {
            showToast('Please enter ingredients', 'error');
            return;
        }

        // Parse ingredients and instructions
        const ingredients = ingredientsText
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map(convertToMetric);

        const instructions = instructionsText
            .split('\n')
            .map(line => line.replace(/^\d+\.\s*/, '').trim())
            .filter(Boolean)
            .map(convertToMetric);

        const recipeData = {
            title,
            servings,
            ingredients,
            instructions,
            source: elements.manualSource.value.trim() || '',
            notes: elements.manualNotes.value.trim() || '',
            folderId: elements.manualFolder?.value || ''
        };

        const recipe = addRecipe(recipeData);
        closeModal(elements.addModal);

        // Clear form
        elements.manualTitle.value = '';
        elements.manualServings.value = '';
        elements.manualIngredients.value = '';
        elements.manualInstructions.value = '';
        elements.manualSource.value = '';
        elements.manualNotes.value = '';
        if (elements.manualFolder) elements.manualFolder.value = '';

        renderFoldersList();
        renderRecipeList();
        selectRecipe(recipe.id);
        showToast('Recipe added successfully!');
    });

    // Edit recipe
    elements.editRecipeBtn.addEventListener('click', () => {
        const recipe = getRecipe(currentRecipeId);
        if (!recipe) return;

        elements.editTitle.value = recipe.title;
        if (elements.editFolder) elements.editFolder.value = recipe.folderId || '';
        elements.editServings.value = recipe.servings || '';
        elements.editIngredients.value = recipe.ingredients.join('\n');
        elements.editInstructions.value = recipe.instructions.join('\n');
        elements.editSource.value = recipe.source || '';
        elements.editNotes.value = recipe.notes || '';

        openModal(elements.editModal);
    });

    // Save edit
    elements.saveEditBtn.addEventListener('click', () => {
        const title = elements.editTitle.value.trim();
        if (!title) {
            showToast('Please enter a recipe title', 'error');
            return;
        }

        const updates = {
            title,
            servings: elements.editServings.value.trim(),
            ingredients: elements.editIngredients.value.split('\n').map(l => l.trim()).filter(Boolean),
            instructions: elements.editInstructions.value.split('\n').map(l => l.trim()).filter(Boolean),
            source: elements.editSource.value.trim(),
            notes: elements.editNotes.value.trim(),
            folderId: elements.editFolder?.value || ''
        };

        updateRecipe(currentRecipeId, updates);
        closeModal(elements.editModal);
        renderFoldersList();
        renderRecipeList();
        selectRecipe(currentRecipeId);
        showToast('Recipe updated!');
    });

    // Delete recipe
    elements.deleteRecipeBtn.addEventListener('click', () => {
        if (!confirm('Are you sure you want to delete this recipe?')) return;

        deleteRecipe(currentRecipeId);
        currentRecipeId = null;
        renderRecipeList();

        // Select first recipe if available
        if (recipes.length > 0) {
            selectRecipe(recipes[0].id);
        }

        showToast('Recipe deleted');
    });

    // Copy ingredients to clipboard
    elements.copyIngredientsBtn.addEventListener('click', async () => {
        const recipe = getRecipe(currentRecipeId);
        if (!recipe) return;

        const ingredientsText = recipe.ingredients.join('\n');

        try {
            await navigator.clipboard.writeText(ingredientsText);

            // Visual feedback
            const btn = elements.copyIngredientsBtn;
            const copyText = btn.querySelector('.copy-text');
            btn.classList.add('copied');
            copyText.textContent = 'Copied!';

            setTimeout(() => {
                btn.classList.remove('copied');
                copyText.textContent = 'Copy';
            }, 2000);

            showToast('Ingredients copied to clipboard!');
        } catch (err) {
            showToast('Failed to copy ingredients', 'error');
        }
    });

    // Search
    elements.searchInput.addEventListener('input', (e) => {
        renderRecipeList(e.target.value);
    });

    // Mobile menu
    elements.menuBtn?.addEventListener('click', () => {
        elements.sidebar.classList.toggle('open');
    });

    // Theme toggle
    elements.toggleTheme.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
        localStorage.setItem('theme', isDark ? 'light' : 'dark');
    });

    // Sync button
    elements.syncBtn.addEventListener('click', () => {
        openModal(elements.syncModal);
    });

    // Export
    elements.exportBtn.addEventListener('click', async () => {
        const data = JSON.stringify(recipes, null, 2);
        const blob = new Blob([data], { type: 'application/json' });

        // Try File System Access API first (allows saving to iCloud)
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'recipe-book-backup.json',
                    types: [{
                        description: 'JSON Files',
                        accept: { 'application/json': ['.json'] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                showToast('Recipes saved!');
                closeModal(elements.syncModal);
                return;
            } catch (e) {
                if (e.name !== 'AbortError') {
                    console.error('File save error:', e);
                }
            }
        }

        // Fallback to download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'recipe-book-backup.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Recipes downloaded!');
        closeModal(elements.syncModal);
    });

    // Import
    elements.importBtn.addEventListener('click', async () => {
        // Try File System Access API first
        if ('showOpenFilePicker' in window) {
            try {
                const [handle] = await window.showOpenFilePicker({
                    types: [{
                        description: 'JSON Files',
                        accept: { 'application/json': ['.json'] }
                    }]
                });
                const file = await handle.getFile();
                const text = await file.text();
                const imported = JSON.parse(text);

                if (Array.isArray(imported)) {
                    recipes = imported;
                    saveRecipes();
                    currentRecipeId = null;
                    renderRecipeList();
                    if (recipes.length > 0) {
                        selectRecipe(recipes[0].id);
                    }
                    showToast(`Loaded ${recipes.length} recipes!`);
                    closeModal(elements.syncModal);
                }
                return;
            } catch (e) {
                if (e.name !== 'AbortError') {
                    console.error('File open error:', e);
                }
            }
        }

        // Fallback to file input
        elements.importFile.click();
    });

    // File input fallback
    elements.importFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const imported = JSON.parse(text);

            if (Array.isArray(imported)) {
                recipes = imported;
                saveRecipes();
                currentRecipeId = null;
                renderRecipeList();
                if (recipes.length > 0) {
                    selectRecipe(recipes[0].id);
                }
                showToast(`Loaded ${recipes.length} recipes!`);
                closeModal(elements.syncModal);
            }
        } catch (error) {
            showToast('Invalid file format', 'error');
        }

        e.target.value = '';
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 &&
            elements.sidebar.classList.contains('open') &&
            !elements.sidebar.contains(e.target) &&
            !elements.menuBtn.contains(e.target)) {
            elements.sidebar.classList.remove('open');
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Escape to close modals
        if (e.key === 'Escape') {
            if (elements.addModal.classList.contains('active')) {
                closeModal(elements.addModal);
            } else if (elements.editModal.classList.contains('active')) {
                closeModal(elements.editModal);
            } else if (elements.syncModal.classList.contains('active')) {
                closeModal(elements.syncModal);
            }
        }

        // Cmd/Ctrl + N to add recipe
        if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
            e.preventDefault();
            openModal(elements.addModal);
        }

        // Cmd/Ctrl + F to focus search
        if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
            e.preventDefault();
            elements.searchInput.focus();
        }
    });
}

// ============================================
// Initialize
// ============================================

function init() {
    // Load theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    }

    // Load API key from local storage (will be overwritten by Firebase if logged in)
    claudeApiKey = localStorage.getItem(API_KEY_STORAGE);

    // Setup event listeners
    setupEventListeners();

    // Show login screen by default (Firebase auth will handle showing app)
    showLoginScreen();
}

function showApiKeyHint() {
    if (!claudeApiKey) {
        setTimeout(() => {
            showToast('Tip: Add your Claude API key in Settings for better recipe extraction', 'info');
        }, 3000);
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', init);

// Initialize Firebase when ready
window.addEventListener('firebase-ready', () => {
    console.log('Firebase SDK loaded');

    // Set up auth state listener
    if (window.firebaseOnAuthStateChanged && window.firebaseAuth) {
        window.firebaseOnAuthStateChanged(window.firebaseAuth, (user) => {
            currentUser = user;
            updateAuthUI();

            if (user) {
                console.log('User signed in:', user.email);
                setupFirebaseListener();
                setupFoldersListener();
                setupUserSettingsListener();

                // Initialize app after login
                renderFoldersList();
                updateFolderSelects();
                renderRecipeList();

                if (recipes.length > 0) {
                    selectRecipe(recipes[0].id);
                }

                // Show hint about API key if not set
                showApiKeyHint();
            } else {
                console.log('User signed out');
                // Login screen is shown by updateAuthUI
            }
        });
    } else {
        // No auth available - still require login
        console.log('Auth not available');
        showLoginScreen();
    }
});

// Fallback: If Firebase doesn't connect within 5 seconds, show offline mode
setTimeout(() => {
    if (!firebaseReady) {
        console.log('Firebase connection timeout, running in offline mode');
        updateSyncStatus(false, 'Offline mode');
    }
}, 5000);
