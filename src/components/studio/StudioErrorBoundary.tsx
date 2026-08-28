import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Catch Studio mount/render crashes (incl. lazy-chunk eval).
 * Never leave /studio as a blank grey page.
 */
export class StudioErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[studio] mount crash", error, info.componentStack);
  }

  retry = () => {
    this.setState({ error: null });
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        className="flex min-h-dvh items-center justify-center px-6"
        style={{ background: "#f4efe6", color: "#1c1d21" }}
        data-studio-crash
      >
        <div className="w-full max-w-md rounded-2xl border border-black/10 bg-[#faf7f2] p-6 shadow-sm">
          <p className="font-serif text-xl font-semibold">Studio sa nenačítalo</p>
          <p className="mt-2 text-sm leading-relaxed text-black/60">
            Niečo spadlo pri otvorení Studia. Skús znova — nič sa nestratí z
            cloudu.
          </p>
          <button
            type="button"
            onClick={this.retry}
            className="mt-5 inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white"
            style={{ background: "#c45c38" }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
}
