import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  MobileLoginBackdrop,
  MobileLoginCloud,
} from "../../../ea-cloud/src/pages/admin/MobileLoginArtwork";
import cloud from "../../../ea-cloud/public/ea-cloud-mobile-cloud.png?url";
import background from "../../../ea-cloud/public/ea-cloud-auth-background.png?url";
import "../../../ea-cloud/src/pages/MentorAuth.css";
import "./GetApp.css";

interface AccessScreenProps {
  onAuthenticated: (
    token: string,
    status: string,
    licenseKey: string | null,
  ) => void;
}

type Mode = "register" | "login";

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  onEnter,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onEnter?: () => void;
}) {
  const id = useId();
  return (
    <div className="get-app-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        autoComplete={
          type === "email"
            ? "email"
            : type === "password"
              ? "current-password"
              : label === "FIRST NAME"
                ? "given-name"
                : "family-name"
        }
      />
    </div>
  );
}

export default function AccessScreen({ onAuthenticated }: AccessScreenProps) {
  const [mode, setMode] = useState<Mode>("register");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setError("");
    setFirstName("");
    setLastName("");
    setEmail("");
    setPassword("");
  };

  const handleRegister = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      setError("All fields are required");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/app/register", {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          password,
          plan: "monthly",
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setError("Email already registered. Sign in with your password.");
        setMode("login");
        return;
      }
      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }
      onAuthenticated(data.token, data.client.status, data.client.licenseKey);
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/app/login", {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Account not found");
        return;
      }
      onAuthenticated(data.token, data.client.status, data.client.licenseKey);
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handle = mode === "register" ? handleRegister : handleLogin;

  return (
    <main
      className="get-app-page"
      style={{ backgroundImage: `url("${background}")` }}
    >
      <MobileLoginBackdrop />
      <div className="get-app-brand">
        <MobileLoginCloud logoSource={cloud} />
      </div>
      <section className="get-app-panel" aria-labelledby="get-app-heading">
        <header>
          <h1 id="get-app-heading">EA Cloud</h1>
          <p>
            {mode === "register"
              ? "Create your account to get started"
              : "Sign in to your account"}
          </p>
        </header>
        <div className="get-app-fields">
          <Field
            label="EMAIL"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@email.com"
          />
          {mode === "register" && (
            <>
              <Field
                label="FIRST NAME"
                type="text"
                value={firstName}
                onChange={setFirstName}
                placeholder="First name"
              />
              <Field
                label="LAST NAME"
                type="text"
                value={lastName}
                onChange={setLastName}
                placeholder="Last name"
                onEnter={handle}
              />
            </>
          )}
          <Field
            label="PASSWORD"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="Your password"
            onEnter={handle}
          />
          {error && (
            <p role="alert" className="get-app-error">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={handle}
            disabled={loading}
            className="get-app-submit"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              "Access EA Cloud"
            )}
          </button>
        </div>
        <button
          type="button"
          disabled={loading}
          className="get-app-switch"
          onClick={() => {
            reset();
            setMode(mode === "register" ? "login" : "register");
          }}
        >
          {mode === "register"
            ? "Already have an account? Sign in"
            : "New to EA Cloud? Create an account"}
        </button>
      </section>
    </main>
  );
}
