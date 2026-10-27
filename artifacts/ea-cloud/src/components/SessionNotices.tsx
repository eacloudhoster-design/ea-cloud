import { useAuth } from "@/contexts/AuthContext";
import { useClientAuth } from "@/contexts/ClientAuthContext";
export default function SessionNotices() {
  const portal = useAuth(),
    app = useClientAuth();
  if (!portal.sessionError && !app.sessionError) return null;
  return (
    <aside className="ea-session-notice" role="alert">
      <p>Unable to check your session. Public pages remain available.</p>
      <button
        type="button"
        onClick={() => {
          if (portal.sessionError) portal.retrySession();
          if (app.sessionError) app.retrySession();
        }}
      >
        Retry
      </button>
    </aside>
  );
}
