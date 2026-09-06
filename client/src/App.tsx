import React, { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from './module_bindings';
import type { Infer } from 'spacetimedb';
import SprintRow from './module_bindings/sprint_table';
import ProfileRow from './module_bindings/profile_table';
import { ArrowRight, Check, CheckCircle2, Eye, Pencil, Share2, Star, ThumbsUp, Wifi, WifiOff, X } from 'lucide-react';
import CreateSprint from './CreateSprint';
import Home from './Home';
import Live from './Live';
import Builders from './Builders';
import Dashboard from './Dashboard';
import BuilderProfile from './BuilderProfile';
import ResultPage from './ResultPage';
import Invite from './Invite';
import Admin from './Admin';
import Contact from './Contact';
import Legal, { type LegalPage } from './Legal';
import DemoPayPage, { Approval, Breakdown, DemoBadge, Disclosure, SessionQr, isPhone, sessionState } from './DemoPay';
import { ShareSheet } from './Share';
import { useUsernames, suggestUsernames } from './UsernameField';
import { CallbackPage, SpacetimeSignIn, useSpacetimeAuthProfile } from './auth';
import { CATEGORY_LABEL, Disclaimer, Footer, Header, MIN, Mark, STAGE_LABEL, Stars, clock, humanError, pad2, rupees, toMs, urlParam } from './ui';

const PRESETS = [500n, 1000n, 2500n, 5000n];
const ONBOARD_KEY = 'bidfund_onboarded_v2';

// Small non-blocking realtime status: Reconnecting… while the socket is down,
// Live connection restored for a moment after it comes back.
function ConnectionStatus() {
  const { isActive } = useSpacetimeDB();
  const wasDown = useRef(false);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (!isActive) {
      wasDown.current = true;
      return;
    }
    if (wasDown.current) {
      wasDown.current = false;
      setRestored(true);
      const t = setTimeout(() => setRestored(false), 2500);
      return () => clearTimeout(t);
    }
  }, [isActive]);
  if (isActive && !restored) return null;
  return (
    <div className={`connstat${isActive ? ' ok' : ''}`} role="status" aria-live="polite">
      {isActive ? <Wifi size={13} /> : <WifiOff size={13} />}
      {isActive ? 'Live connection restored' : 'Reconnecting…'}
    </div>
  );
}
type Sprint = Infer<typeof SprintRow>;
type Profile = Infer<typeof ProfileRow>;

function useNow(tickMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}

// Routes: /, /live, /sprint/:id-slug (and legacy ?sprint=id), /builders,
// /start (+ /create), /dashboard (+ /me), /builder/:username (+ /find), /callback.
function route(path: string): { page: string; arg: string } {
  const m = path.match(/^\/(?:sprint|s)\/(\d+)/);
  if (m) return { page: 'sprint', arg: m[1] };
  const b = path.match(/^\/builder(?:\/([^/]*))?\/?$/);
  if (b) return { page: 'builder', arg: decodeURIComponent(b[1] ?? '') };
  if (path === '/find') return { page: 'builder', arg: urlParam('u') };
  if (path === '/callback') return { page: 'callback', arg: '' };
  if (path === '/admin') return { page: 'admin', arg: '' };
  if (path === '/contact') return { page: 'contact', arg: '' };
  const dp = path.match(/^\/demo-pay\/([A-Za-z0-9-]+)\/?$/);
  if (dp) return { page: 'demopay', arg: dp[1].toUpperCase() };
  if (/^\/(terms|privacy|refunds|shipping)\/?$/.test(path)) return { page: 'legal', arg: path.replace(/\//g, '') };
  if (path === '/live') return { page: 'live', arg: '' };
  if (path === '/builders') return { page: 'builders', arg: '' };
  if (path === '/start' || path === '/create') return { page: 'start', arg: '' };
  if (path === '/dashboard' || path === '/me') return { page: 'dashboard', arg: '' };
  const q = urlParam('sprint');
  if (q) return { page: 'sprint', arg: q };
  return { page: 'home', arg: '' };
}

export default function App() {
  const { isActive, identity } = useSpacetimeDB();
  const [sprints, sprintsReady] = useTable(tables.sprint);
  const [profiles, profilesReady] = useTable(tables.profile);
  const [presence] = useTable(tables.roomPresence);
  const [admins] = useTable(tables.admin);
  const enterSprint = useReducer(reducers.enterSprint);
  const myHex = identity?.toHexString();
  const isAdmin = !!myHex && admins.some(a => a.identity.toHexString() === myHex);
  const r = route(window.location.pathname);
  const sprint = useMemo(() => (r.page === 'sprint' ? sprints.find(x => String(x.id) === r.arg) : undefined), [sprints, r.page, r.arg]);
  const now = useNow(1000);

  const me = useMemo(() => (myHex ? profiles.find(p => p.identity.toHexString() === myHex) : undefined), [profiles, myHex]);
  const peopleHere = useMemo(() => {
    if (!sprint) return 0;
    const set = new Set<string>();
    for (const p of presence) if (p.sprintId === sprint.id) set.add(p.identity.toHexString());
    return set.size;
  }, [presence, sprint]);

  useEffect(() => {
    if (!isActive || !sprint || !me) return;
    enterSprint({ sprintId: sprint.id }).catch(() => {});
  }, [isActive, sprint?.id, me?.identity, enterSprint]); // eslint-disable-line react-hooks/exhaustive-deps

  if (r.page === 'callback') {
    return (
      <>
        <Header />
        <CallbackPage />
      </>
    );
  }
  if (!isActive || !sprintsReady || !profilesReady) {
    return (
      <>
        <Header />
        <main className="wrap">
          <div className="skel" style={{ height: 320, marginTop: 40 }} />
          <div className="grid" style={{ marginTop: 16 }}>
            {[0, 1, 2].map(i => (
              <div key={i} className="skel" style={{ height: 300 }} />
            ))}
          </div>
        </main>
      </>
    );
  }
  const status = <ConnectionStatus />;
  const wrap = (el: React.ReactNode) => (
    <>
      {status}
      {el}
    </>
  );
  if (r.page === 'admin') return wrap(<Admin now={now} me={me} isAdmin={isAdmin} />);
  if (r.page === 'contact') return wrap(<Contact me={me} />);
  if (r.page === 'demopay') return wrap(<DemoPayPage code={r.arg} me={me} />);
  if (r.page === 'legal') return wrap(<Legal page={r.arg as LegalPage} me={me} />);
  if (r.page === 'start') return wrap(<CreateSprint me={me} />);
  if (r.page === 'dashboard') return wrap(<Dashboard now={now} me={me} />);
  if (r.page === 'builder') return wrap(<BuilderProfile now={now} me={me} username={r.arg.toLowerCase().replace(/^@/, '')} />);
  if (r.page === 'live') return wrap(<Live now={now} me={me} />);
  if (r.page === 'builders') return wrap(<Builders me={me} />);
  if (r.page === 'home') return wrap(<Home now={now} me={me} isAdmin={isAdmin} />);
  if (!sprint) {
    return (
      <>
        <Header me={me} />
        <main className="wrap">
          <div className="empty">
            That sprint doesn't exist.{' '}
            <a href="/live" style={{ color: 'var(--accent-ink)' }}>
              See live sprints →
            </a>
          </div>
        </main>
      </>
    );
  }
  const finished = sprint.status === 'closed' || sprint.status === 'archived' || toMs(sprint.deadline) <= now;
  if (finished) return wrap(<ResultPage sprint={sprint} profiles={profiles} me={me} />);
  if (!me || !me.username) return wrap(<JoinScreen sprint={sprint} peopleHere={peopleHere} me={me} />);
  return wrap(<SprintPage sprint={sprint} me={me} profiles={profiles} peopleHere={peopleHere} myHex={myHex} />);
}

// ---------------------------------------------------------------------------

function JoinScreen({ sprint, peopleHere, me }: { sprint: Sprint; peopleHere: number; me: Profile | undefined }) {
  const register = useReducer(reducers.register);
  const claimUsername = useReducer(reducers.claimUsername);
  const taken = useUsernames();
  const [name, setName] = useState(me?.displayName ?? '');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authProfile = useSpacetimeAuthProfile();
  useEffect(() => {
    if (!authProfile) return;
    if (!name && authProfile.name) setName(authProfile.name);
    if (!email && authProfile.email) setEmail(authProfile.email);
  }, [authProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  // No username ceremony: a unique handle is claimed automatically from the
  // name (visible in the dashboard afterwards).
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!me) await register({ displayName: name, email, sourceRef: urlParam('ref'), sprintId: sprint.id });
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        const candidates = suggestUsernames(name || me?.displayName || 'supporter', taken);
        const u = candidates[attempt % candidates.length] ?? `supporter${Date.now().toString(36).slice(-5)}`;
        try {
          await claimUsername({ username: u });
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (/already claimed/i.test(humanError(err))) {
            lastErr = null;
            break;
          }
        }
      }
      if (lastErr) throw lastErr;
    } catch (err) {
      setError(humanError(err));
      setBusy(false);
    }
  }
  const gap = sprint.goalAmount > sprint.committedAmount ? sprint.goalAmount - sprint.committedAmount : 0n;

  return (
    <>
      <Header me={me} />
      <main className="wrap narrow" style={{ paddingTop: 32, paddingBottom: 60 }}>
        <div className="strip">
          <span className="pill live">
            <i className="dot" /> Live
          </span>
          {peopleHere > 0 && (
            <span className="pill">
              <Eye size={12} /> {peopleHere} here now
            </span>
          )}
          <span className="pill">
            {rupees(sprint.committedAmount)} of {rupees(sprint.goalAmount)}
          </span>
        </div>
        <h1 className="h2" style={{ margin: '6px 0 4px' }}>
          {sprint.title}
        </h1>
        {sprint.tagline && <p className="tagline">{sprint.tagline}</p>}
        <div className="gallery" style={{ marginBottom: 20 }}>
          {sprint.mediaUrl ? <img src={sprint.mediaUrl} alt="Working prototype" /> : <div className="noimg">Working prototype</div>}
        </div>
        {gap > 0n && <div className="statement">Only {rupees(gap)} to make this pilot happen.</div>}
        <form className="fsec" onSubmit={onSubmit}>
          <h2>Join this live sprint</h2>
          {error && <div className="err">{error}</div>}
          {!me && (
            <>
              <SpacetimeSignIn />
              <label className="field">
                <span>Name</span>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Arul" maxLength={40} autoComplete="name" required autoFocus />
              </label>
              <label className="field">
                <span>Email</span>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" inputMode="email" required />
              </label>
            </>
          )}
          <button type="submit" className="btn primary big block" disabled={busy || (!me && (!name.trim() || !email.trim()))}>
            {busy ? 'Entering…' : 'Enter live sprint'} <ArrowRight size={16} />
          </button>
          <p className="note">No password. Takes seconds. We'll email you a link back to this sprint.</p>
        </form>
        <Disclaimer />
      </main>
      <Footer />
    </>
  );
}

// ---------------------------------------------------------------------------

type Stage = 'idle' | 'confirm' | 'creating' | 'upi' | 'success' | 'claimed' | 'error';

function SprintPage({ sprint, me, profiles, peopleHere, myHex }: { sprint: Sprint; me: Profile; profiles: readonly Profile[]; peopleHere: number; myHex: string | undefined }) {
  const [options] = useTable(tables.supportOption);
  const [commitments] = useTable(tables.supportCommitment);
  const [media] = useTable(tables.sprintMedia.where(r => r.sprintId.eq(sprint.id)));
  const [journey] = useTable(tables.journeyEntry.where(r => r.sprintId.eq(sprint.id)));
  const [interests] = useTable(tables.interest.where(r => r.sprintId.eq(sprint.id)));
  const [allocExtra] = useTable(tables.allocationItem.where(r => r.sprintId.eq(sprint.id)));
  const [owners] = useTable(tables.sprintOwner);
  const [ratings] = useTable(tables.builderRating);
  const createSession = useReducer(reducers.createDemoPaymentSession);
  const cancelSession = useReducer(reducers.cancelDemoPayment);
  const [sessions] = useTable(tables.demoPaymentSession.where(r => r.sprintId.eq(sprint.id)));
  const toggleInterest = useReducer(reducers.toggleInterest);
  const rateBuilder = useReducer(reducers.rateBuilder);
  const now = useNow();
  const [gi, setGi] = useState(0);
  const gallery = useMemo(() => [...media].sort((a, b) => a.position - b.position), [media]);
  const timeline = useMemo(() => [...journey].sort((a, b) => a.position - b.position), [journey]);
  const iLike = useMemo(() => !!myHex && interests.some(i => i.identity.toHexString() === myHex), [interests, myHex]);
  const perks = useMemo(() => [...options].filter(o => o.sprintId === sprint.id).sort((a, b) => Number(a.id - b.id)), [options, sprint.id]);
  const mineAll = useMemo(() => [...commitments].filter(c => c.sprintId === sprint.id), [commitments, sprint.id]);
  const feed = useMemo(() => mineAll.slice().sort((a, b) => Number(b.createdAt.microsSinceUnixEpoch - a.createdAt.microsSinceUnixEpoch)).slice(0, 20), [mineAll]);
  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profiles) m.set(p.identity.toHexString(), p.username ? `@${p.username}` : p.displayName);
    return (hex: string) => m.get(hex) ?? 'Supporter';
  }, [profiles]);

  // Ownership + ratings. The server rejects self-support; the UI mirrors it.
  const owner = owners.find(o => o.sprintId === sprint.id);
  const ownerHex = owner?.identity.toHexString();
  const isOwner = !!myHex && (ownerHex === myHex || (!!me.username && sprint.builderUsername === me.username));
  const iBacked = !!myHex && mineAll.some(c => c.identity.toHexString() === myHex);
  const builderRatings = useMemo(() => (ownerHex ? ratings.filter(x => x.builderIdentity.toHexString() === ownerHex) : []), [ratings, ownerHex]);
  const avgStars = builderRatings.length ? builderRatings.reduce((a, x) => a + x.stars, 0) / builderRatings.length : 0;
  const myRating = builderRatings.find(x => x.raterIdentity.toHexString() === myHex)?.stars ?? 0;
  const [rateMsg, setRateMsg] = useState<string | null>(null);
  const [hoverStar, setHoverStar] = useState(0);

  // amount flash when it changes from elsewhere
  const [flash, setFlash] = useState(false);
  const prevAmt = useRef(sprint.committedAmount);
  useEffect(() => {
    if (sprint.committedAmount !== prevAmt.current) {
      prevAmt.current = sprint.committedAmount;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 900);
      return () => clearTimeout(t);
    }
  }, [sprint.committedAmount]);

  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [amountText, setAmountText] = useState('1000');
  const [touched, setTouched] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  // The session this device is driving: latest one I created after opening the sheet.
  const [sessFloor, setSessFloor] = useState<bigint>(0n);
  const [showQr, setShowQr] = useState(() => !isPhone());
  const mySession = useMemo(() => {
    const mine = sessions.filter(s => s.supporterIdentity.toHexString() === myHex && s.id > sessFloor);
    return mine.sort((a, b) => Number(b.id - a.id))[0];
  }, [sessions, myHex, sessFloor]);
  const sessState = sessionState(mySession, now);
  useEffect(() => {
    if (stage !== 'upi' && stage !== 'creating') return;
    if (sessState === 'committed') {
      setStage('success');
      setCart(new Map());
      setTouched(false);
    } else if (sessState === 'perk_taken') {
      setStage('claimed');
      setError(mySession?.errorText ?? null);
    }
  }, [sessState, stage, mySession]);
  const [onboard, setOnboard] = useState(() => {
    try {
      return localStorage.getItem(ONBOARD_KEY) !== '1';
    } catch {
      return true;
    }
  });
  function dismissOnboard() {
    setOnboard(false);
    try {
      localStorage.setItem(ONBOARD_KEY, '1');
    } catch {
      /* ignore */
    }
    document.getElementById('support')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  useEffect(() => {
    document.title = `${sprint.title} — Live Hardware Micro-Funding Sprint | BidFund`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', `Back ${sprint.title}, a working hardware project raising ${rupees(sprint.goalAmount)} for ${sprint.nextStep || 'its next milestone'}. Follow the live BidFund micro-funding sprint.`);
    const og = document.querySelector('meta[property="og:title"]');
    if (og) og.setAttribute('content', `Support ${sprint.title} on BidFund`);
    return () => {
      document.title = 'BidFund — Micro-Funding for Hardware Builders';
    };
  }, [sprint.title, sprint.goalAmount, sprint.nextStep]);
  const [fundedFlash, setFundedFlash] = useState(false);
  const wasFunded = useRef(sprint.committedAmount >= sprint.goalAmount);
  useEffect(() => {
    const nowFunded = sprint.committedAmount >= sprint.goalAmount;
    if (nowFunded && !wasFunded.current) {
      setFundedFlash(true);
      const t = setTimeout(() => setFundedFlash(false), 2200);
      wasFunded.current = true;
      return () => clearTimeout(t);
    }
    wasFunded.current = nowFunded;
  }, [sprint.committedAmount, sprint.goalAmount]);
  const [countFlash, setCountFlash] = useState(false);
  const prevCount = useRef(sprint.supporterCount);
  useEffect(() => {
    if (sprint.supporterCount !== prevCount.current) {
      prevCount.current = sprint.supporterCount;
      setCountFlash(true);
      const t = setTimeout(() => setCountFlash(false), 900);
      return () => clearTimeout(t);
    }
  }, [sprint.supporterCount]);

  const lines = useMemo(() => perks.filter(p => (cart.get(String(p.id)) ?? 0) > 0).map(p => ({ perk: p, qty: cart.get(String(p.id))! })), [perks, cart]);
  const cartMin = lines.reduce((a, l) => a + l.perk.minAmount * BigInt(l.qty), 0n);
  useEffect(() => {
    if (!touched && cartMin > 0n) setAmountText(String(cartMin));
  }, [cartMin, touched]);
  const amount = useMemo(() => {
    const c = amountText.replace(/[^\d]/g, '');
    if (!c) return null;
    const n = BigInt(c);
    return n > 0n ? n : null;
  }, [amountText]);

  function setQty(p: (typeof perks)[number], qty: number) {
    const left = p.slotsTotal != null ? p.slotsTotal - p.slotsClaimed : 100;
    const q = Math.max(0, Math.min(qty, left, 100));
    setCart(c => {
      const n = new Map(c);
      if (q === 0) n.delete(String(p.id));
      else n.set(String(p.id), q);
      return n;
    });
  }
  useEffect(() => {
    for (const p of perks) {
      const q = cart.get(String(p.id)) ?? 0;
      if (q === 0 || p.slotsTotal == null) continue;
      const left = p.slotsTotal - p.slotsClaimed;
      if (left <= 0) setQty(p, 0);
      else if (q > left) setQty(p, left);
    }
  }, [perks]); // eslint-disable-line react-hooks/exhaustive-deps

  const opensMs = toMs(sprint.opensAt);
  const remaining = toMs(sprint.deadline) - now;
  const upcoming = opensMs > now;
  const funded = sprint.status === 'funded_still_open' || sprint.committedAmount >= sprint.goalAmount;
  const pct = Math.min(100, Number((sprint.committedAmount * 1000n) / sprint.goalAmount) / 10);
  const gap = sprint.goalAmount > sprint.committedAmount ? sprint.goalAmount - sprint.committedAmount : 0n;
  const alarm = !upcoming && remaining <= 30 * MIN;
  const urgent = remaining < 15 * MIN;
  const canContinue = !upcoming && !isOwner && amount !== null && amount >= cartMin;
  const condLabel = lines.length ? lines.map(l => `${l.qty > 1 ? `${l.qty} × ` : ''}${l.perk.title}`).join(', ') : 'No condition';
  const alloc = [
    ['Tooling', sprint.fundToolingPct, '#a8dc3a'],
    ['Components', sprint.fundComponentsPct, '#47716c'],
    ['Certification', sprint.fundCertPct, '#c9cbc3'],
    ['Buffer', sprint.fundBufferPct, '#d85d27'],
    ...[...allocExtra].sort((a, b) => Number(a.id - b.id)).map((x, i) => [x.label, x.pct, ['#e4b62b', '#7fb3ad', '#8b938e', '#26340e'][i % 4]] as const),
  ] as readonly (readonly [string, number, string])[];
  const hasAlloc = alloc.some(a => a[1] > 0);
  const proof = sprint.description
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  const recent10 = mineAll.filter(c => now - toMs(c.createdAt) < 10 * MIN).length;
  const last30 = mineAll.filter(c => now - toMs(c.createdAt) < 30 * MIN).reduce((a, c) => a + c.amount, 0n);

  // "Continue to UPI": create the authoritative session. Nothing is claimed yet.
  async function startUpi() {
    if (amount === null) return;
    setStage('creating');
    setError(null);
    setSessFloor(mySession?.id ?? 0n);
    try {
      await createSession({ sprintId: sprint.id, amount, optionIds: lines.map(l => l.perk.id), quantities: lines.map(l => l.qty) });
      setStage('upi');
    } catch (e) {
      const msg = humanError(e);
      if (/no longer available|claimed/i.test(msg)) {
        setStage('claimed');
        setError(msg);
      } else {
        setStage('error');
        setError(msg);
      }
    }
  }
  function closeSheet() {
    if (mySession && sessState === 'pending') cancelSession({ code: mySession.code }).catch(() => {});
    setStage('idle');
  }

  async function rate(stars: number) {
    setRateMsg(null);
    try {
      await rateBuilder({ sprintId: sprint.id, stars });
      setRateMsg(`Thanks — you rated this builder ${stars}/5.`);
    } catch (e) {
      setRateMsg(humanError(e));
    }
  }

  const [shareOpen, setShareOpen] = useState(false);
  const share = () => setShareOpen(true);
  const sprintState = upcoming ? 'upcoming' : 'live';
  const shareSheet = shareOpen ? (
    <ShareSheet sprint={sprint} amount={sprint.committedAmount} count={sprint.supporterCount} state={sprintState} remaining={remaining} who={isOwner ? 'builder' : 'supporter'} onClose={() => setShareOpen(false)} />
  ) : null;

  const panel = (
    <aside className={`panel${funded || fundedFlash ? ' funded' : ''}`} id="support">
      <div className="head">
        <span className={`pill ${upcoming ? 'info' : alarm ? 'urg' : 'live'}`}>
          <i className="dot" /> {upcoming ? 'Upcoming' : alarm ? 'Ending soon' : 'Live funding sprint'}
        </span>
        <button type="button" className={`chip${iLike ? ' on' : ''}`} onClick={() => toggleInterest({ sprintId: sprint.id }).catch(() => {})} aria-pressed={iLike}>
          <ThumbsUp size={13} /> {sprint.interestCount}
        </button>
      </div>
      {upcoming ? (
        <div className="stateblock info">
          <div className="label strong">Until the sprint opens</div>
          <div className="bigmono" style={{ margin: '6px 0 14px', color: 'var(--info)' }}>
            {clock(opensMs - now)}
          </div>
          <button type="button" className={`btn ${iLike ? 'secondary' : 'primary'} big block`} onClick={() => toggleInterest({ sprintId: sprint.id }).catch(() => {})}>
            {iLike ? "You're interested ✓" : "I'm interested"}
          </button>
          <button type="button" className="btn quiet block" style={{ marginTop: 8 }} onClick={share}>
            <Share2 size={15} /> Share
          </button>
        </div>
      ) : (
        <>
          <div className={`amt${flash ? ' flash' : ''}`}>{rupees(sprint.committedAmount)}</div>
          <div className="of">backed of {rupees(sprint.goalAmount)}</div>
          <div className={`track${urgent && !funded ? ' urg' : ''}`}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className={`togo${urgent && !funded ? ' urg' : ''}`}>{funded ? 'Pilot funded ✓' : `${rupees(gap)} to pilot`}</div>
          <div className="meta">
            <span>
              <b className={countFlash ? 'accent' : ''}>{sprint.supporterCount}</b> supporters
            </span>
            <span>
              <b className={urgent ? 'accent' : ''} style={urgent ? { color: 'var(--urg)' } : undefined}>
                {clock(remaining)}
              </b>{' '}
              left
            </span>
            {peopleHere > 0 && (
              <span>
                <b>{peopleHere}</b> here now
              </span>
            )}
            {sprint.reserveAmount > 0n && (
              <span>
                <b>{rupees(sprint.reserveAmount)}</b> reserve
              </span>
            )}
          </div>

          {isOwner ? (
            <div className="stateblock ok" style={{ boxShadow: 'none' }}>
              <div className="label strong" style={{ color: 'var(--ok-ink)' }}>
                This is your listing
              </div>
              <p style={{ margin: '8px 0 14px', color: 'var(--ink2)' }}>Builders can't back their own sprint. Share it, invite people, and watch it move from your dashboard.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a className="btn primary" href="/dashboard">
                  <Pencil size={14} /> Edit or manage
                </a>
                <button type="button" className="btn secondary" onClick={share}>
                  <Share2 size={14} /> Share
                </button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="panelh">How much would you like to support?</h2>
              <div className="note" style={{ marginTop: -8, marginBottom: 10 }}>
                Choose any amount. This is community support, not an investment.
              </div>
              <div className="amounts">
                {PRESETS.map(p => (
                  <button
                    key={String(p)}
                    type="button"
                    className={`amt-btn${amount === p ? ' on' : ''}`}
                    onClick={() => {
                      setTouched(true);
                      setAmountText(String(p));
                    }}
                  >
                    {rupees(p)}
                  </button>
                ))}
              </div>
              <label className={`amtfield${amount !== null && !PRESETS.includes(amount) ? ' on' : ''}`}>
                <span>₹</span>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={amountText}
                  onChange={e => {
                    setTouched(true);
                    setAmountText(e.target.value.replace(/[^\d]/g, ''));
                  }}
                  aria-label="Support amount in rupees"
                />
              </label>
              {amount !== null && amount < cartMin && <div className="warn">Those conditions need at least {rupees(cartMin)}</div>}

              <div className="label strong" style={{ marginTop: 16 }}>
                What the builder can offer
              </div>
              <div className="note" style={{ marginTop: 2 }}>
                Optional. You can always support with no expectation of anything in return.
              </div>
              <div className="opts">
                {perks.length === 0 ? (
                  <div className="opt on" style={{ cursor: 'default' }}>
                    <span>
                      <span className="t">
                        <Check size={14} /> Just support this build
                      </span>
                      <span className="d">No condition. Support because you want to help this project move forward.</span>
                    </span>
                  </div>
                ) : (
                  <button type="button" className={`opt${lines.length === 0 ? ' on' : ''}`} onClick={() => setCart(new Map())}>
                    <span>
                      <span className="t">
                        {lines.length === 0 && <Check size={14} />} Just support
                      </span>
                      <span className="d">No condition. I simply want to help this build move forward.</span>
                    </span>
                    <span className="st">Available</span>
                  </button>
                )}
                {perks.map(p => {
                  const limited = p.slotsTotal != null;
                  const left = limited ? p.slotsTotal! - p.slotsClaimed : null;
                  const out = limited && left! <= 0;
                  const q = cart.get(String(p.id)) ?? 0;
                  return (
                    <div
                      key={String(p.id)}
                      className={`opt${q > 0 ? ' on' : ''}${out ? ' out' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => !out && setQty(p, q > 0 ? q : 1)}
                      onKeyDown={e => e.key === 'Enter' && !out && setQty(p, q > 0 ? q : 1)}
                    >
                      <span>
                        <span className="t">
                          {q > 0 && <Check size={14} />} {p.title}
                          {p.minAmount > 0n ? <span style={{ color: 'var(--ink2)', fontWeight: 500 }}>· {rupees(p.minAmount)}</span> : null}
                        </span>
                        <span className="d">{p.description}</span>
                        {q > 0 && (
                          <span className="qty" onClick={e => e.stopPropagation()}>
                            <button type="button" onClick={() => setQty(p, q - 1)} aria-label="Fewer">
                              −
                            </button>
                            <b>{q}</b>
                            <button type="button" onClick={() => setQty(p, q + 1)} disabled={(limited && q >= left!) || q >= 100} aria-label="More">
                              +
                            </button>
                          </span>
                        )}
                      </span>
                      <span className={`st${out ? ' m' : limited && left! <= 2 ? ' o' : ''}`}>{out ? 'Claimed' : limited ? (left === 1 ? 'Last one' : `${left} left`) : 'Available'}</span>
                    </div>
                  );
                })}
              </div>

              <div className="total">
                <div>
                  <div className="label">Your support</div>
                  <div className="v">{amount !== null ? rupees(amount) : '—'}</div>
                  <div className="c">{condLabel}</div>
                </div>
                <button type="button" className="btn primary big desk-only" disabled={!canContinue} onClick={() => setStage('confirm')}>
                  Continue <ArrowRight size={16} />
                </button>
              </div>
              <div className="commission">
                <b>0% platform commission.</b> Every rupee you commit goes to the build. No equity, no returns.
              </div>
            </>
          )}
        </>
      )}
    </aside>
  );

  return (
    <>
      <Header me={me} />
      <main className="wrap detail">
        <div>
          {onboard && !upcoming && !isOwner && (
            <div className="onboard" role="region" aria-label="How this works">
              <div className="label strong" style={{ color: 'var(--info)' }}>
                How this works · 20 sec
              </div>
              <ol>
                <li>
                  <b>01</b> See what's already been built
                </li>
                <li>
                  <b>02</b> See what the builder needs for the next step
                </li>
                <li>
                  <b>03</b> Choose how much you want to support
                </li>
                <li>
                  <b>04</b> Optionally choose what the builder can provide
                </li>
                <li>
                  <b>05</b> Confirm the simulated support commitment
                </li>
              </ol>
              <button type="button" className="btn primary block" onClick={dismissOnboard}>
                Got it — support this build <ArrowRight size={16} />
              </button>
            </div>
          )}
          <div className="strip">
            <span className={`pill ${upcoming ? 'info' : alarm ? 'urg' : 'live'}`}>
              <i className="dot" /> {upcoming ? 'Upcoming' : alarm ? 'Ending soon' : 'Live'}
            </span>
            <span className="pill">Working prototype</span>
            <span className="pill info">{STAGE_LABEL[sprint.stage] ?? sprint.stage}</span>
            <span className="pill">{CATEGORY_LABEL[sprint.category] ?? sprint.category}</span>
          </div>
          <div className="titlerow">
            <h1>{sprint.title}</h1>
            <button type="button" className="btn secondary sm sharebtn" onClick={share} aria-label="Share this sprint">
              <Share2 size={15} /> <span className="desk-only">Share</span>
            </button>
          </div>
          {sprint.tagline && <p className="tagline">{sprint.tagline}</p>}
          <div className="byline">
            <span>
              {sprint.builderName}
              {sprint.builderUsername ? (
                <>
                  {' · '}
                  <a href={`/builder/${sprint.builderUsername}`} style={{ color: 'var(--accent-ink)' }}>
                    @{sprint.builderUsername}
                  </a>
                </>
              ) : null}
              {sprint.builderCity ? ` · ${sprint.builderCity}` : ''}
            </span>
            <Stars value={avgStars} count={builderRatings.length} />
          </div>
          <div className="gallery">
            {gallery.length ? <img src={gallery[Math.min(gi, gallery.length - 1)].full} alt="Working prototype" /> : sprint.mediaUrl ? <img src={sprint.mediaUrl} alt="Working prototype" /> : <div className="noimg">Working prototype</div>}
          </div>
          {gallery.length > 1 && (
            <div className="thumbs">
              {gallery.map((m, i) => (
                <button key={String(m.id)} type="button" className={i === gi ? 'on' : ''} onClick={() => setGi(i)} aria-label={`Image ${i + 1}`}>
                  <img src={m.thumb} alt="" />
                </button>
              ))}
            </div>
          )}

          {!upcoming && (
            <>
              <div className="cluster">
                <div>
                  <b className={flash ? 'flash' : ''}>{rupees(sprint.committedAmount)}</b>
                  <span>Backed</span>
                </div>
                <div>
                  <b>{pct.toFixed(0)}%</b>
                  <span>Funded</span>
                </div>
                <div>
                  <b className={countFlash ? 'flash' : ''}>{sprint.supporterCount}</b>
                  <span>Supporters</span>
                </div>
                <div>
                  <b className={urgent ? 'urg' : ''}>{clock(remaining)}</b>
                  <span>Left</span>
                </div>
              </div>
              <div className={`statement${urgent && !funded ? ' urg' : ''}`}>{funded ? 'This pilot is funded. Extra support goes to the reserve.' : `Only ${rupees(gap)} to make this pilot happen.`}</div>
              {(recent10 >= 2 || last30 > 0n) && (
                <div className="note" style={{ marginTop: 6 }}>
                  {recent10 >= 2 ? `${recent10} people backed this in the last 10 min` : ''}
                  {recent10 >= 2 && last30 > 0n ? ' · ' : ''}
                  {last30 > 0n ? `${rupees(last30)} in the last 30 min` : ''}
                </div>
              )}
            </>
          )}

          <div className="block">
            <h2>What's already built</h2>
            <ul className="proof">
              {proof.map((line, i) => (
                <li key={i}>
                  <CheckCircle2 size={18} />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="block">
            <h2>What this sprint unlocks</h2>
            <p className="big">{sprint.nextStep}</p>
          </div>
          {sprint.builderBio && (
            <div className="block">
              <h2>The builder</h2>
              <p>{sprint.builderBio}</p>
            </div>
          )}
          {hasAlloc && (
            <div className="block">
              <h2>Where the money goes</h2>
              <div className="alloc">{alloc.map(([l, p, c]) => (p > 0 ? <i key={l} style={{ width: `${p}%`, background: c }} title={`${l} ${p}%`} /> : null))}</div>
              <div className="legend">
                {alloc.map(([l, p, c]) =>
                  p > 0 ? (
                    <span key={l}>
                      <i style={{ background: c }} />
                      {l} {p}%
                    </span>
                  ) : null
                )}
              </div>
            </div>
          )}
          {timeline.length > 0 && (
            <div className="block">
              <h2>Build journey</h2>
              <ol className="journey">
                {timeline.map((j, i) => (
                  <li key={String(j.id)} data-n={pad2(i + 1)}>
                    <div className="d">{j.entryDate}</div>
                    <div>{j.text}</div>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="block">
            <h2>Live activity</h2>
            {feed.length === 0 ? (
              <div className="empty" style={{ padding: '14px 0', textAlign: 'left' }}>
                No support yet — be the first.
              </div>
            ) : (
              <ul className="activity">
                {feed.map(c => {
                  const d = new Date(toMs(c.createdAt));
                  const perk = c.supportOptionId != null ? perks.find(p => p.id === c.supportOptionId) : null;
                  return (
                    <li key={String(c.id)}>
                      <span className="t">
                        {pad2(d.getHours())}:{pad2(d.getMinutes())}
                      </span>
                      <span>
                        <b>{c.identity.toHexString() === myHex ? 'You' : nameOf(c.identity.toHexString())}</b> backed this
                        {perk ? ` · ${(c.quantity > 1 ? `${c.quantity} × ` : '') + perk.title}` : ''}
                      </span>
                      <span className="amt">{rupees(c.amount)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {iBacked && !isOwner && ownerHex && (
            <div className="block">
              <h2>Rate the builder</h2>
              <p style={{ color: 'var(--ink2)' }}>You've backed this build. How much do you trust this builder to deliver the next step?</p>
              <div className="stars pick" role="radiogroup" aria-label="Rate the builder" onMouseLeave={() => setHoverStar(0)}>
                {[1, 2, 3, 4, 5].map(i => (
                  <button key={i} type="button" className={i <= (hoverStar || myRating) ? 'on' : ''} onMouseEnter={() => setHoverStar(i)} onClick={() => rate(i)} aria-label={`${i} star${i === 1 ? '' : 's'}`} role="radio" aria-checked={myRating === i}>
                    <Star size={26} fill={i <= (hoverStar || myRating) ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
              {rateMsg && <div className="unote">{rateMsg}</div>}
            </div>
          )}
          <div className="block">
            <h2>Bring your people in</h2>
            <Invite sprintId={sprint.id} myUsername={me.username} myHex={myHex} />
            <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="button" className="btn secondary sm" onClick={share}>
                <Share2 size={14} /> Share, QR or WhatsApp
              </button>
            </div>
          </div>
          <Disclaimer />
        </div>
        {panel}
      </main>
      {shareSheet}
      {!upcoming && !isOwner && (
        <div className="stickybar">
          <div>
            <div className="v">{amount !== null ? rupees(amount) : '—'}</div>
            <div className="label">Your support</div>
          </div>
          <button type="button" className="btn primary big" disabled={!canContinue} onClick={() => setStage('confirm')}>
            Continue <ArrowRight size={16} />
          </button>
        </div>
      )}
      <Footer />

      {stage !== 'idle' && amount !== null && (
        <div className="scrim" role="dialog" aria-modal="true" aria-label="Support this build" onClick={e => e.target === e.currentTarget && stage !== 'creating' && closeSheet()}>
          <div className="sheet" style={{ maxHeight: '92vh', overflow: 'auto' }}>
            {stage === 'confirm' && (
              <>
                <h2>Support this build</h2>
                <div className="row">
                  <span>Project</span>
                  <span>{sprint.title}</span>
                </div>
                <div className="row">
                  <span>Support amount</span>
                  <span className="mono">{rupees(amount)}</span>
                </div>
                <div className="row">
                  <span>Builder condition</span>
                  <span style={{ textAlign: 'right' }}>{condLabel}</span>
                </div>
                <div className="row">
                  <span>BidFund commission</span>
                  <span className="mono">₹0</span>
                </div>
                <div className="row" style={{ fontWeight: 700 }}>
                  <span>Total commitment</span>
                  <span className="mono" style={{ color: 'var(--accent-ink)' }}>
                    {rupees(amount)}
                  </span>
                </div>
                <Disclosure />
                <button type="button" className="btn primary big block" style={{ marginTop: 14 }} onClick={startUpi}>
                  Continue to {isPhone() ? 'demo UPI' : 'UPI'} <ArrowRight size={16} />
                </button>
                <button type="button" className="btn quiet block" style={{ marginTop: 8 }} onClick={() => setStage('idle')}>
                  Cancel
                </button>
              </>
            )}
            {stage === 'creating' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
                <span className="spin" />
                <span className="label strong">Creating payment session</span>
              </div>
            )}
            {stage === 'upi' && mySession && (
              <>
                <div className="pay-head">
                  <h2 style={{ margin: 0 }}>Pay via UPI</h2>
                  <DemoBadge />
                </div>
                {sessState === 'pending' ? (
                  showQr ? (
                    <>
                      <Breakdown s={mySession} title={sprint.title} />
                      <div className="label strong" style={{ marginTop: 16, textAlign: 'center' }}>
                        Scan with your phone
                      </div>
                      <div className="note" style={{ textAlign: 'center', marginTop: 2 }}>
                        Scan this QR to open the BidFund demo UPI approval screen.
                      </div>
                      <SessionQr url={`${window.location.origin}/demo-pay/${mySession.code}`} />
                      <div style={{ textAlign: 'center' }}>
                        <div className="label">Payment session</div>
                        <div className="mono" style={{ fontWeight: 700, fontSize: 15 }}>
                          {mySession.code}
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <span className="waiting">
                            <i /> Waiting for approval…
                          </span>
                        </div>
                        <div className="note" style={{ marginTop: 6 }}>
                          Session expires in <span className={`mono${toMs(mySession.expiresAt) - now < 60_000 ? ' urgtext' : ''}`}>{clock(Math.max(0, toMs(mySession.expiresAt) - now))}</span>
                        </div>
                      </div>
                      <Disclosure />
                      <button type="button" className="btn secondary block" style={{ marginTop: 12 }} onClick={() => setShowQr(false)}>
                        Approve on this device instead
                      </button>
                      <button type="button" className="btn quiet block" style={{ marginTop: 8 }} onClick={closeSheet}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <Approval code={mySession.code} sprintTitle={sprint.title} embedded onDone={() => setStage('idle')} />
                      <button type="button" className="btn quiet block" style={{ marginTop: 8 }} onClick={() => setShowQr(true)}>
                        Show QR for another device
                      </button>
                    </>
                  )
                ) : (
                  <Approval
                    code={mySession.code}
                    sprintTitle={sprint.title}
                    embedded
                    onDone={() => {
                      if (sessState === 'perk_taken') setStage('idle');
                      else setStage('confirm');
                    }}
                  />
                )}
              </>
            )}
            {stage === 'success' && mySession && (
              <>
                {mySession.goalCrossed ? (
                  <div className="celebrate" aria-live="polite">
                    {!window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
                      Array.from({ length: 14 }, (_, i) => (
                        <span key={i} className="p" style={{ left: `${(i * 7 + 3) % 100}%`, animationDelay: `${(i % 5) * 90}ms` }}>
                          <Mark size={12 + (i % 3) * 4} color="var(--accent)" />
                        </span>
                      ))}
                    <div className="label strong" style={{ color: 'var(--ok-ink)' }}>
                      <Check size={14} /> Payment simulated
                    </div>
                    <div className="h" style={{ marginTop: 8 }}>
                      You just funded
                      <br />
                      the pilot.
                    </div>
                    <div className="n">
                      {rupees(sprint.goalAmount)} goal reached · {sprint.supporterCount} supporters
                    </div>
                    <p style={{ margin: '8px 0 0', color: 'var(--ink2)' }}>Your support took this build across the line.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Mark size={18} />
                    <span className="label strong" style={{ color: 'var(--ok-ink)' }}>
                      Payment simulated
                    </span>
                  </div>
                )}
                <div className="label strong" style={{ marginTop: 12 }}>
                  Support confirmed
                </div>
                <div className="bigmono" style={{ margin: '6px 0 4px' }}>
                  {rupees(mySession.amount)} committed
                </div>
                {mySession.conditionLabel && <div className="label">{mySession.conditionLabel}</div>}
                {!mySession.goalCrossed && (
                  <p style={{ margin: '12px 0 0', fontWeight: 600 }}>
                    You moved this build {rupees(mySession.amount)} closer to pilot.
                  </p>
                )}
                <div className="cluster" style={{ margin: '14px 0 8px', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  <div>
                    <b>{rupees(sprint.committedAmount)}</b>
                    <span>of {rupees(sprint.goalAmount)}</span>
                  </div>
                  <div>
                    <b>{pct.toFixed(0)}%</b>
                    <span>Funded</span>
                  </div>
                  <div>
                    <b>{funded ? '✓' : rupees(gap)}</b>
                    <span>{funded ? 'Pilot funded' : 'To pilot'}</span>
                  </div>
                </div>
                <div className="row">
                  <span>BidFund commission</span>
                  <span className="mono">₹0</span>
                </div>
                <div className="row">
                  <span>Reference</span>
                  <span className="mono">{mySession.code}</span>
                </div>
                <Disclosure past />
                <div className="share-card">
                  <ShareSheet sprint={sprint} amount={sprint.committedAmount} count={sprint.supporterCount} state="live" remaining={remaining} who="supporter" myAmount={mySession.amount} inline heading="Share the moment" />
                </div>
                <button type="button" className="btn primary big block" style={{ marginTop: 14 }} onClick={() => setStage('idle')}>
                  Back to live sprint
                </button>
              </>
            )}
            {stage === 'claimed' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="status-light o" />
                  <span className="label strong" style={{ color: 'var(--urg)' }}>
                    Support option just claimed
                  </span>
                </div>
                <p style={{ margin: '12px 0 4px' }}>{error || 'Someone else secured that builder condition while you were confirming.'}</p>
                <p style={{ margin: '0 0 16px', color: 'var(--ink2)' }}>Nothing was committed. Your amount of {rupees(amount)} is kept.</p>
                <button
                  type="button"
                  className="btn primary big block"
                  onClick={() => {
                    setCart(new Map());
                    setStage('confirm');
                  }}
                >
                  Support without a condition <ArrowRight size={16} />
                </button>
                <button type="button" className="btn secondary block" style={{ marginTop: 8 }} onClick={() => setStage('idle')}>
                  Choose another option
                </button>
              </>
            )}
            {stage === 'error' && (
              <>
                <div className="err">{error}</div>
                <button type="button" className="btn secondary block" onClick={() => setStage('idle')}>
                  <X size={15} /> Close
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
