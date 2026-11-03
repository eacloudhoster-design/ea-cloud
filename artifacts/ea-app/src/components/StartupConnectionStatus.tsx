import type { RecoveryProgress } from "@/lib/connection-recovery";
/** Connection-only copy; never displays private backend response content. */
export default function StartupConnectionStatus({
  progress,
}: {
  progress: RecoveryProgress;
}) {
  const paused = progress.state === "paused";
  const slow = progress.state === "slow" || progress.elapsedMs >= 15000;
  return (
    <div
      role="status"
      aria-live="polite"
      className="px-6 text-center text-white"
    >
      <p className="text-lg font-semibold">
        {paused
          ? "Waiting for connection"
          : slow
            ? "Still connecting"
            : "Connecting to EA Cloud"}
      </p>
      <p className="mt-2 text-sm text-white/60">
        {paused
          ? "Reconnect to the internet or reopen EA Cloud to continue."
          : slow
            ? "EA Cloud is taking longer than usual to connect. We're automatically retrying."
            : "Establishing a secure connection. Please wait..."}
      </p>
    </div>
  );
}
