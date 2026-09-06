import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from './module_bindings';
import type { Infer } from 'spacetimedb';
import ProfileRow from './module_bindings/profile_table';
import { ArrowRight, Pencil, Trash2 } from 'lucide-react';
import { useSprintSignals, type Sprint } from './Cards';
import { ShareSheet, builderPrompt } from './Share';
import UsernameField, { useUsernames } from './UsernameField';
import { CATEGORIES, CATEGORY_LABEL, Disclaimer, Footer, Header, MIN, STAGES, STAGE_LABEL, Stars, humanError, lakh, refCode, rupees, short, sprintPath, toMs } from './ui';

type Profile = Infer<typeof ProfileRow>;
type Tab = 'sprints' | 'support' | 'settings';

// /dashboard — the signed-in person's own space: their sprints (builder view
// with edit/delete), their support, and settings including account deletion.
export default function Dashboard({ now, me }: { now: number; me: Profile | undefined }) {
  const { identity } = useSpacetimeDB();
  const myHex = identity?.toHexString();
  const sig = useSprintSignals(now);
  const [owners] = useTable(tables.sprintOwner);
  const [invites] = useTable(tables.invite);
  const [ratings] = useTable(tables.builderRating);
  const [sprintsAll] = useTable(tables.sprint);
  const taken = useUsernames();
  const claimUsername = useReducer(reducers.claimUsername);
  const saveProfile = useReducer(reducers.saveProfile);
  const deleteSprint = useReducer(reducers.deleteSprint);
  const deleteAccount = useReducer(reducers.deleteAccount);
  const [tab, setTab] = useState<Tab>('sprints');

  const mine = useMemo(
    () =>
      myHex
        ? [...sprintsAll]
            .filter(s => s.status !== 'archived' && (owners.some(o => o.sprintId === s.id && o.identity.toHexString() === myHex) || (me?.username && s.builderUsername === me.username)))
            .sort((a, b) => Number(b.createdAt.microsSinceUnixEpoch - a.createdAt.microsSinceUnixEpoch))
        : [],
    [sprintsAll, owners, myHex, me]
  );
  const mySupport = useMemo(
    () => (myHex ? [...sig.commitments].filter(c => c.identity.toHexString() === myHex).sort((a, b) => Number(b.createdAt.microsSinceUnixEpoch - a.createdAt.microsSinceUnixEpoch)) : []),
    [sig.commitments, myHex]
  );
  const myInvites = useMemo(() => (me?.username ? [...invites].filter(i => i.invitedUsername === me.username) : []), [invites, me]);
  const myRatings = useMemo(() => (myHex ? ratings.filter(r => r.builderIdentity.toHexString() === myHex) : []), [ratings, myHex]);
  const avg = myRatings.length ? myRatings.reduce((a, r) => a + r.stars, 0) / myRatings.length : 0;
  const active = mine.find(s => sig.isLive(s)) ?? mine[0];

  // Live funding notifications: any commitment on my sprints that arrives
  // after this page mounted pops a toast. Same table the sprint page renders.
  const [profiles] = useTable(tables.profile);
  const mountedAt = useRef(Date.now());
  const seen = useRef<Set<string>>(new Set());
  const [toast, setToast] = useState<{ amount: bigint; who: string; title: string; sprint: Sprint } | null>(null);
  useEffect(() => {
    for (const c of sig.commitments) {
      const k = String(c.id);
      if (seen.current.has(k)) continue;
      seen.current.add(k);
      if (toMs(c.createdAt) < mountedAt.current) continue;
      const s = mine.find(x => x.id === c.sprintId);
      if (!s) continue;
      const p = profiles.find(x => x.identity.toHexString() === c.identity.toHexString());
      setToast({ amount: c.amount, who: p ? (p.username ? `@${p.username}` : p.displayName) : 'Someone', title: s.title, sprint: s });
    }
  }, [sig.commitments, mine, profiles]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(t);
  }, [toast]);
  const [editing, setEditing] = useState<Sprint | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<bigint | null>(null);
  const [confirmAcct, setConfirmAcct] = useState(false);

  async function onDelete(id: bigint) {
    try {
      await deleteSprint({ sprintId: id });
      setConfirmDel(null);
      setMsg({ ok: true, text: 'Listing removed from the wall.' });
    } catch (e) {
      setMsg({ ok: false, text: humanError(e) });
    }
  }
  async function onDeleteAccount() {
    try {
      await deleteAccount();
      try {
        localStorage.clear();
      } catch {
        /* ignore */
      }
      window.location.assign('/');
    } catch (e) {
      setMsg({ ok: false, text: humanError(e) });
    }
  }

  return (
    <>
      <Header me={me} />
      <main className="wrap" style={{ paddingTop: 40, paddingBottom: 80 }}>
        {!me ? (
          <div className="stateblock info">
            <h1 className="h2">Your dashboard</h1>
            <p className="sub">You haven't entered a sprint yet. Open any live sprint, enter your name and email, then come back here.</p>
            <a className="btn primary" href="/live">
              See live sprints <ArrowRight size={16} />
            </a>
          </div>
        ) : (
          <>
            <p className="eyebrow">{me.username ? `@${me.username}` : me.displayName}</p>
            <h1 className="h2">{active && sig.isLive(active) ? 'Your sprint is moving.' : mine.length ? 'Your sprints' : 'Welcome back.'}</h1>
            {myRatings.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <Stars value={avg} count={myRatings.length} />
              </div>
            )}

            {active && sig.isFunded(active) && (
              <div className="celebrate" style={{ marginTop: 20 }}>
                <div className="h">
                  Your pilot
                  <br />
                  is funded.
                </div>
                <div className="n">
                  {rupees(active.goalAmount)} goal reached · {sig.countOf(active)} people backed this build.
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  <a className="btn primary" href={sprintPath(active)}>
                    View supporters <ArrowRight size={16} />
                  </a>
                  <BuilderShare sprint={active} amount={sig.amountOf(active)} supporters={sig.countOf(active)} pct={sig.pctOf(active)} funded />
                </div>
              </div>
            )}
            {active && (
              <div className="share-block">
                {(() => {
                  const st = sig.isEnded(active) ? 'closed' : sig.isUpcoming(active) ? 'upcoming' : 'live';
                  const p = builderPrompt(sig.amountOf(active), active.goalAmount, sig.countOf(active), st);
                  return (
                    <>
                      <div className="prompt">
                        <div>
                          <div className="label strong">Share your sprint</div>
                          <b>{p.h}</b>
                          {p.sub && <div className="note" style={{ marginTop: 0 }}>{p.sub}</div>}
                        </div>
                      </div>
                      <ShareSheet sprint={active} amount={sig.amountOf(active)} count={sig.countOf(active)} state={st} remaining={sig.remainingOf(active)} who="builder" inline heading={p.cta} />
                    </>
                  );
                })()}
              </div>
            )}
            {active && (
              <div className="metrics" style={{ marginTop: 24 }}>
                <div className="metric">
                  <div className="n accent">{lakh(sig.amountOf(active))}</div>
                  <div className="l">Committed</div>
                  <div className="c">{active.title}</div>
                </div>
                <div className="metric">
                  <div className="n">{sig.pctOf(active).toFixed(0)}%</div>
                  <div className="l">Goal complete</div>
                  <div className="c">{sig.isFunded(active) ? 'pilot funded' : `${rupees(active.goalAmount - sig.amountOf(active))} to your pilot`}</div>
                </div>
                <div className="metric">
                  <div className="n">{sig.countOf(active)}</div>
                  <div className="l">People behind this build</div>
                  <div className="c">{sig.peopleBySprint.get(String(active.id)) ?? 0} here right now</div>
                </div>
                <div className="metric">
                  <div className="n accent">₹0</div>
                  <div className="l">BidFund cut</div>
                </div>
              </div>
            )}
            {active && sig.lastSupport.get(String(active.id)) && (
              <div className="three" style={{ marginTop: 16 }}>
                <div className="step">
                  <div className="idx">MOMENTUM</div>
                  <div className="big accent">+{rupees(sig.lastSupport.get(String(active.id))!.last30)}</div>
                  <p>last 30 min</p>
                </div>
                <div className="step">
                  <div className="idx">NEW SUPPORTERS</div>
                  <div className="big">{sig.lastSupport.get(String(active.id))!.recent10}</div>
                  <p>in the last 10 min</p>
                </div>
                <div className="step">
                  <div className="idx">TIME</div>
                  <div className="big">{sig.isLive(active) ? short(sig.remainingOf(active)).replace(' left', '') : 'Ended'}</div>
                  <p>{sig.isLive(active) ? 'left on the clock' : 'sprint closed'}</p>
                </div>
              </div>
            )}

            <div className="ptabs" role="tablist">
              {(
                [
                  ['sprints', `My sprints · ${mine.length}`],
                  ['support', `My support · ${mySupport.length}`],
                  ['settings', 'Settings'],
                ] as [Tab, string][]
              ).map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                  {l}
                </button>
              ))}
            </div>
            {msg && <div className={msg.ok ? 'ok' : 'err'}>{msg.text}</div>}

            {tab === 'sprints' && (
              <section>
                {mine.length === 0 ? (
                  <div className="empty">
                    You haven't listed anything yet.{' '}
                    <a href="/start" style={{ color: 'var(--accent-ink)' }}>
                      Start a sprint →
                    </a>
                  </div>
                ) : (
                  <ul className="list">
                    {mine.map(s => (
                      <li key={String(s.id)}>
                        <span>
                          <a href={sprintPath(s)} style={{ textDecoration: 'none', fontWeight: 600 }}>
                            {s.title}
                          </a>
                          <span className="meta">
                            {sig.isEnded(s) ? 'Closed' : sig.isUpcoming(s) ? 'Upcoming' : 'Live'} · {rupees(sig.amountOf(s))} of {rupees(s.goalAmount)} ·{' '}
                            {sig.countOf(s)} supporters{sig.isLive(s) ? ` · ${short(sig.remainingOf(s))}` : ''}
                          </span>
                        </span>
                        <span style={{ display: 'flex', gap: 6 }}>
                          <button type="button" className="btn quiet sm" onClick={() => setEditing(s)}>
                            <Pencil size={14} /> Edit
                          </button>
                          {confirmDel === s.id ? (
                            <>
                              <button type="button" className="btn danger sm" onClick={() => onDelete(s.id)}>
                                Confirm delete
                              </button>
                              <button type="button" className="btn quiet sm" onClick={() => setConfirmDel(null)}>
                                Keep
                              </button>
                            </>
                          ) : (
                            <button type="button" className="btn quiet sm" onClick={() => setConfirmDel(s.id)}>
                              <Trash2 size={14} /> Delete
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {myInvites.length > 0 && (
                  <>
                    <p className="eyebrow" style={{ marginTop: 26 }}>
                      Invitations for you
                    </p>
                    <ul className="list">
                      {myInvites.map(i => {
                        const s = sprintsAll.find(x => x.id === i.sprintId);
                        return (
                          <li key={String(i.id)}>
                            <a href={s ? sprintPath(s) : '/live'} style={{ textDecoration: 'none' }}>
                              {s?.title ?? `Sprint ${i.sprintId}`}
                            </a>
                            <span className="meta">from @{i.invitedByUsername}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
                {editing && <EditSprint sprint={editing} onClose={() => setEditing(null)} onSaved={() => setMsg({ ok: true, text: 'Listing updated.' })} />}
              </section>
            )}

            {tab === 'support' && (
              <section>
                {mySupport.length === 0 ? (
                  <div className="empty">You haven't supported anything yet.</div>
                ) : (
                  <ul className="list">
                    {mySupport.map(c => {
                      const s = sprintsAll.find(x => x.id === c.sprintId);
                      const perk = c.supportOptionId != null ? sig.options.find(o => o.id === c.supportOptionId) : null;
                      return (
                        <li key={String(c.id)}>
                          <span>
                            <a href={s ? sprintPath(s) : '/live'} style={{ textDecoration: 'none', fontWeight: 600 }}>
                              {s?.title ?? `Sprint ${c.sprintId}`}
                            </a>
                            <span className="meta">
                              {perk ? `${c.quantity > 1 ? `${c.quantity} × ` : ''}${perk.title}` : 'No condition'} · {s?.status === 'closed' ? 'Closed' : 'Committed'} ·{' '}
                              {refCode(c.mockTransactionId)} · {new Date(toMs(c.createdAt)).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                              {now - toMs(c.createdAt) < 60 * MIN ? ' · just now' : ''}
                            </span>
                          </span>
                          <span className="v">{rupees(c.amount)}</span>
                        </li>
                      );
                    })}
                    <li>
                      <span className="label strong">Total</span>
                      <span className="v">{rupees(mySupport.reduce((a, c) => a + c.amount, 0n))}</span>
                    </li>
                  </ul>
                )}
              </section>
            )}

            {tab === 'settings' && (
              <Settings me={me} taken={taken} claimUsername={claimUsername} saveProfile={saveProfile} onMsg={setMsg} confirmAcct={confirmAcct} setConfirmAcct={setConfirmAcct} onDeleteAccount={onDeleteAccount} />
            )}
          </>
        )}
        <Disclaimer />
      </main>
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <div className="amt">+{rupees(toast.amount)}</div>
          <div style={{ fontWeight: 600 }}>{toast.who} just backed your build.</div>
          <div className="note" style={{ marginTop: 2 }}>
            {toast.title} · {rupees(sig.amountOf(toast.sprint))} of {rupees(toast.sprint.goalAmount)} · {sig.pctOf(toast.sprint).toFixed(0)}% funded
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <BuilderShare sprint={toast.sprint} amount={sig.amountOf(toast.sprint)} supporters={sig.countOf(toast.sprint)} pct={sig.pctOf(toast.sprint)} funded={sig.isFunded(toast.sprint)} last={toast.amount} />
            <button type="button" className="btn quiet sm" onClick={() => setToast(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}
      <Footer />
    </>
  );
}

// Builder-side share: "Someone just moved our pilot forward" / "Our pilot is funded".
function BuilderShare({ sprint, amount, supporters, pct, funded, last }: { sprint: Sprint; amount: bigint; supporters: number; pct: number; funded: boolean; last?: bigint }) {
  const url = `${window.location.origin}${sprintPath(sprint)}`;
  const text = funded
    ? `Our pilot is funded. ${sprint.title} · ${rupees(amount)} · ${supporters} supporters · 0% BidFund commission\n${url}`
    : `Someone just moved our pilot forward. ${sprint.title}${last ? ` · +${rupees(last)}` : ''} · ${rupees(amount)} of ${rupees(sprint.goalAmount)} · ${pct.toFixed(0)}% funded · ${supporters} supporters\n${url}`;
  return (
    <button
      type="button"
      className="btn secondary sm"
      onClick={async () => {
        try {
          if (navigator.share) await navigator.share({ title: sprint.title, text, url });
          else await navigator.clipboard.writeText(text);
        } catch {
          /* cancelled */
        }
      }}
    >
      {funded ? 'Share this moment' : 'Share update'} →
    </button>
  );
}

function EditSprint({ sprint, onClose, onSaved }: { sprint: Sprint; onClose: () => void; onSaved: () => void }) {
  const updateSprint = useReducer(reducers.updateSprint);
  const [f, setF] = useState({
    title: sprint.title,
    tagline: sprint.tagline,
    description: sprint.description,
    nextStep: sprint.nextStep,
    builderName: sprint.builderName,
    builderBio: sprint.builderBio,
    builderCity: sprint.builderCity,
    category: sprint.category,
    stage: sprint.stage,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(x => ({ ...x, [k]: e.target.value }));
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await updateSprint({ sprintId: sprint.id, ...f });
      onSaved();
      onClose();
    } catch (ex) {
      setErr(humanError(ex));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="scrim" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && onClose()}>
      <form className="sheet" onSubmit={onSubmit} style={{ maxHeight: '90vh', overflow: 'auto' }}>
        <h2>Edit listing</h2>
        {err && <div className="err">{err}</div>}
        <label className="field">
          <span>Product name</span>
          <input value={f.title} onChange={set('title')} required maxLength={80} />
        </label>
        <label className="field">
          <span>Tagline</span>
          <input value={f.tagline} onChange={set('tagline')} maxLength={120} />
        </label>
        <div className="two">
          <label className="field">
            <span>Category</span>
            <select value={f.category} onChange={set('category')}>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Stage</span>
            <select value={f.stage} onChange={set('stage')}>
              {STAGES.map(s => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>What's already built</span>
          <textarea value={f.description} onChange={set('description')} rows={4} maxLength={1200} required />
        </label>
        <label className="field">
          <span>What this funding unlocks</span>
          <textarea value={f.nextStep} onChange={set('nextStep')} rows={2} maxLength={400} required />
        </label>
        <div className="two">
          <label className="field">
            <span>Builder</span>
            <input value={f.builderName} onChange={set('builderName')} maxLength={40} required />
          </label>
          <label className="field">
            <span>City</span>
            <input value={f.builderCity} onChange={set('builderCity')} maxLength={80} />
          </label>
        </div>
        <label className="field">
          <span>Builder bio</span>
          <textarea value={f.builderBio} onChange={set('builderBio')} rows={2} maxLength={600} />
        </label>
        <div className="note">Goal, timing, images, support options and allocation can't be changed once supporters have committed.</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" className="btn quiet" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function Settings({
  me,
  taken,
  claimUsername,
  saveProfile,
  onMsg,
  confirmAcct,
  setConfirmAcct,
  onDeleteAccount,
}: {
  me: Profile;
  taken: Set<string>;
  claimUsername: (a: { username: string }) => Promise<void>;
  saveProfile: (a: { displayName: string; bio: string; contact: string; location: string; socialX: string; socialLinkedin: string; socialInstagram: string }) => Promise<void>;
  onMsg: (m: { ok: boolean; text: string }) => void;
  confirmAcct: boolean;
  setConfirmAcct: (b: boolean) => void;
  onDeleteAccount: () => void;
}) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState(me.displayName);
  const [bio, setBio] = useState(me.bio);
  const [contact, setContact] = useState(me.contact);
  const [location, setLocation] = useState(me.location);
  const [socialX, setSocialX] = useState(me.socialX);
  const [socialLinkedin, setSocialLinkedin] = useState(me.socialLinkedin);
  const [socialInstagram, setSocialInstagram] = useState(me.socialInstagram);
  const [busy, setBusy] = useState(false);
  async function onClaim(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await claimUsername({ username });
      onMsg({ ok: true, text: `You are @${username.trim().toLowerCase()} now.` });
    } catch (err) {
      onMsg({ ok: false, text: humanError(err) });
    } finally {
      setBusy(false);
    }
  }
  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await saveProfile({ displayName, bio, contact, location, socialX, socialLinkedin, socialInstagram });
      onMsg({ ok: true, text: 'Saved.' });
    } catch (err) {
      onMsg({ ok: false, text: humanError(err) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form className="fsec" onSubmit={onClaim}>
        <h2>Username</h2>
        {me.username ? (
          <p style={{ margin: 0, color: 'var(--ink2)' }}>
            You are <b>@{me.username}</b>. Usernames are tied to this browser's identity and can't be changed.
          </p>
        ) : (
          <>
            <UsernameField value={username} onChange={setUsername} name={me.displayName} taken={taken} />
            <button type="submit" className="btn primary" disabled={busy || !username.trim()}>
              Claim @{username.trim().toLowerCase() || '…'}
            </button>
          </>
        )}
      </form>
      <form className="fsec" onSubmit={onSave}>
        <h2>Profile</h2>
        <label className="field">
          <span>Display name</span>
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={40} required />
        </label>
        <label className="field">
          <span>Bio</span>
          <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} maxLength={600} />
        </label>
        <div className="two">
          <label className="field">
            <span>Contact</span>
            <input value={contact} onChange={e => setContact(e.target.value)} placeholder="phone or email" maxLength={120} />
          </label>
          <label className="field">
            <span>Location</span>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Bengaluru" maxLength={80} />
          </label>
        </div>
        <div className="two">
          <label className="field">
            <span>X</span>
            <input value={socialX} onChange={e => setSocialX(e.target.value)} placeholder="@handle" />
          </label>
          <label className="field">
            <span>Instagram</span>
            <input value={socialInstagram} onChange={e => setSocialInstagram(e.target.value)} placeholder="@handle" />
          </label>
        </div>
        <label className="field">
          <span>LinkedIn</span>
          <input value={socialLinkedin} onChange={e => setSocialLinkedin(e.target.value)} placeholder="linkedin.com/in/…" />
        </label>
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>
      <div className="fsec">
        <h2>Delete account</h2>
        <p style={{ marginTop: 0, color: 'var(--ink2)' }}>
          Removes your profile, private email, presence, interests and ratings. Support you've already committed stays on the record as anonymous
          history. Listings you created stay on the wall unless you delete them first.
        </p>
        {confirmAcct ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn danger" onClick={onDeleteAccount}>
              Yes, delete my account
            </button>
            <button type="button" className="btn quiet" onClick={() => setConfirmAcct(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="btn quiet" onClick={() => setConfirmAcct(true)}>
            <Trash2 size={15} /> Delete account
          </button>
        )}
      </div>
    </>
  );
}
