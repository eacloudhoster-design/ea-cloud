import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
export const CONSENT_KEY = "ea-cloud:privacy-consent:v1";
export const CONSENT_DAYS = 180;
export type Consent = {
  version: 1;
  functional: boolean;
  analytics: false;
  marketing: false;
  expiresAt: number;
};
const fresh = (functional = false): Consent => ({
  version: 1,
  functional,
  analytics: false,
  marketing: false,
  expiresAt: Date.now() + CONSENT_DAYS * 86400000,
});
const read = (): Consent | null => {
  try {
    const v = JSON.parse(localStorage.getItem(CONSENT_KEY) || "null");
    return v?.version === 1 &&
      typeof v.functional === "boolean" &&
      v.analytics === false &&
      v.marketing === false &&
      typeof v.expiresAt === "number" &&
      Number.isFinite(v.expiresAt) &&
      v.expiresAt > Date.now()
      ? v
      : null;
  } catch {
    return null;
  }
};
const Context = createContext<{
  consent: Consent | null;
  save: (functional: boolean) => boolean;
  error: string;
}>({ consent: null, save: () => false, error: "" });
export const usePrivacy = () => useContext(Context);
export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<Consent | null>(read),
    [error, setError] = useState("");
  const [path, navigate] = useLocation();
  const save = (functional: boolean) => {
    const value = fresh(functional);
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(value));
      setConsent(value);
      setError("");
      return true;
    } catch {
      setConsent(null);
      setError(
        "Preferences could not be saved in this browser. Optional resources remain disabled. Enable storage and retry.",
      );
      return false;
    }
  };
  useEffect(() => {
    const sync = () => setConsent(read());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (!consent) return;
    const check = () => {
      if (consent.expiresAt <= Date.now()) setConsent(null);
    };
    const t = setInterval(check, 60_000);
    check();
    return () => clearInterval(t);
  }, [consent]);
  // This public-site provider is never mounted in the standalone trading app.
  const publicPage =
    path === "/" || path === "/register" || path.startsWith("/legal");
  useEffect(() => {
    if (!publicPage || !consent?.functional) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
    link.dataset.eaOptional = "functional";
    document.head.appendChild(link);
    return () => link.remove();
  }, [consent?.functional, publicPage]);
  return (
    <Context.Provider value={{ consent, save, error }}>
      {children}
      {publicPage && path !== "/legal/cookie-settings" && !consent && (
        <aside
          className="privacy-banner"
          aria-label="Cookie preferences notice"
        >
          <p>
            EA Cloud uses cookies and similar technologies to operate our
            website, remember preferences and, with your permission, improve
            your experience. You can accept optional cookies, reject them or
            manage your preferences.
          </p>
          <div>
            <button onClick={() => save(true)}>Accept All</button>
            <button onClick={() => save(false)}>Reject Optional</button>
            <button onClick={() => navigate("/legal/cookie-settings")}>
              Manage Preferences
            </button>
            <a href="/legal/cookies">Cookie Policy</a>
          </div>
          {error && <p role="alert">{error}</p>}
        </aside>
      )}
    </Context.Provider>
  );
}
