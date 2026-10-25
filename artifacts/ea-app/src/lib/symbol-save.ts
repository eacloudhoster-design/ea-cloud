import { assistantEvent } from "./assistant-events";
const announcedSaves = new Set<string>();
type SymbolSelection = {
  pairName: string;
  selectedSymbol: string | null;
  customLotSize: string | null;
};
/** Verify the actual response before announcing, keeping the existing array API. */
export function confirmSymbolSave(
  saved: unknown,
  submitted: SymbolSelection[],
  saveId: string,
) {
  if (
    !Array.isArray(saved) ||
    !submitted.length ||
    !submitted.every((expected) =>
      saved.some(
        (row) =>
          row?.pairName === expected.pairName &&
          row.selectedSymbol === expected.selectedSymbol &&
          row.customLotSize ===
            (expected.customLotSize
              ? Number(expected.customLotSize).toFixed(2)
              : null),
      ),
    )
  )
    return false;
  const configured = submitted.find((row) => row.selectedSymbol);
  if (configured && !announcedSaves.has(saveId)) {
    announcedSaves.add(saveId);
    if (announcedSaves.size > 200)
      announcedSaves.delete(announcedSaves.values().next().value!);
    try {
      assistantEvent({
        type: "symbol-saved",
        symbol: configured.selectedSymbol!,
        saveId,
      });
    } catch {
      /* Audio/event failures must never undo saved settings. */
    }
  }
  return true;
}
