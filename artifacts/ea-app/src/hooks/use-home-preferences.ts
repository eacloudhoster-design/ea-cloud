import { useEffect, useState } from "react";
import {
  defaultHomePreferences,
  isAccentColor,
  isBackgroundAnimation,
  type BackgroundAnimation,
  homePreferenceKey,
  isInterfaceStyle,
  readHomePreferences,
  saveHomePreferences,
  type HomePreferences,
} from "@/lib/home-preferences";
import type { InterfaceStyle } from "@/context/AppContext";

export function useHomePreferences(token: string | null) {
  const key = homePreferenceKey(token);
  const [state, setState] = useState<{
    key: string | null;
    preferences: HomePreferences;
  }>({
    key: null,
    preferences: { ...defaultHomePreferences },
  });
  useEffect(() => {
    let preferences = { ...defaultHomePreferences };
    try {
      preferences = readHomePreferences(localStorage, key);
    } catch {
      /* In-memory settings still work. */
    }
    setState({ key, preferences });
  }, [key]);
  useEffect(() => {
    if (state.key === key) {
      try {
        saveHomePreferences(localStorage, key, state.preferences);
      } catch {
        /* Storage may be blocked. */
      }
    }
  }, [key, state]);

  const update = (patch: Partial<HomePreferences>) =>
    setState((previous) => ({
      key,
      preferences: {
        ...(previous.key === key
          ? previous.preferences
          : defaultHomePreferences),
        ...patch,
      },
    }));
  const preferences =
    state.key === key ? state.preferences : defaultHomePreferences;
  return {
    ...preferences,
    setAccentColor: (value: string) => {
      if (isAccentColor(value)) update({ accentColor: value });
    },
    setInterfaceStyle: (value: InterfaceStyle) => {
      if (isInterfaceStyle(value)) update({ interfaceStyle: value });
    },
    setBackgroundAnimation: (value: BackgroundAnimation) => {
      if (isBackgroundAnimation(value)) update({ backgroundAnimation: value });
    },
    setShowBg: (value: boolean) => {
      if (typeof value === "boolean") update({ showBg: value });
    },
  };
}
