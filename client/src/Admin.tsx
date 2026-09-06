import { useMemo, useState, type FormEvent } from 'react';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from './module_bindings';
import type { Infer } from 'spacetimedb';
import ProfileRow from './module_bindings/profile_table';
import { ShieldCheck, Trash2 } from 'lucide-react';
import { Footer, Header, SITE_DEFAULTS, SITE_FIELDS, humanError, rupees, short, sprintPath, toMs } from './ui';

type Profile = Infer<typeof ProfileRow>;
type Tab = 'site' | 'sprints' | 'people' | 'danger';

// /admin — gated by the `admin` table (or the owner identity). First entry is
// by the bootstrap code the owner set with set_admin_code.
export default function Admin({ now, me, isAdmin }: { now: number; me: Profile | undefined; isAdmin: boolean }) {
  const [tab, setTab] = useState<Tab>('site');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const claimAdmin = useReducer(reducers.claimAdmin);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function onClaim(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await claimAdmin({ name, password: code });
      setMsg({ ok: true, text: 'You are an admin on this browser now.' });
    } catch (err) {
      setMsg({ ok: false, text: humanError(err) });
    } finally {
      setBusy(false);
    }
  }

  const run = async (fn: () => Promise<unknown>, okText: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: okText });
    } catch (err) {
      setMsg({ ok: false, text: humanError(err) });
    }
  };

  return (
    <>
      <Header me={me} isAdmin={isAdmin} />
      <main className="wrap" style={{ paddingTop: 40, paddingBottom: 80 }}>
        <p className="eyebrow">Admin</p>
        <h1 className="h2">
          <ShieldCheck size={28} style={{ verticalAlign: '-4px', marginRight: 8 }} />
          Site control
        </h1>
        {!isAdmin ? (
          <form className="fsec" onSubmit={onClaim} style={{ maxWidth: 480, marginTop: 24 }}>
            <h2>Admin login</h2>
            <p style={{ marginTop: 0, color: 'var(--ink2)' }}>Admin rights are tied to this browser's identity once you log in.</p>
            {msg && <div className={msg.ok ? 'ok' : 'err'}>{msg.text}</div>}
            <label className="field">
              <span>Admin name</span>
              <input value={name} onChange={e => setName(e.target.value)} autoComplete="username" required />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" value={code} onChange={e => setCode(e.target.value)} autoComplete="current-password" required />
            </label>
            <button type="submit" className="btn primary" disabled={busy || !name.trim() || code.trim().length < 8}>
              Log in
            </button>
          </form>
        ) : (
          <>
            <div className="ptabs" role="tablist">
              {(
                [
                  ['site', 'Site copy'],
                  ['sprints', 'Sprints'],
                  ['people', 'People'],
                  ['danger', 'Danger zone'],
                ] as [Tab, string][]
              ).map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                  {l}
                </button>
              ))}
            </div>
            {msg && <div className={msg.ok ? 'ok' : 'err'}>{msg.text}</div>}
            {tab === 'site' && <SiteTab run={run} />}
            {tab === 'sprints' && <SprintsTab run={run} now={now} />}
            {tab === 'people' && <PeopleTab run={run} me={me} />}
            {tab === 'danger' && <DangerTab run={run} />}
          </>
        )}
      </main>
      <Footer />
    </>
  );
}

type Run = (fn: () => Promise<unknown>, okText: string) => Promise<void>;

function SiteTab({ run }: { run: Run }) {
  const [rows] = useTable(tables.siteConfig);
  const setSiteConfig = useReducer(reducers.setSiteConfig);
  const current = useMemo(() => new Map(rows.map(r => [r.key, r.value])), [rows]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const val = (k: string) => draft[k] ?? current.get(k) ?? '';
  const save = (k: string) => run(() => setSiteConfig({ key: k, value: val(k) }), `Saved ${k}.`);
  const reset = (k: string) => {
    setDraft(d => ({ ...d, [k]: '' }));
    return run(() => setSiteConfig({ key: k, value: '' }), `${k} reset to default.`);
  };
  return (
    <section>
      <p className="sub" style={{ marginBottom: 20 }}>
        Every field below is live on the site the moment you save. Leave a field empty and save to go back to the built-in default.
      </p>
      {SITE_FIELDS.map(f => (
        <div className="fsec" key={f.key}>
          <h2>{f.label}</h2>
          {f.help && <div className="note" style={{ marginBottom: 8 }}>{f.help}</div>}
          <label className="field">
            <span>
              Default: <i style={{ fontWeight: 400 }}>{SITE_DEFAULTS[f.key] || '(none)'}</i>
            </span>
            {f.multiline ? (
              <textarea rows={3} value={val(f.key)} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))} placeholder={SITE_DEFAULTS[f.key]} />
            ) : f.kind === 'flag' ? (
              <select value={val(f.key)} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}>
                <option value="">Shown (default)</option>
                <option value="1">Hidden</option>
              </select>
            ) : (
              <input value={val(f.key)} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))} placeholder={SITE_DEFAULTS[f.key]} type={f.kind === 'color' ? 'text' : 'text'} />
            )}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn primary sm" onClick={() => save(f.key)}>
              Save
            </button>
            {current.has(f.key) && (
              <button type="button" className="btn quiet sm" onClick={() => reset(f.key)}>
                Reset to default
              </button>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

function SprintsTab({ run, now }: { run: Run; now: number }) {
  const [sprints] = useTable(tables.sprint);
  const [owners] = useTable(tables.sprintOwner);
  const adminSetSprint = useReducer(reducers.adminSetSprint);
  const adminDeleteSprint = useReducer(reducers.adminDeleteSprint);
  const [confirm, setConfirm] = useState<bigint | null>(null);
  const list = useMemo(() => [...sprints].sort((a, b) => Number(b.id - a.id)), [sprints]);
  return (
    <section>
      <p className="sub" style={{ marginBottom: 8 }}>
        {list.length} listings, including archived and closed. Builders can still archive their own from the dashboard.
      </p>
      <div style={{ marginBottom: 12 }}>
        <a className="btn secondary sm" href="/start">
          Create a listing as admin
        </a>
      </div>
      <ul className="list">
        {list.map(s => {
          const ended = s.status === 'closed' || s.status === 'archived' || toMs(s.deadline) <= now;
          const owner = owners.find(o => o.sprintId === s.id);
          return (
            <li key={String(s.id)} style={{ flexWrap: 'wrap' }}>
              <span style={{ minWidth: 0, flex: '1 1 320px' }}>
                <a href={sprintPath(s)} style={{ textDecoration: 'none', fontWeight: 600 }}>
                  #{String(s.id)} {s.title}
                </a>
                <span className="meta">
                  {s.status} · {rupees(s.committedAmount)} of {rupees(s.goalAmount)} · {s.supporterCount} supporters · {ended ? 'ended' : short(toMs(s.deadline) - now)} · by{' '}
                  {s.builderUsername ? `@${s.builderUsername}` : s.builderName}
                  {owner ? '' : ' (no owner row)'}
                </span>
              </span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {!ended && (
                  <button type="button" className="btn quiet sm" onClick={() => run(() => adminSetSprint({ sprintId: s.id, status: 'closed', extendMinutes: 0 }), `#${s.id} closed.`)}>
                    Close now
                  </button>
                )}
                <button type="button" className="btn quiet sm" onClick={() => run(() => adminSetSprint({ sprintId: s.id, status: '', extendMinutes: 30 }), `#${s.id} extended by 30 min.`)}>
                  +30 min
                </button>
                {s.status === 'archived' ? (
                  <button type="button" className="btn quiet sm" onClick={() => run(() => adminSetSprint({ sprintId: s.id, status: ended && toMs(s.deadline) <= now ? 'closed' : 'open', extendMinutes: 0 }), `#${s.id} restored.`)}>
                    Restore
                  </button>
                ) : (
                  <button type="button" className="btn quiet sm" onClick={() => run(() => adminSetSprint({ sprintId: s.id, status: 'archived', extendMinutes: 0 }), `#${s.id} archived (hidden).`)}>
                    Archive
                  </button>
                )}
                {confirm === s.id ? (
                  <>
                    <button type="button" className="btn danger sm" onClick={() => run(() => adminDeleteSprint({ sprintId: s.id }), `#${s.id} deleted permanently.`).then(() => setConfirm(null))}>
                      Confirm permanent delete
                    </button>
                    <button type="button" className="btn quiet sm" onClick={() => setConfirm(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn quiet sm" onClick={() => setConfirm(s.id)}>
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PeopleTab({ run, me }: { run: Run; me: Profile | undefined }) {
  const { identity } = useSpacetimeDB();
  const [profiles] = useTable(tables.profile);
  const [admins] = useTable(tables.admin);
  const [blocked] = useTable(tables.blockedUser);
  const [commitments] = useTable(tables.supportCommitment);
  const adminBlockUser = useReducer(reducers.adminBlockUser);
  const adminUnblockUser = useReducer(reducers.adminUnblockUser);
  const adminDeleteUser = useReducer(reducers.adminDeleteUser);
  const grantAdmin = useReducer(reducers.grantAdmin);
  const revokeAdmin = useReducer(reducers.revokeAdmin);
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const myHex = identity?.toHexString();
  const needle = q.trim().toLowerCase().replace(/^@/, '');
  const list = useMemo(
    () =>
      [...profiles]
        .filter(p => !needle || p.username.includes(needle) || p.displayName.toLowerCase().includes(needle))
        .sort((a, b) => Number(b.createdAt.microsSinceUnixEpoch - a.createdAt.microsSinceUnixEpoch)),
    [profiles, needle]
  );
  const backedTotal = (hex: string) => commitments.filter(c => c.identity.toHexString() === hex).reduce((a, c) => a + c.amount, 0n);
  return (
    <section>
      <div className="searchbox" style={{ maxWidth: 480, height: 48, marginBottom: 14 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by @username or name" />
      </div>
      <p className="sub" style={{ marginBottom: 8 }}>
        {profiles.length} people · {admins.length} admin{admins.length === 1 ? '' : 's'} · {blocked.length} blocked
      </p>
      <ul className="list">
        {list.map(p => {
          const hex = p.identity.toHexString();
          const isA = admins.some(a => a.identity.toHexString() === hex);
          const isB = blocked.some(b => b.identity.toHexString() === hex);
          const self = hex === myHex;
          return (
            <li key={hex} style={{ flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 280px', minWidth: 0 }}>
                <b>{p.username ? `@${p.username}` : '(no username)'}</b> · {p.displayName}
                {isA && <span className="pill live" style={{ marginLeft: 8 }}>Admin</span>}
                {isB && <span className="pill urg" style={{ marginLeft: 8 }}>Blocked</span>}
                {self && <span className="pill" style={{ marginLeft: 8 }}>You</span>}
                <span className="meta">
                  backed {rupees(backedTotal(hex))} · joined {new Date(toMs(p.createdAt)).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  {p.location ? ` · ${p.location}` : ''}
                </span>
              </span>
              {p.username && !self && (
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {isB ? (
                    <button type="button" className="btn quiet sm" onClick={() => run(() => adminUnblockUser({ username: p.username }), `@${p.username} unblocked.`)}>
                      Unblock
                    </button>
                  ) : (
                    !isA && (
                      <button type="button" className="btn quiet sm" onClick={() => run(() => adminBlockUser({ username: p.username, reason: '' }), `@${p.username} blocked.`)}>
                        Block
                      </button>
                    )
                  )}
                  {isA ? (
                    <button type="button" className="btn quiet sm" onClick={() => run(() => revokeAdmin({ username: p.username }), `@${p.username} is no longer admin.`)}>
                      Revoke admin
                    </button>
                  ) : (
                    <button type="button" className="btn quiet sm" onClick={() => run(() => grantAdmin({ username: p.username }), `@${p.username} is admin now.`)}>
                      Make admin
                    </button>
                  )}
                  {!isA &&
                    (confirm === p.username ? (
                      <>
                        <button type="button" className="btn danger sm" onClick={() => run(() => adminDeleteUser({ username: p.username }), `@${p.username} deleted.`).then(() => setConfirm(null))}>
                          Confirm delete
                        </button>
                        <button type="button" className="btn quiet sm" onClick={() => setConfirm(null)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <button type="button" className="btn quiet sm" onClick={() => setConfirm(p.username)}>
                        <Trash2 size={14} /> Delete
                      </button>
                    ))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {me && !me.username && <div className="note">You have no username yet, so you appear as "(no username)". Enter any sprint to get one.</div>}
    </section>
  );
}

function DangerTab({ run }: { run: Run }) {
  const adminWipe = useReducer(reducers.adminWipe);
  const setAdminCode = useReducer(reducers.setAdminCode);
  const [text, setText] = useState('');
  const [an, setAn] = useState('');
  const [ap, setAp] = useState('');
  const ok = text === 'WIPE';
  return (
    <section>
      <div className="fsec">
        <h2>Change admin login</h2>
        <div className="two">
          <label className="field">
            <span>Admin name</span>
            <input value={an} onChange={e => setAn(e.target.value)} autoComplete="off" />
          </label>
          <label className="field">
            <span>New password (8+ characters)</span>
            <input type="password" value={ap} onChange={e => setAp(e.target.value)} autoComplete="new-password" />
          </label>
        </div>
        <button type="button" className="btn secondary sm" disabled={an.trim().length < 3 || ap.trim().length < 8} onClick={() => run(() => setAdminCode({ name: an, password: ap }), 'Admin login updated.').then(() => setAp(''))}>
          Save login
        </button>
      </div>
      <div className="fsec" style={{ borderColor: '#f4c7b0' }}>
        <h2 style={{ color: 'var(--urg)' }}>Wipe data</h2>
        <p style={{ marginTop: 0, color: 'var(--ink2)' }}>
          Permanent. Admin accounts, site copy and email settings survive. Type <b>WIPE</b> to unlock the buttons.
        </p>
        <label className="field" style={{ maxWidth: 320 }}>
          <span>Confirmation</span>
          <input value={text} onChange={e => setText(e.target.value)} placeholder="WIPE" autoComplete="off" />
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn danger" disabled={!ok} onClick={() => run(() => adminWipe({ scope: 'sprints', confirm: text }), 'All listings and commitments deleted.').then(() => setText(''))}>
            Delete all listings
          </button>
          <button type="button" className="btn danger" disabled={!ok} onClick={() => run(() => adminWipe({ scope: 'users', confirm: text }), 'All people deleted.').then(() => setText(''))}>
            Delete all people
          </button>
          <button type="button" className="btn danger" disabled={!ok} onClick={() => run(() => adminWipe({ scope: 'all', confirm: text }), 'Everything deleted.').then(() => setText(''))}>
            Delete everything
          </button>
        </div>
        <div className="note" style={{ marginTop: 10 }}>
          Deleting all people removes your own profile too. You stay admin (it is tied to your browser identity), but you will need to enter a sprint again to get a username.
        </div>
      </div>
    </section>
  );
}
