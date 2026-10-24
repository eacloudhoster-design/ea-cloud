import { useMemo, useState } from "react";
import type { ShapeStyle } from "@/context/AppContext";
import {
  isShapeStyle,
  shapePreferenceKey,
  portraitPreferenceKey,
  readPortraitPreference,
  nextPortraitPreference,
  type PortraitScope,
  type PortraitPreference,
} from "@/lib/shape-preference";
export function useShapePreference(
  token: string | null,
  scope: PortraitScope,
  mentorDefault?: ShapeStyle,
): [ShapeStyle, (value: ShapeStyle) => void, Exclude<ShapeStyle, "none">] {
  const key = portraitPreferenceKey(token, scope),
    legacy = shapePreferenceKey(token);
  const saved = useMemo(() => {
    try {
      return readPortraitPreference(localStorage, key, legacy, mentorDefault);
    } catch {
      return readPortraitPreference(
        { getItem: () => null },
        key,
        legacy,
        mentorDefault,
      );
    }
  }, [key, legacy, mentorDefault]);
  const [state, setState] = useState<{
    key: string | null;
    value: PortraitPreference;
  } | null>(null);
  const current = state?.key === key ? state.value : saved;
  return [
    current.shape,
    (value) => {
      if (!isShapeStyle(value)) return;
      const next = nextPortraitPreference(current, value);
      setState({ key, value: next });
      if (key)
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* Session interaction still works. */
        }
    },
    current.previous,
  ];
}
