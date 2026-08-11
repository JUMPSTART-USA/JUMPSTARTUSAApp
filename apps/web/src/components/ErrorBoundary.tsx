import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/spinner';
import { hasUnsavedWork } from '@/components/ui/unsaved-changes';

/**
 * The app's only error boundary. Until now it had none anywhere, so a render
 * throw unmounted the tree to a blank white window — and in the installed Dock
 * app there is no address bar to recover with (audit finding: "no error boundary
 * exists anywhere … a render throw or a stalled bundle fetch is a blank white
 * window").
 *
 * It also has to handle a second, more specific failure: a chunk that 404s.
 * nginx.conf serves `try_files $uri $uri/ /index.html`, so once a deploy has
 * replaced the hashed filenames, a still-open tab requesting an old chunk gets
 * index.html back with HTTP 200 and Content-Type text/html — and the import
 * rejects on the MIME type rather than on a 404. The cause is always the same as
 * build-version.ts's: a newer build is live. So the response is the same one,
 * with the same guard — reload, unless that would destroy unsaved work.
 */

const CHUNK_FAILURE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload|expected a javascript(-or-wasm)? module script/i;

/** One attempt per tab session: a genuinely broken deploy must not reload forever. */
const RELOAD_KEY = 'jumpstart.chunkReloadAttempted';

function isChunkFailure(error: unknown): boolean {
  return error instanceof Error && CHUNK_FAILURE.test(`${error.name} ${error.message}`);
}

function clearReloadGuard() {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    // Storage denied — nothing to clear.
  }
}

interface Props {
  children: ReactNode;
  /** Changes when the user navigates, so a recovered route is not stuck on the error. */
  resetKey?: string;
}

interface State {
  error: unknown;
}

class ErrorBoundaryInner extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  override componentDidUpdate(prev: Props, prevState: State) {
    // A boundary latches: without this, every later navigation changes the URL
    // while the content column keeps rendering the same dead error.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
      return;
    }
    if (prevState.error && !this.state.error) clearReloadGuard();
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    // No client error reporting exists yet (Phase 5). The console is all a
    // developer gets, so make it complete rather than swallowing the stack.
    console.error('Unhandled render error', error, info.componentStack);

    if (!isChunkFailure(error)) return;
    if (hasUnsavedWork()) return; // Never reload over a half-filled form.
    try {
      if (sessionStorage.getItem(RELOAD_KEY)) return;
      sessionStorage.setItem(RELOAD_KEY, '1');
    } catch {
      return; // Storage denied: fall through to the message rather than looping.
    }
    window.location.reload();
  }

  override componentDidMount() {
    /**
     * A healthy screen means any earlier reload worked, so release the one-shot
     * guard — otherwise the SECOND deploy in a long-lived tab gets the error
     * screen instead of the reload.
     *
     * The `error` check is load-bearing. When a child throws on the FIRST render,
     * React re-renders this boundary with the error state and commits, so
     * componentDidMount runs — before componentDidCatch. Clearing unconditionally
     * therefore wiped the guard a moment before the catch read it, and the
     * reload-once rule never held. (Caught by the test below, not by review.)
     */
    if (!this.state.error) clearReloadGuard();
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const stale = isChunkFailure(error);
    return (
      <div className="space-y-3">
        <ErrorState
          error={
            stale
              ? new Error(
                  hasUnsavedWork()
                    ? 'A new version of the app was released while this page was open. Save your work, then reload to continue.'
                    : 'A new version of the app was released. Reload to continue.',
                )
              : error
          }
        />
        <div className="flex gap-2">
          <Button type="button" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    );
  }
}

/** Wraps the class boundary so it can reset itself on navigation. */
export function ErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundaryInner resetKey={pathname}>{children}</ErrorBoundaryInner>;
}

/** For the tree above the router, where there is no location to key on. */
export function RootErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundaryInner>{children}</ErrorBoundaryInner>;
}
