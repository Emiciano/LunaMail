import { Component, type ReactNode } from "react";

type State = {
  error?: Error;
};

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center bg-slate-100 p-8 text-slate-800 dark:bg-[#111418] dark:text-slate-100">
          <div className="tr-panel max-w-lg rounded-[10px] p-6">
            <h1 className="text-lg font-semibold text-white">Ansicht konnte nicht geladen werden</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{this.state.error.message}</p>
            <button
              className="accent-primary mt-5 rounded-lg px-4 py-2 text-sm font-semibold"
              onClick={() => this.setState({ error: undefined })}
            >
              Zurück
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
