import { useMemo, useState } from 'react';
import { useReducer, useTable } from 'spacetimedb/react';
import { reducers, tables } from './module_bindings';
import { Search, X } from 'lucide-react';
import { humanError } from './ui';

// Multi-backer invite: search usernames/names, pick several, send in one go.
// Each invite is its own reducer call so a bad handle never blocks the rest.
export default function Invite({ sprintId, myUsername, myHex }: { sprintId: bigint; myUsername: string; myHex: string | undefined }) {
  const [profiles] = useTable(tables.profile);
  const sendInvite = useReducer(reducers.sendInvite);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const needle = q.trim().toLowerCase().replace(/^@/, '');
  const results = useMemo(() => {
    if (needle.length < 2) return [];
    return [...profiles]
      .filter(p => p.username && p.identity.toHexString() !== myHex && (p.username.includes(needle) || p.displayName.toLowerCase().includes(needle)))
      .sort((a, b) => a.username.localeCompare(b.username))
      .slice(0, 8);
  }, [profiles, needle, myHex]);
  const toggle = (u: string) => setPicked(ps => (ps.includes(u) ? ps.filter(x => x !== u) : [...ps, u]));

  async function send() {
    setBusy(true);
    setMsg(null);
    const ok: string[] = [];
    const bad: string[] = [];
    for (const u of picked) {
      try {
        await sendInvite({ sprintId, invitedUsername: u });
        ok.push(u);
      } catch (e) {
        bad.push(`@${u}: ${humanError(e)}`);
      }
    }
    setPicked([]);
    setQ('');
    setMsg([ok.length ? `Invited ${ok.map(u => `@${u}`).join(', ')}.` : '', ...bad].filter(Boolean).join(' '));
    setBusy(false);
  }

  if (!myUsername) return <div className="note">Claim a username in your dashboard to invite people.</div>;
  return (
    <div>
      <div className="searchbox" style={{ height: 48 }}>
        <Search size={16} color="var(--muted)" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search people by @username or name" aria-label="Search people" />
        {q && (
          <button type="button" className="ibtn" aria-label="Clear" onClick={() => setQ('')} style={{ width: 32, height: 32 }}>
            <X size={14} />
          </button>
        )}
      </div>
      {needle.length >= 2 && (
        <div className="results">
          {results.length === 0 ? (
            <div className="note">No one matches “{needle}”. Ask them to join any live sprint first.</div>
          ) : (
            results.map(p => (
              <button key={p.username} type="button" className={picked.includes(p.username) ? 'on' : ''} onClick={() => toggle(p.username)} aria-pressed={picked.includes(p.username)}>
                <b>@{p.username}</b> <span style={{ color: 'var(--muted)' }}>· {p.displayName}</span>
              </button>
            ))
          )}
        </div>
      )}
      {picked.length > 0 && (
        <div className="multisel">
          {picked.map(u => (
            <button key={u} type="button" className="chip on" onClick={() => toggle(u)} aria-label={`Remove @${u}`}>
              @{u} <X size={12} />
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn primary sm" disabled={busy || picked.length === 0} onClick={send}>
          {busy ? 'Inviting…' : `Invite ${picked.length || ''}`.trim()}
        </button>
        {msg && <span className="unote">{msg}</span>}
      </div>
    </div>
  );
}
