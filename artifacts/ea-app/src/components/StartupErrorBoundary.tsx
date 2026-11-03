import { Component, Fragment, type ReactNode } from "react";
import { startupDiagnostic } from "@/lib/startup-diagnostics";
export default class StartupErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; generation: number }
> {
  state = { failed: false, generation: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    startupDiagnostic({
      event: "startup_frontend_failed",
      phase: "render",
      category: "frontend",
      code: "FRONTEND_RENDER_FAILED",
    });
  }
  render() {
    if (this.state.failed)
      return (
        <div
          className="flex items-center justify-center bg-black"
          style={{ height: "100dvh", maxWidth: 430, margin: "0 auto" }}
        >
          <div className="text-white text-center p-6" role="alert">
            <p>The app could not finish loading. Please retry.</p>
            <button
              className="mt-4 rounded-xl bg-red-500 px-5 py-3"
              onClick={() =>
                this.setState(({ generation }) => ({
                  failed: false,
                  generation: generation + 1,
                }))
              }
            >
              Retry
            </button>
          </div>
        </div>
      );
    return (
      <Fragment key={this.state.generation}>{this.props.children}</Fragment>
    );
  }
}
