/** Public shell only: protected children are never mounted before authorization. */
export default function PortalLoading() {
  return (
    <section
      className="ea-portal-loading"
      aria-busy="true"
      aria-label="Portal loading"
    >
      <div className="ea-portal-loading-line" />
      <div className="ea-portal-loading-card" />
      <span className="sr-only" role="status">
        Loading portal
      </span>
    </section>
  );
}
