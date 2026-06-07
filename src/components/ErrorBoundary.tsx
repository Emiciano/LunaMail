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
          <div className="max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-soft dark:border-red-500/25 dark:bg-[#181c22]">
            <h1 className="text-lg font-semibold text-red-600 dark:text-red-300">Ansicht konnte nicht geladen werden</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{this.state.error.message}</p>
            <button
              className="mt-5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
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
