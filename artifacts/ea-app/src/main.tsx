import { createRoot } from "react-dom/client";
import App from "./App";
import StartupErrorBoundary from "./components/StartupErrorBoundary";
import {startupDiagnostic} from "./lib/startup-diagnostics";
import "./index.css";

window.addEventListener("error",()=>startupDiagnostic({event:"startup_frontend_failed",phase:"window",category:"frontend",code:"FRONTEND_UNCAUGHT_ERROR"}));
window.addEventListener("unhandledrejection",()=>startupDiagnostic({event:"startup_frontend_failed",phase:"promise",category:"frontend",code:"FRONTEND_UNHANDLED_REJECTION"}));
window.addEventListener("vite:preloadError",()=>startupDiagnostic({event:"startup_frontend_failed",phase:"assets",category:"frontend",code:"FRONTEND_ASSET_LOAD_FAILED"}));
createRoot(document.getElementById("root")!).render(<StartupErrorBoundary><App /></StartupErrorBoundary>);
