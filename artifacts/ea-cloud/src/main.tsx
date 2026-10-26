import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setAuthTokenGetter } from "@workspace/api-client-react";

// Remove obsolete bearer secrets; the API verifies HttpOnly cookies on every load.
for (const key of ["token", "app_token", "appClientToken"]) try { localStorage.removeItem(key); } catch {}
setAuthTokenGetter(null);

createRoot(document.getElementById("root")!).render(<App />);
