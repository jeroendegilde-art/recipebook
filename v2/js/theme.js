// Thema: volgt het apparaat, of vast licht of donker.

const KEY = 'rb2:theme';
const COLORS = { light: '#fbfaf7', dark: '#161513' };

export function getTheme() {
    try {
        const value = localStorage.getItem(KEY);
        return value === 'light' || value === 'dark' ? value : 'auto';
    } catch {
        return 'auto';
    }
}

export function applyTheme(theme = getTheme()) {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    else delete root.dataset.theme;

    try {
        if (theme === 'auto') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, theme);
    } catch { /* keuze geldt dan alleen voor deze sessie */ }

    const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? COLORS.dark : COLORS.light);
}
