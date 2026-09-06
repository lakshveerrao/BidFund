import { type ReactNode, useEffect } from 'react';
import { AuthProvider, useAuth } from 'react-oidc-context';
import { LogIn } from 'lucide-react';

// SpacetimeAuth (OIDC). Optional: only prefills name + email on the join
// screen and never gates participation. The SpacetimeDB connection keeps its
// own identity token, so nothing about existing users changes.
export const STDB_AUTH_CLIENT_ID: string = import.meta.env.VITE_STDB_AUTH_CLIENT_ID ?? '';
const RETURN_KEY = 'bidfund_auth_return';

const oidcConfig = {
  authority: 'https://auth.spacetimedb.com/oidc',
  client_id: STDB_AUTH_CLIENT_ID,
  redirect_uri: `${window.location.origin}/callback`,
  post_logout_redirect_uri: window.location.origin,
  scope: 'openid profile email',
  response_type: 'code',
  automaticSilentRenew: true,
};

function onSigninCallback() {
  let back = '/';
  try {
    back = sessionStorage.getItem(RETURN_KEY) || '/';
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    /* ignore */
  }
  window.history.replaceState({}, document.title, back);
}

export function MaybeAuthProvider({ children }: { children: ReactNode }) {
  if (!STDB_AUTH_CLIENT_ID) return <>{children}</>;
  return (
    <AuthProvider {...oidcConfig} onSigninCallback={onSigninCallback}>
      {children}
    </AuthProvider>
  );
}

export type AuthProfile = { name: string; email: string; username: string };

function useAuthSafe() {
  // useAuth throws outside a provider; the provider is absent when no client id is set.
  try {
    return useAuth();
  } catch {
    return null;
  }
}

export function useSpacetimeAuthProfile(): AuthProfile | null {
  const auth = useAuthSafe();
  const p = auth?.user?.profile;
  if (!p) return null;
  return {
    name: String(p.name ?? p.preferred_username ?? ''),
    email: String(p.email ?? ''),
    username: String(p.preferred_username ?? ''),
  };
}

export function SpacetimeSignIn({ label = 'Continue with SpacetimeAuth' }: { label?: string }) {
  const auth = useAuthSafe();
  if (!STDB_AUTH_CLIENT_ID || !auth) return null;
  if (auth.isAuthenticated) {
    return (
      <div className="unote" style={{ marginBottom: 10 }}>
        SIGNED IN AS {String(auth.user?.profile.email ?? auth.user?.profile.name ?? '').toUpperCase()}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="btn secondary block"
      style={{ marginBottom: 12 }}
      disabled={auth.isLoading}
      onClick={() => {
        try {
          sessionStorage.setItem(RETURN_KEY, window.location.pathname + window.location.search);
        } catch {
          /* ignore */
        }
        void auth.signinRedirect();
      }}
    >
      <LogIn size={16} /> {label}
    </button>
  );
}

// /callback: react-oidc-context completes the code exchange on load; we just
// show a status until onSigninCallback has moved the URL back.
export function CallbackPage() {
  const auth = useAuthSafe();
  useEffect(() => {
    if (!auth) window.location.replace('/');
  }, [auth]);
  useEffect(() => {
    if (auth && !auth.isLoading && window.location.pathname === '/callback') {
      let back = '/';
      try {
        back = sessionStorage.getItem(RETURN_KEY) || '/';
      } catch {
        /* ignore */
      }
      window.location.replace(back);
    }
  }, [auth?.isLoading]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main className="wrap" style={{ paddingTop: 60 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="spin" />
        <span className="label strong">{auth?.error ? `SIGN-IN FAILED: ${auth.error.message}` : 'SIGNING IN…'}</span>
      </div>
    </main>
  );
}
