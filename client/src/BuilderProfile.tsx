import { useMemo, useState, type FormEvent } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from './module_bindings';
import type { Infer } from 'spacetimedb';
import ProfileRow from './module_bindings/profile_table';
import { Search } from 'lucide-react';
import { Card, useSprintSignals } from './Cards';
import { Disclaimer, Footer, Header, Stars } from './ui';

type Profile = Infer<typeof ProfileRow>;

// /builder and /builder/:username — search by exact username, public profile
// with star rating and their listings.
export default function BuilderProfile({ now, me, username }: { now: number; me: Profile | undefined; username: string }) {
  const [profiles] = useTable(tables.profile);
  const [owners] = useTable(tables.sprintOwner);
  const [ratings] = useTable(tables.builderRating);
  const sig = useSprintSignals(now);
  const [q, setQ] = useState(username);
  const found = useMemo(() => (username ? profiles.find(p => p.username === username) : undefined), [profiles, username]);
  const theirs = useMemo(() => {
    if (!found) return [];
    const hex = found.identity.toHexString();
    return sig.withAlarmFirst(sig.sprints.filter(s => owners.some(o => o.sprintId === s.id && o.identity.toHexString() === hex) || s.builderUsername === found.username));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, sig.sprints, owners, now]);
  const rs = useMemo(() => (found ? ratings.filter(r => r.builderIdentity.toHexString() === found.identity.toHexString()) : []), [ratings, found]);
  const avg = rs.length ? rs.reduce((a, r) => a + r.stars, 0) / rs.length : 0;
  const live = theirs.filter(sig.isLive).length;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const u = q.trim().toLowerCase().replace(/^@/, '');
    window.location.assign(`/builder/${encodeURIComponent(u)}`);
  }

  return (
    <>
      <Header me={me} />
      <main className="wrap" style={{ paddingTop: 40, paddingBottom: 80 }}>
        <p className="eyebrow">Find a builder</p>
        <form onSubmit={onSubmit} className="searchbox" style={{ maxWidth: 560 }}>
          <Search size={18} color="var(--muted)" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="@username (exact)" aria-label="Username" autoFocus={!username} />
          <button type="submit" className="btn primary sm" disabled={!q.trim()}>
            Search
          </button>
        </form>

        {username && !found && <div className="empty">No builder @{username} here.</div>}

        {found && (
          <div style={{ marginTop: 32 }}>
            <div className="strip">
              <span className="pill">@{found.username}</span>
              {found.location && <span className="pill info">{found.location}</span>}
              <span className="pill">
                {theirs.length} project{theirs.length === 1 ? '' : 's'}
              </span>
              {live > 0 && (
                <span className="pill live">
                  <i className="dot" /> {live} live
                </span>
              )}
            </div>
            <h1 className="h2">{found.displayName}</h1>
            <div style={{ marginTop: 8 }}>{rs.length ? <Stars value={avg} count={rs.length} /> : <span className="note">No supporter ratings yet.</span>}</div>
            {found.bio && <p className="sub">{found.bio}</p>}
            <div className="note">{[found.contact, found.socialX, found.socialInstagram, found.socialLinkedin].filter(Boolean).join(' · ') || 'No contact details shared.'}</div>
            {theirs.length > 0 && (
              <div className="grid" style={{ marginTop: 28 }}>
                {theirs.map(s => (
                  <Card key={String(s.id)} s={s} sig={sig} now={now} />
                ))}
              </div>
            )}
          </div>
        )}
        <Disclaimer />
      </main>
      <Footer />
    </>
  );
}
