/** Public shell only: protected children are never mounted before authorization. */
export default function PortalLoading({unavailable=false,retry,loginPath="/"}:{unavailable?:boolean;retry?:()=>void;loginPath?:string}={}) {
  if(unavailable)return <section className="min-h-screen bg-[#080810] px-6 py-16 text-center text-white" aria-busy="false" role="alert">
    <h1 className="text-xl font-semibold">Session verification unavailable</h1>
    <p className="mt-4">EA Cloud could not verify your session. Your sign-in has not been cleared. Retry when the connection returns.</p>
    {retry&&<button type="button" className="mt-6 rounded border px-5 py-3" onClick={retry}>Retry session</button>}
    <p className="mt-6"><a href="/">Public website</a> · <a href={loginPath}>Sign-in page</a></p>
  </section>;
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
