import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render-time crashes so a broken screen never blanks the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // A real deployment forwards this to Sentry/Datadog.
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 p-6 dark:bg-ink-950">
        <div className="card w-full max-w-md p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="mt-5 text-lg font-semibold text-ink-900 dark:text-ink-100">
            Something went wrong.
          </h1>
          <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
            The admin console hit an unexpected error. Reloading usually clears it.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-ink-100 p-3 text-left text-2xs text-ink-600 dark:bg-ink-800 dark:text-ink-400">
            {error.message}
          </pre>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
            <Button
              variant="primary"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => window.location.reload()}
            >
              Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
