import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import "./EaModeImageEditor.css";
import { Button } from "@/components/ui/button";
const names = ["NORMAL", "BEAST", "AGGRESSIVE", "ULTIMATE"];
export default function EaModeImageEditor({
  eaId,
  name,
  onBusyChange,
  onDirtyChange,
}: {
  eaId: number;
  name: string;
  onBusyChange: (busy: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [images, setImages] = useState<(string | null)[]>([
    null,
    null,
    null,
    null,
  ]);
  const [fallback, setFallback] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [savedImages, setSavedImages] = useState<(string | null)[]>([
    null,
    null,
    null,
    null,
  ]);
  const [progress, setProgress] = useState<{
    index: number;
    percent: number;
  } | null>(null);
  const uploadRequest = useRef<XMLHttpRequest | null>(null);
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);
  useEffect(() => {
    onDirtyChange(JSON.stringify(images) !== JSON.stringify(savedImages));
  }, [images, savedImages, onDirtyChange]);
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const alive = useRef(true),
    urls = useRef<string[]>([]),
    pending = useRef(false);
  const api = async (url: string, init: RequestInit = {}) => {
    const token = "cookie-portal";
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Image request failed. Please retry.");
    }
    return response;
  };
  const load = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const data = await (await api(`/api/eas/${eaId}/mode-images`)).json();
      if (alive.current) {
        setImages(data.savedImages);
        setSavedImages(data.savedImages);
        setFallback(data.normalFallback);
        setLoaded(true);
      }
    } catch (err) {
      if (alive.current) setError((err as Error).message);
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      uploadRequest.current?.abort();
      urls.current.forEach(URL.revokeObjectURL);
    };
  }, [eaId]);
  const upload = async (index: number, file: File) => {
    if (pending.current) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size < 1 ||
      file.size > 10 * 1024 * 1024
    ) {
      setError("Select a JPG, PNG or WebP image up to 10MB.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setProgress({ index, percent: 0 });
    const local = URL.createObjectURL(file);
    urls.current.push(local);
    setPreview((old) => ({ ...old, [index]: local }));
    try {
      const data = await (
        await api("/api/storage/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            contentType: file.type,
          }),
        })
      ).json();
      if (!alive.current) return;
      const target = new URL(data.uploadURL, location.href);
      if (target.origin !== location.origin && target.protocol !== "https:")
        throw new Error("Invalid upload endpoint.");
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        uploadRequest.current = xhr;
        xhr.open("PUT", target.href);
        xhr.timeout = 30000;
        xhr.setRequestHeader("Content-Type", file.type);
        if (target.origin === location.origin)
          xhr.setRequestHeader("Authorization", "Bearer cookie-portal");
        xhr.upload.onprogress = (event) => {
          if (alive.current && event.lengthComputable)
            setProgress({
              index,
              percent: Math.round((event.loaded / event.total) * 100),
            });
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else {
            let message = "Image upload failed. Please retry.";
            try {
              message = JSON.parse(xhr.responseText).error || message;
            } catch {}
            reject(new Error(message));
          }
        };
        xhr.onerror = () =>
          reject(new Error("Image upload connection failed. Please retry."));
        xhr.ontimeout = () =>
          reject(new Error("Image upload timed out. Please retry."));
        xhr.onabort = () => reject(new Error("Image upload cancelled."));
        if (alive.current) setProgress({ index, percent: 0 });
        xhr.send(file);
      });
      if (alive.current) {
        setImages((old) =>
          old.map((value, i) =>
            i === index ? `/api/storage${data.objectPath}` : value,
          ),
        );
        setMessage(
          `${names[index]} image uploaded. Save artwork to publish it to clients.`,
        );
      }
    } catch (err) {
      if (alive.current) {
        setError((err as Error).message);
        setPreview((old) => {
          const copy = { ...old };
          delete copy[index];
          return copy;
        });
      }
    } finally {
      uploadRequest.current = null;
      pending.current = false;
      if (alive.current) {
        setBusy(false);
        setProgress(null);
      }
    }
  };
  const save = async () => {
    if (pending.current || !loaded) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await (
        await api(`/api/eas/${eaId}/mode-images`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ images }),
        })
      ).json();
      if (alive.current) {
        setImages(data.savedImages);
        setSavedImages(data.savedImages);
        setFallback(data.normalFallback);
        setPreview({});
        setMessage("Artwork saved. Linked clients refresh automatically.");
      }
    } catch (err) {
      if (alive.current) setError((err as Error).message);
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <div
      className="mentor-background-editor"
      aria-label={`${name} background images`}
      aria-busy={busy}
    >
      <p className="text-xs text-white/50 mb-4">
        JPG, PNG or WebP · Maximum 10MB per image. Uploads and removals are
        published only when you select Save artwork. Trading settings are
        unaffected.
      </p>
      {!loaded && (
        <Button type="button" disabled={busy} onClick={() => void load()}>
          {busy ? "Loading…" : "Retry loading"}
        </Button>
      )}
      <div className="mentor-background-grid">
        {names.map((mode, index) => {
          const src =
            preview[index] || images[index] || (index === 0 ? fallback : null);
          const inherited = index === 0 && !images[index] && !!fallback;
          return (
            <article
              key={mode}
              className="mentor-background-card"
              aria-label={`${mode} background`}
            >
              <h5>{mode}</h5>
              <div className="mentor-background-preview">
                {src ? (
                  <img src={src} alt={`${mode} artwork preview`} />
                ) : (
                  <div className="mentor-background-empty">
                    <ImagePlus aria-hidden="true" />
                    <span>No image uploaded</span>
                  </div>
                )}
              </div>
              <label
                className="mentor-background-upload"
                aria-disabled={busy || !loaded}
              >
                <span>
                  {busy ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <ImagePlus aria-hidden="true" />
                  )}
                  {src ? "Change Image" : "Upload Background"}
                </span>
                <input
                  aria-label={`Upload ${mode} image`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy || !loaded}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void upload(index, file);
                  }}
                />
              </label>
              <button
                type="button"
                disabled={busy || !loaded || !images[index]}
                className="mentor-background-remove"
                onClick={() => {
                  setImages((old) =>
                    old.map((v, i) => (i === index ? null : v)),
                  );
                  setPreview((old) => {
                    const next = { ...old };
                    delete next[index];
                    return next;
                  });
                  setMessage("Save artwork to apply this change.");
                }}
              >
                <Trash2 aria-hidden="true" />
                Remove Image<span className="sr-only"> for {mode}</span>
              </button>
              {progress?.index === index && (
                <div role="status" className="text-xs text-red-200 mt-2">
                  Uploading {mode}… {progress.percent}%
                  <progress
                    className="w-full accent-red-500"
                    aria-label={`${mode} upload progress`}
                    value={progress.percent}
                    max={100}
                  />
                </div>
              )}
              {inherited && (
                <p className="mentor-background-inherited">
                  Existing profile background. Upload to override it for this
                  EA; removing an override restores this image.
                </p>
              )}
            </article>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-red-400 text-sm mt-4">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-red-200 text-sm mt-4">
          {message}
        </p>
      )}
      <Button
        type="button"
        disabled={busy || !loaded}
        onClick={() => void save()}
        className="mt-5"
      >
        {busy ? "Please wait…" : "Save artwork"}
      </Button>
    </div>
  );
}
