export type ThemeMode = 'light' | 'dark';

export interface UiPreferences {
  theme: ThemeMode;
}

export const UI_PREFS_COOKIE = 'ui_prefs';
export const UI_PREFS_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  theme: 'light',
};

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

export function parseUiPreferences(raw: string | undefined | null): UiPreferences {
  if (!raw) {
    return { ...DEFAULT_UI_PREFERENCES };
  }

  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded) as Partial<UiPreferences>;
    return {
      theme: isThemeMode(parsed.theme) ? parsed.theme : DEFAULT_UI_PREFERENCES.theme,
    };
  } catch {
    // Legacy plain theme cookie values
    if (isThemeMode(raw)) {
      return { theme: raw };
    }
    return { ...DEFAULT_UI_PREFERENCES };
  }
}

export function serializeUiPreferences(prefs: UiPreferences): string {
  return encodeURIComponent(JSON.stringify(prefs));
}

export function buildUiPreferencesCookie(prefs: UiPreferences): string {
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  return `${UI_PREFS_COOKIE}=${serializeUiPreferences(prefs)}; Path=/; Max-Age=${UI_PREFS_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

export function readUiPreferencesFromDocumentCookie(): UiPreferences | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${UI_PREFS_COOKIE}=([^;]*)`));
  if (!match) return null;
  return parseUiPreferences(match[1]);
}

export function writeUiPreferencesCookie(prefs: UiPreferences) {
  if (typeof document === 'undefined') return;
  document.cookie = buildUiPreferencesCookie(prefs);
}
