import { useEffect, useMemo, useRef, useState } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from './module_bindings';
import type { Infer } from 'spacetimedb';
import SprintRow from './module_bindings/sprint_table';
import { ArrowRight, Eye, SlidersHorizontal } from 'lucide-react';
import { CATEGORIES, CATEGORY_LABEL, MIN, STAGES, STAGE_LABEL, ago, rupees, short, sprintPath, toMs } from './ui';

export type Sprint = Infer<typeof SprintRow>;
export type Disc = 'live' | 'supported' | 'new' | 'ending' | 'almost';
export type Status = 'all' | 'live' | 'upcoming' | 'closed';
export type Sort = 'ending' | 'newest' | 'funded' | 'backed';

export const ALARM_MS = 30 * MIN;

// Everything a card or list needs, derived from subscribed rows only.
export function useSprintSignals(now: number) {
  const [sprints, ready] = useTable(tables.sprint);
  const [finals] = useTable(tables.finalResult);
  const [commitments] = useTable(tables.supportCommitment);
  const [options] = useTable(tables.supportOption);
  const [presence] = useTable(tables.roomPresence);

  const visible = useMemo(() => [...sprints].filter(s => s.status !== 'archived'), [sprints]);
  const finalOf = (s: Sprint) => finals.find(f => f.sprintId === s.id);
  const isEnded = (s: Sprint) => s.status === 'closed' || toMs(s.deadline) <= now;
  const isUpcoming = (s: Sprint) => !isEnded(s) && toMs(s.opensAt) > now;
  const isLive = (s: Sprint) => !isEnded(s) && !isUpcoming(s);
  const amountOf = (s: Sprint) => finalOf(s)?.finalCommittedAmount ?? s.committedAmount;
  const countOf = (s: Sprint) => finalOf(s)?.finalSupporterCount ?? s.supporterCount;
  const isFunded = (s: Sprint) => amountOf(s) >= s.goalAmount;
  const pctOf = (s: Sprint) => Math.min(100, Number((amountOf(s) * 1000n) / s.goalAmount) / 10);
  const remainingOf = (s: Sprint) => toMs(s.deadline) - now;
  const isAlarm = (s: Sprint) => isLive(s) && remainingOf(s) <= ALARM_MS;

  const lastSupport = useMemo(() => {
    const m = new Map<string, { at: number; amount: bigint; who: string; recent10: number; last30: bigint }>();
    for (const c of commitments) {
      const k = String(c.sprintId);
      const at = toMs(c.createdAt);
      const cur = m.get(k);
      const recent10 = (cur?.recent10 ?? 0) + (now - at < 10 * MIN ? 1 : 0);
      const last30 = (cur?.last30 ?? 0n) + (now - at < 30 * MIN ? c.amount : 0n);
      if (!cur || at > cur.at) m.set(k, { at, amount: c.amount, who: c.identity.toHexString(), recent10, last30 });
      else m.set(k, { ...cur, recent10, last30 });
    }
    return m;
  }, [commitments, now]);

  const peopleBySprint = useMemo(() => {
    const sets = new Map<string, Set<string>>();
    for (const r of presence) {
      const k = String(r.sprintId);
      if (!sets.has(k)) sets.set(k, new Set());
      sets.get(k)!.add(r.identity.toHexString());
    }
    return new Map([...sets].map(([k, v]) => [k, v.size]));
  }, [presence]);

  const lowLeft = (s: Sprint) => {
    const lim = options.filter(o => o.sprintId === s.id && o.slotsTotal != null);
    if (!lim.length) return null;
    const left = lim.map(o => ({ o, left: o.slotsTotal! - o.slotsClaimed })).filter(x => x.left > 0);
    if (!left.length) return { left: 0, title: lim[0].title };
    const min = left.reduce((a, b) => (a.left < b.left ? a : b));
    return { left: min.left, title: min.o.title };
  };
  // Specific scarcity copy: "1 Pilot Unit left", never "Last one".
  const scarcity = (s: Sprint) => {
    const low = lowLeft(s);
    if (!low) return null;
    const unit = /\b(unit|spot|seat|slot|kit|board|device|pack|copy|copies|pass|access|ticket|visit|call)s?\b/i.test(low.title) ? low.title : `${low.title} spot`;
    if (low.left === 0) return `All ${unit.toLowerCase()}s claimed`;
    return `${low.left} ${unit}${low.left === 1 ? '' : 's'} left`;
  };
  const todayCount = (s: Sprint) => commitments.filter(c => c.sprintId === s.id && now - toMs(c.createdAt) < 24 * 60 * MIN).length;

  // Alarm sprints (last 30 min) always sort to the top.
  const withAlarmFirst = (rows: Sprint[]) =>
    rows.slice().sort((a, b) => {
      const aa = isAlarm(a) ? 0 : 1;
      const ab = isAlarm(b) ? 0 : 1;
      if (aa !== ab) return aa - ab;
      if (aa === 0) return remainingOf(a) - remainingOf(b);
      return 0;
    });

  return {
    ready,
    sprints: visible,
    commitments,
    options,
    finals,
    finalOf,
    isEnded,
    isUpcoming,
    isLive,
    amountOf,
    countOf,
    isFunded,
    pctOf,
    remainingOf,
    isAlarm,
    lastSupport,
    peopleBySprint,
    lowLeft,
    scarcity,
    todayCount,
    withAlarmFirst,
  };
}

export type Signals = ReturnType<typeof useSprintSignals>;

export function Card({ s, sig, now }: { s: Sprint; sig: Signals; now: number }) {
  const amount = sig.amountOf(s);
  const count = sig.countOf(s);
  const pct = sig.pctOf(s);
  const ended = sig.isEnded(s);
  const upcoming = sig.isUpcoming(s);
  const funded = sig.isFunded(s);
  const people = sig.peopleBySprint.get(String(s.id)) ?? 0;
  const low = sig.lowLeft(s);
  const remaining = sig.remainingOf(s);
  const alarm = sig.isAlarm(s);
  const urgent = !ended && !upcoming && remaining < 10 * MIN;
  const ls = sig.lastSupport.get(String(s.id));
  const justSupported = ls && now - ls.at < 2 * MIN;
  const isNew = now - toMs(s.createdAt) < 30 * MIN && !ended;
  const gap = s.goalAmount > amount ? s.goalAmount - amount : 0n;
  const zero = amount === 0n && !ended && !upcoming;
  const scarce = sig.scarcity(s);
  const micro = ended
    ? funded
      ? { t: 'Pilot funded', c: 'live' }
      : null
    : funded
      ? { t: 'Pilot funded', c: 'live' }
      : alarm
        ? { t: 'Ending soon', c: 'urg' }
        : zero
          ? { t: 'Just launched', c: 'info' }
          : justSupported
            ? { t: 'Just supported', c: 'live' }
            : pct >= 75
              ? { t: 'Almost funded', c: 'live' }
              : isNew
                ? { t: 'New', c: 'info' }
                : null;
  return (
    <a className={`pcard${alarm ? ' alarm' : ''}`} href={sprintPath(s)}>
      <div className="img">
        {s.mediaUrl ? <img src={s.mediaUrl} alt="" loading="lazy" onError={e => (e.currentTarget.style.display = 'none')} /> : <div className="noimg">No photo yet</div>}
        <div className="ov">
          <span className={`pill ${ended ? 'muted' : alarm ? 'urg' : upcoming ? 'info' : 'live'}`}>
            <i className="dot" /> {ended ? 'Closed' : alarm ? short(remaining) : upcoming ? 'Upcoming' : 'Live'}
          </span>
          {micro && !alarm && <span className={`pill ${micro.c}`}>{micro.t}</span>}
          {!ended && people > 0 && !micro && (
            <span className="pill">
              <Eye size={12} /> {people}
            </span>
          )}
        </div>
      </div>
      <div className="body">
        <h3>{s.title}</h3>
        <div className="next">{s.nextStep || s.tagline}</div>
        <div className="money">
          <b>{rupees(amount)}</b>
          <span>backed of {rupees(s.goalAmount)}</span>
        </div>
        <div className={`track${urgent && !funded ? ' urg' : ''}`}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="gap">
          <span>{zero ? 'No supporters yet' : `${pct.toFixed(0)}% funded`}</span>
          <span className={`to${urgent && !funded ? ' urg' : ''}`}>{funded ? 'Pilot funded ✓' : zero ? 'Be the first supporter' : `${rupees(gap)} to pilot`}</span>
        </div>
        {ls && ls.recent10 >= 2 && !ended && (
          <div className="gap" style={{ color: 'var(--accent-ink)' }}>
            {ls.recent10} people backed this in 10 min
          </div>
        )}
      </div>
      <div className="foot">
        <span>
          {count} supporter{count === 1 ? '' : 's'}
          {ls && now - ls.at < 60 * MIN ? ` · ${ago(now - ls.at)}` : ''}
        </span>
        {scarce && !ended && low && low.left <= 3 ? <span className={low.left <= 2 ? 'urg' : ''}>{scarce}</span> : null}
        <span className={urgent ? 'urg' : ''}>{ended ? 'Ended' : upcoming ? `Opens in ${short(toMs(s.opensAt) - now).replace(' left', '')}` : short(remaining)}</span>
      </div>
      <div className="cta">
        <span className={`btn ${zero ? 'primary' : 'secondary'} block`}>
          {ended ? 'View result' : upcoming ? 'Preview' : zero ? 'Be the first supporter' : 'Support'} <ArrowRight size={16} />
        </span>
      </div>
    </a>
  );
}

export function DiscoveryTabs({ disc, setDisc }: { disc: Disc; setDisc: (d: Disc) => void }) {
  const tabs: [Disc, string][] = [
    ['live', 'Live now'],
    ['supported', 'Getting supported'],
    ['new', 'New builds'],
    ['ending', 'Ending soon'],
    ['almost', 'Almost funded'],
  ];
  return (
    <div className="row">
      {tabs.map(([k, l]) => (
        <button key={k} type="button" className={`tab${disc === k ? ' on' : ''}`} onClick={() => setDisc(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export type Filters = { stage: string; category: string; status: Status; sort: Sort };
export const DEFAULT_FILTERS: Filters = { stage: 'all', category: 'all', status: 'all', sort: 'ending' };

export function FilterButton({ filters, setFilters, count }: { filters: Filters; setFilters: (f: Filters) => void; count: number }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Filters>(filters);
  const active = (filters.stage !== 'all' ? 1 : 0) + (filters.category !== 'all' ? 1 : 0) + (filters.status !== 'all' ? 1 : 0) + (filters.sort !== 'ending' ? 1 : 0);
  const chip = (on: boolean, label: string, onClick: () => void) => (
    <button key={label} type="button" className={`chip${on ? ' on' : ''}`} onClick={onClick}>
      {label}
    </button>
  );
  return (
    <>
      <button
        type="button"
        className="filterbtn"
        onClick={() => {
          setDraft(filters);
          setOpen(o => !o);
        }}
        aria-expanded={open}
      >
        <SlidersHorizontal size={15} /> Filters {active > 0 && <span className="n">{active}</span>}
      </button>
      {open && (
        <div className="fpanel" role="dialog" aria-label="Filters">
          <h4>Stage</h4>
          <div className="opts">
            {chip(draft.stage === 'all', 'All', () => setDraft({ ...draft, stage: 'all' }))}
            {STAGES.map(k => chip(draft.stage === k, STAGE_LABEL[k], () => setDraft({ ...draft, stage: k })))}
          </div>
          <h4>Category</h4>
          <div className="opts">
            {chip(draft.category === 'all', 'All', () => setDraft({ ...draft, category: 'all' }))}
            {CATEGORIES.map(k => chip(draft.category === k, CATEGORY_LABEL[k], () => setDraft({ ...draft, category: k })))}
          </div>
          <h4>Status</h4>
          <div className="opts">
            {(
              [
                ['all', 'All'],
                ['live', 'Live'],
                ['upcoming', 'Upcoming'],
                ['closed', 'Closed'],
              ] as [Status, string][]
            ).map(([k, l]) => chip(draft.status === k, l, () => setDraft({ ...draft, status: k })))}
          </div>
          <h4>Sort</h4>
          <div className="opts">
            {(
              [
                ['ending', 'Ending soon'],
                ['newest', 'Newest'],
                ['funded', 'Most funded'],
                ['backed', 'Most backed'],
              ] as [Sort, string][]
            ).map(([k, l]) => chip(draft.sort === k, l, () => setDraft({ ...draft, sort: k })))}
          </div>
          <div className="foot">
            <button
              type="button"
              className="btn quiet sm"
              onClick={() => {
                setDraft(DEFAULT_FILTERS);
                setFilters(DEFAULT_FILTERS);
                setOpen(false);
              }}
            >
              Clear all
            </button>
            <button
              type="button"
              className="btn primary sm"
              onClick={() => {
                setFilters(draft);
                setOpen(false);
              }}
            >
              Show {count} project{count === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function applyFilters(rows: Sprint[], f: Filters, sig: Signals): Sprint[] {
  const out = rows.filter(s => {
    if (f.status === 'live' && !sig.isLive(s)) return false;
    if (f.status === 'upcoming' && !sig.isUpcoming(s)) return false;
    if (f.status === 'closed' && !sig.isEnded(s)) return false;
    if (f.stage !== 'all' && s.stage !== f.stage) return false;
    if (f.category !== 'all' && s.category !== f.category) return false;
    return true;
  });
  out.sort((a, b) => {
    if (f.sort === 'newest') return Number(b.createdAt.microsSinceUnixEpoch - a.createdAt.microsSinceUnixEpoch);
    if (f.sort === 'backed') return sig.countOf(b) - sig.countOf(a);
    if (f.sort === 'funded') return sig.pctOf(b) - sig.pctOf(a);
    const ea = sig.isEnded(a);
    const eb = sig.isEnded(b);
    if (ea !== eb) return ea ? 1 : -1;
    return ea ? sig.remainingOf(b) - sig.remainingOf(a) : sig.remainingOf(a) - sig.remainingOf(b);
  });
  return sig.withAlarmFirst(out);
}

export function applyDisc(rows: Sprint[], disc: Disc, sig: Signals, now: number): Sprint[] {
  const live = rows.filter(sig.isLive);
  let out: Sprint[];
  if (disc === 'supported') {
    // Only real recent support: a commitment in the last 60 minutes.
    out = live.filter(s => (sig.lastSupport.get(String(s.id))?.at ?? 0) > now - 60 * MIN).sort((a, b) => sig.lastSupport.get(String(b.id))!.at - sig.lastSupport.get(String(a.id))!.at);
  } else if (disc === 'new') out = live.slice().sort((a, b) => Number(b.createdAt.microsSinceUnixEpoch - a.createdAt.microsSinceUnixEpoch));
  else if (disc === 'ending') out = live.slice().sort((a, b) => sig.remainingOf(a) - sig.remainingOf(b));
  else if (disc === 'almost') {
    const eligible = live.filter(s => !sig.isFunded(s));
    const strong = eligible.filter(s => sig.pctOf(s) >= 80);
    out = (strong.length >= 3 ? strong : eligible.filter(s => sig.pctOf(s) >= 75)).sort((a, b) => sig.pctOf(b) - sig.pctOf(a));
  } else {
    // Live now: recently supported → meaningful progress → just launched → time left.
    const score = (s: Sprint) => {
      const ls = sig.lastSupport.get(String(s.id));
      const recent = ls ? Math.max(0, 1 - (now - ls.at) / (6 * 60 * MIN)) : 0; // fades over 6h
      return recent * 1000 + sig.pctOf(s) * 5 + (sig.countOf(s) > 0 ? 50 : 0) - sig.remainingOf(s) / (60 * MIN) / 100;
    };
    out = live.slice().sort((a, b) => score(b) - score(a));
  }
  return sig.withAlarmFirst(out);
}

type Ev = { key: string; at: number; text: string; href: string; urg?: boolean; timed: boolean };

// Real community activity from subscribed rows only: every commitment in the
// last hour, new sprints, funded pilots, scarcity, milestones, ending-soon.
function useEvents(sig: Signals, now: number): Ev[] {
  const [profiles] = useTable(tables.profile);
  return useMemo(() => {
    const nameOf = (hex: string) => {
      const p = profiles.find(x => x.identity.toHexString() === hex);
      return p ? (p.username ? `@${p.username}` : p.displayName) : 'Someone';
    };
    const events: Ev[] = [];
    const byId = new Map(sig.sprints.map(s => [String(s.id), s]));
    for (const c of sig.commitments) {
      const at = toMs(c.createdAt);
      const s = byId.get(String(c.sprintId));
      if (!s || now - at > 60 * MIN) continue;
      events.push({ key: `c${c.id}`, at, text: `${nameOf(c.identity.toHexString())} just backed ${s.title} · ${rupees(c.amount)}`, href: sprintPath(s), timed: true });
    }
    for (const s of sig.sprints) {
      const href = sprintPath(s);
      if (now - toMs(s.createdAt) < 3 * 60 * MIN && !sig.isEnded(s)) events.push({ key: `n${s.id}`, at: toMs(s.createdAt), text: `New sprint live · ${s.title}`, href, timed: true });
      const f = sig.finalOf(s);
      if (sig.isFunded(s) && (f ? now - toMs(f.closedAt) < 12 * 60 * MIN : sig.isLive(s))) events.push({ key: `f${s.id}`, at: f ? toMs(f.closedAt) : now - 30_000, text: `Pilot funded · ${s.title}`, href, timed: !!f });
      if (!sig.isLive(s)) continue;
      // Standing states sit behind anything that happened in the last 10 minutes.
      const standing = now - 10 * MIN;
      if (sig.isAlarm(s)) events.push({ key: `e${s.id}`, at: standing + 4, text: `${short(sig.remainingOf(s))} · ${s.title}`, href, urg: true, timed: false });
      const low = sig.lowLeft(s);
      if (low && low.left > 0 && low.left <= 3) events.push({ key: `l${s.id}`, at: standing + 3, text: `${sig.scarcity(s)} · ${s.title}`, href, urg: true, timed: false });
      const pct = sig.pctOf(s);
      if (pct >= 75 && !sig.isFunded(s)) events.push({ key: `g${s.id}`, at: standing + 2, text: `${pct.toFixed(0)}% funded · ${rupees(s.goalAmount - sig.amountOf(s))} to go · ${s.title}`, href, timed: false });
      const today = sig.todayCount(s);
      if (today >= 3) events.push({ key: `t${s.id}`, at: standing + 1, text: `${today} supporters joined today · ${s.title}`, href, timed: false });
    }
    return events.sort((a, b) => b.at - a.at);
  }, [sig, profiles, now]);
}

export function HappeningNow({ sig, now, limit = 12 }: { sig: Signals; now: number; limit?: number }) {
  const list = useEvents(sig, now).slice(0, limit);
  // Highlight events that arrived after first render, for ~800ms.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(list.map(e => e.key));
      return;
    }
    const added = list.filter(e => !seen.current!.has(e.key)).map(e => e.key);
    if (!added.length) return;
    for (const k of added) seen.current.add(k);
    setFresh(f => new Set([...f, ...added]));
    const t = setTimeout(() => setFresh(f => new Set([...f].filter(k => !added.includes(k)))), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.map(e => e.key).join('|')]);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!phone || list.length < 2) return;
    const id = setInterval(() => setIdx(i => (i + 1) % list.length), 4500);
    return () => clearInterval(id);
  }, [phone, list.length]);
  const touchX = useRef(0);
  if (!list.length) return null;

  const item = (e: Ev) => (
    <a key={e.key} href={e.href} className={`hevent${e.urg ? ' urg' : ''}${fresh.has(e.key) ? ' fresh' : ''}`}>
      <b>{e.text}</b>
      {e.timed && <span className="t">{ago(now - e.at)}</span>}
    </a>
  );

  if (phone) {
    const e = list[idx % list.length];
    return (
      <div
        className="happening mobile"
        aria-label="Happening now"
        aria-live="polite"
        onTouchStart={ev => (touchX.current = ev.touches[0].clientX)}
        onTouchEnd={ev => {
          const dx = ev.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40) setIdx(i => (i + (dx < 0 ? 1 : list.length - 1)) % list.length);
        }}
      >
        <span className="pill live" style={{ height: 22, padding: '0 8px' }}>
          <i className="dot" /> Now
        </span>
        <div className="one" key={e.key}>
          {item(e)}
        </div>
        {list.length > 1 && (
          <span className="cnt">
            {(idx % list.length) + 1}/{list.length}
          </span>
        )}
      </div>
    );
  }

  // Desktop: calm marquee when the row overflows, static row otherwise.
  const marquee = !reduced && list.length >= 4;
  const dur = Math.max(20, list.length * 7); // ≈ 30px/s for typical item widths
  return (
    <div className={`happening${marquee ? ' marquee' : ''}`} aria-label="Happening now">
      <span className="lbl">
        <span className="pill live" style={{ height: 22, padding: '0 8px' }}>
          <i className="dot" /> Happening now
        </span>
      </span>
      <div className="items">
        <div className="track-row" style={marquee ? { animationDuration: `${dur}s` } : undefined}>
          {list.map(item)}
          {marquee && list.map(e => ({ ...e, key: e.key + '-dup' })).map(e => <span key={e.key} aria-hidden>{item({ ...e, key: e.key })}</span>)}
        </div>
      </div>
    </div>
  );
}

export function Metrics({ sig }: { sig: Signals }) {
  const committed = sig.sprints.reduce((a, s) => a + sig.amountOf(s) + s.reserveAmount, 0n);
  const live = sig.sprints.filter(sig.isLive).length;
  const funded = sig.sprints.filter(sig.isFunded).length;
  const supporters = new Set(sig.commitments.map(c => c.identity.toHexString())).size;
  const backedBuilds = new Set(sig.commitments.map(c => String(c.sprintId))).size;
  // Second card: the strongest real metric. Never hero a zero.
  const second =
    funded > 0
      ? { n: funded, l: `Pilot${funded === 1 ? '' : 's'} funded`, c: 'goal reached by the community' }
      : supporters > 0
        ? { n: supporters, l: `Supporter${supporters === 1 ? '' : 's'}`, c: 'people backing real builds' }
        : backedBuilds > 0
          ? { n: backedBuilds, l: 'Builds backed', c: 'with real support' }
          : { n: sig.sprints.length, l: 'Builds listed', c: 'working prototypes' };
  return (
    <div className="metrics">
      <div className="metric">
        <div className="n accent">{lakhSafe(committed)}</div>
        <div className="l">Support committed</div>
        <div className="c">to working hardware</div>
      </div>
      <div className="metric">
        <div className="n">{second.n}</div>
        <div className="l">{second.l}</div>
        <div className="c">{second.c}</div>
      </div>
      <div className="metric">
        <div className="n">{live}</div>
        <div className="l">Live now</div>
        <div className="c">sprints you can back right now</div>
      </div>
      <div className="metric">
        <div className="n accent">0%</div>
        <div className="l">Platform commission</div>
        <div className="c">we don't take a cut</div>
      </div>
    </div>
  );
}

function lakhSafe(n: bigint): string {
  const v = Number(n);
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000) return `₹${(v / 100_000).toFixed(1)}L`;
  return rupees(n);
}
