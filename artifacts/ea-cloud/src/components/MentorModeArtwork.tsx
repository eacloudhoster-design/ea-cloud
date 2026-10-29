import { useState } from "react";
import { useGetEas } from "@workspace/api-client-react";
import EaModeImageEditor from "./EaModeImageEditor";
export default function MentorModeArtwork() {
  const { data: eas, isLoading, isError, refetch } = useGetEas();
  const [selected, setSelected] = useState(
    () => Number(new URLSearchParams(location.search).get("ea")) || 0,
  );
  const [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const ea = eas?.find((item) => item.id === selected) || eas?.[0];
  return (
    <section
      id="app-background-images"
      className="border-t border-white/10 pt-5"
      aria-labelledby="app-background-heading"
    >
      <h4
        id="app-background-heading"
        className="text-sm font-bold text-white tracking-wider mb-2"
      >
        APP BACKGROUND IMAGES
      </h4>
      <p className="text-sm text-white/60 mb-4">
        Customise your EA's appearance by uploading a unique background image
        for each trading mode.
      </p>
      <p className="text-xs text-white/50 mb-4">
        Select your EA and upload a background image for each trading mode.
      </p>
      {isLoading && (
        <p role="status" className="text-sm text-white/50">
          Loading EAs…
        </p>
      )}
      {isError && (
        <button
          type="button"
          className="text-sm text-red-300"
          onClick={() => void refetch()}
        >
          Unable to load EAs. Retry
        </button>
      )}
      {ea && (
        <>
          <label
            className="block text-xs text-white/60 mb-2"
            htmlFor="background-ea"
          >
            EA to customise
          </label>
          <select
            id="background-ea"
            aria-label="EA for mode artwork"
            value={ea.id}
            disabled={busy}
            onChange={(event) => {
              if (
                !dirty ||
                window.confirm("Discard unsaved artwork changes and switch EA?")
              ) {
                setSelected(Number(event.target.value));
                setDirty(false);
              }
            }}
            className="w-full bg-black/50 border border-white/10 rounded-lg text-white text-sm p-3 mb-4"
          >
            {eas?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <EaModeImageEditor
            key={ea.id}
            eaId={ea.id}
            name={ea.name}
            onBusyChange={setBusy}
            onDirtyChange={setDirty}
          />
        </>
      )}
      {!isLoading && !isError && !ea && (
        <p className="text-sm text-white/50">
          Create an EA in EA Manager before adding background images.
        </p>
      )}
    </section>
  );
}
