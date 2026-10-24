import type { ActivitySnapshot } from "../../../../lib/api-zod/src/trading-activity";
export class BotStartProgress {
  requestedAt = 0;
  saved = false;
  activated = false;
  connected = false;
  ready = false;
  request() {
    this.requestedAt = Date.now();
    this.saved = false;
    this.activated = false;
    this.connected = false;
    this.ready = false;
  }
  stop() {
    this.requestedAt = 0;
    this.saved = false;
    this.activated = false;
    this.connected = false;
    this.ready = false;
  }
  observe(
    snapshot: ActivitySnapshot,
    now = Date.now(),
  ): ("activated" | "connected" | "ready")[] {
    if (
      !this.saved ||
      !this.requestedAt ||
      snapshot.observedAt < this.requestedAt ||
      now - snapshot.observedAt > 35000 ||
      snapshot.observedAt > now + 5000 ||
      !snapshot.robotEnabled
    ) {
      this.connected = false;
      this.ready = false;
      return [];
    }
    const events: ("activated" | "connected" | "ready")[] = [];
    if (!this.activated && snapshot.engine) {
      this.activated = true;
      events.push("activated");
    }
    if (!this.activated) return events;
    if (!snapshot.connected) {
      this.connected = false;
      this.ready = false;
      return events;
    }
    if (!this.connected) {
      this.connected = true;
      events.push("connected");
    }
    if (snapshot.engine && snapshot.tradeAllowed && !this.ready) {
      this.ready = true;
      events.push("ready");
    }
    if (!snapshot.engine || !snapshot.tradeAllowed) this.ready = false;
    return events;
  }
}
