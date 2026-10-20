import { Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Broker } from "@/lib/brokers";

export default function BrokerLogo({ broker }: { broker: Broker | null }) {
  // Keyed by broker in the caller so one failed logo never hides another broker.
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!broker || loaded) return;
    const timer = setTimeout(() => setFailed(true), 4000);
    return () => clearTimeout(timer);
  }, [broker, loaded]);
  return (
    <div className={`mt5-broker-logo ${broker && loaded && !failed ? "mt5-broker-logo--image" : ""}`}>
      {(!loaded || failed) && <Building2 aria-label={broker ? `${broker.name} logo unavailable` : "Unknown broker"} size={54} strokeWidth={1.2} />}
      {broker && !failed && <img src={broker.logo} alt={`${broker.name} logo`} referrerPolicy="no-referrer"
        style={{ display: loaded ? "block" : "none" }} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
    </div>
  );
}
