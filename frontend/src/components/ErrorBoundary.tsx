import { Component, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#05070b] p-8">
          <div className="max-w-lg rounded-xl border border-rose-500/25 bg-rose-500/8 px-6 py-5 text-center">
            <h1 className="mb-2 font-mono text-lg font-semibold text-rose-300">Something went wrong</h1>
            <p className="mb-4 font-mono text-sm text-slate-500">{this.state.error.message}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
