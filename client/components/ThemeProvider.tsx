"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  type ThemeMode,
  type UiPreferences,
  DEFAULT_UI_PREFERENCES,
  isThemeMode,
  readUiPreferencesFromDocumentCookie,
  writeUiPreferencesCookie,
} from '@/lib/uiPreferences';

interface ThemeContextValue {
  theme: ThemeMode;
  preferences: UiPreferences;
  setTheme: (theme: ThemeMode) => void;
  setPreferences: (patch: Partial<UiPreferences>) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
}

function migrateLegacyLocalStorageTheme(): ThemeMode | null {
  try {
    const legacy = localStorage.getItem('themeMode');
    if (isThemeMode(legacy)) {
      localStorage.removeItem('themeMode');
      return legacy;
    }
  } catch {
    // Ignore storage access errors.
  }
  return null;
}

export function ThemeProvider({
  children,
  initialPreferences = DEFAULT_UI_PREFERENCES,
}: {
  children: React.ReactNode;
  initialPreferences?: UiPreferences;
}) {
  const [preferences, setPreferencesState] = useState<UiPreferences>(initialPreferences);

  useEffect(() => {
    const fromCookie = readUiPreferencesFromDocumentCookie();
    if (fromCookie) {
      setPreferencesState(fromCookie);
      applyTheme(fromCookie.theme);
      return;
    }

    const legacyTheme = migrateLegacyLocalStorageTheme();
    if (legacyTheme) {
      const migrated = { ...DEFAULT_UI_PREFERENCES, theme: legacyTheme };
      writeUiPreferencesCookie(migrated);
      setPreferencesState(migrated);
      applyTheme(legacyTheme);
      return;
    }

    applyTheme(initialPreferences.theme);
  }, [initialPreferences.theme]);

  const setPreferences = useCallback((patch: Partial<UiPreferences>) => {
    setPreferencesState((current) => {
      const next = {
        ...current,
        ...patch,
        theme: isThemeMode(patch.theme) ? patch.theme : current.theme,
      };
      writeUiPreferencesCookie(next);
      applyTheme(next.theme);
      return next;
    });
  }, []);

  const setTheme = useCallback(
    (theme: ThemeMode) => {
      setPreferences({ theme });
    },
    [setPreferences]
  );

  const toggleTheme = useCallback(() => {
    setPreferencesState((current) => {
      const next = {
        ...current,
        theme: (current.theme === 'dark' ? 'light' : 'dark') as ThemeMode,
      };
      writeUiPreferencesCookie(next);
      applyTheme(next.theme);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      theme: preferences.theme,
      preferences,
      setTheme,
      setPreferences,
      toggleTheme,
    }),
    [preferences, setTheme, setPreferences, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

export type { ThemeMode, UiPreferences };
