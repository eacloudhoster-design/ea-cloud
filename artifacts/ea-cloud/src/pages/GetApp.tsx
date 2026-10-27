import { useLayoutEffect } from "react";
import { useClientAuth } from "@/contexts/ClientAuthContext";
import AccessScreen from "../../../ea-app/src/pages/AccessScreen";

/** Public form uses the existing app API; authenticated handoff keeps its HttpOnly cookie. */
export default function GetApp() {
  const { client, loading } = useClientAuth();
  useLayoutEffect(() => {
    if (!loading && client) window.location.assign("/ea-app/");
  }, [client, loading]);
  return (
    <AccessScreen onAuthenticated={() => window.location.assign("/ea-app/")} />
  );
}
