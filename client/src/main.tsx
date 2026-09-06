import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { DbConnection } from './module_bindings';
import App from './App';
import { MaybeAuthProvider } from './auth';
import './index.css';

const HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? 'https://maincloud.spacetimedb.com';
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB ?? 'bidfund';
const TOKEN_KEY = 'bidfund_auth_token';

// The auth token is the only thing kept in localStorage. It is an identity
// credential, not application data — all application state lives in SpacetimeDB.
function readToken(): string | undefined {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

const connectionBuilder = DbConnection.builder()
  .withUri(HOST)
  .withDatabaseName(DB_NAME)
  .withToken(readToken())
  .onConnect((_conn, identity, token) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* private mode: identity is per-session, still works */
    }
    console.info('[bidfund] connected as', identity.toHexString());
  })
  .onConnectError((_ctx, err) => console.error('[bidfund] connect error', err))
  .onDisconnect((_ctx, err) => console.warn('[bidfund] disconnected', err));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <MaybeAuthProvider>
        <App />
      </MaybeAuthProvider>
    </SpacetimeDBProvider>
  </StrictMode>
);
