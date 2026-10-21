import { Building2 } from "lucide-react";
import { useState } from "react";
import type { Broker } from "@/lib/brokers";

export default function BrokerLogo({ broker }: { broker: Broker | null }) {
  // The caller keys this component by broker. Missing local assets fail the
  // build/tests; a runtime error is explicit, never a substitute broker icon.
  const [failed, setFailed] = useState(false);
  return (
    <div className={`mt5-broker-logo ${broker ? "mt5-broker-logo--image" : ""}`}
      style={broker ? { background: broker.logoBackground ?? "#fff" } : undefined}>
      {!broker ? <Building2 aria-label="Unknown broker" size={54} strokeWidth={1.2} /> : failed ? (
        <span role="alert" style={{ color: "#627b84", fontSize: 11, textAlign: "center" }}>
          {broker.name}<br />Logo unavailable<br />
          <button type="button" onClick={() => setFailed(false)}>Retry logo</button>
        </span>
      ) : <img src={broker.logo} alt={`${broker.name} logo`} onError={() => setFailed(true)} />}
    </div>
  );
}
