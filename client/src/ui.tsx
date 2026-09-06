import { useEffect, useMemo, useState } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from './module_bindings';
import { Menu, Search, ShieldCheck, Star, X } from 'lucide-react';
import type { Timestamp } from 'spacetimedb';

// Admin-editable site copy. Keys live in the public site_config table; anything
// unset falls back to these defaults so the site never renders blank.
export const SITE_DEFAULTS: Record<string, string> = {
  announcement: '',
  hero_eyebrow: 'Micro-funding for real hardware',
  hero_title: 'Help the next hardware pilot happen.',
  hero_accent: 'LIVE.',
  hero_sub: 'Discover working prototypes ready for their next step. Back the builders you believe in and watch your support move them closer to pilot, live.',
  wall_title: 'Back something real.',
  wall_sub: 'Working hardware. Small, specific asks. Clear next steps. Live community support.',
  about_eyebrow: 'Built from the hardware community',
  about_headline: 'We built BidFund for the gap we keep running into.',
  about_body:
    'A working prototype proves the idea. But getting it to a real pilot still needs components, fabrication, testing, certification and small batches — often just a relatively small amount of money.\n\nToo small for traditional funding. Too awkward for a large crowdfunding campaign.\n\nThat is the gap BidFund is built for.',
  credit: 'Made with love by fellow hardware builders Lakshveer Rao & Adarsh Malpeddiwar, with support from Capt Venkat.',
  footer_line: 'Micro-funding for hardware builders going from prototype to pilot.',
  accent_color: '',
  hide_people: '',
  hide_happening: '',
  hide_metrics: '',
};
export const SITE_FIELDS: { key: string; label: string; help?: string; multiline?: boolean; kind?: 'text' | 'flag' | 'color' }[] = [
  { key: 'announcement', label: 'Announcement bar', help: 'Shown under the header on every page. Empty = no bar.' },
  { key: 'hero_eyebrow', label: 'Hero eyebrow' },
  { key: 'hero_title', label: 'Hero headline' },
  { key: 'hero_accent', label: 'Hero accent word', help: 'Rendered in green after the headline.' },
  { key: 'hero_sub', label: 'Hero subline', multiline: true },
  { key: 'wall_title', label: 'Live wall title' },
  { key: 'wall_sub', label: 'Live wall subline' },
  { key: 'about_eyebrow', label: 'About eyebrow' },
  { key: 'about_headline', label: 'About headline' },
  { key: 'about_body', label: 'About body', multiline: true },
  { key: 'credit', label: 'Credit line', help: 'Appears in About and in the footer.' },
  { key: 'footer_line', label: 'Footer one-liner' },
  { key: 'accent_color', label: 'Accent colour', help: 'Hex like #A8DC3A. Buttons, progress bars and highlights.', kind: 'color' },
  { key: 'hide_people', label: 'People section', kind: 'flag' },
  { key: 'hide_happening', label: 'Happening Now strip', kind: 'flag' },
  { key: 'hide_metrics', label: 'Outcome metric cards', kind: 'flag' },
];

export function useSite(): (key: string) => string {
  const [rows] = useTable(tables.siteConfig);
  const map = useMemo(() => new Map(rows.map(r => [r.key, r.value])), [rows]);
  const accent = map.get('accent_color') ?? '';
  useEffect(() => {
    const root = document.documentElement;
    if (/^#[0-9a-f]{6}$/i.test(accent)) root.style.setProperty('--accent', accent);
    else root.style.removeProperty('--accent');
  }, [accent]);
  return key => map.get(key) ?? SITE_DEFAULTS[key] ?? '';
}

const inr = new Intl.NumberFormat('en-IN');
export const rupees = (n: bigint) => `₹${inr.format(n)}`;
export const toMs = (ts: Timestamp) => Number(ts.microsSinceUnixEpoch / 1000n);
export const refCode = (mock: string) => `BF-${mock.replace(/^MOCK-/, '').slice(-6)}`;
export const MIN = 60_000;

export function lakh(n: bigint): string {
  const v = Number(n);
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000) return `₹${(v / 100_000).toFixed(1)}L`;
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}K`;
  return rupees(n);
}

export function clock(ms: number): string {
  if (ms <= 0) return '00:00';
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

// Natural remaining time from the authoritative deadline:
// >24h "4d 6h left" · <24h "18h 42m left" · <1h "07:18 left" · expired "Sprint closed".
export function short(ms: number): string {
  if (ms <= 0) return 'Sprint closed';
  const m = Math.floor(ms / MIN);
  if (m < 60) return `${clock(ms)} left`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m left`;
  return `${Math.floor(h / 24)}d ${h % 24}h left`;
}

export function ago(ms: number): string {
  if (ms < 8_000) return 'just now';
  if (ms < MIN) return `${Math.floor(ms / 1000)} sec ago`;
  if (ms < 60 * MIN) return `${Math.floor(ms / MIN)} min ago`;
  if (ms < 24 * 60 * MIN) return `${Math.floor(ms / (60 * MIN))}h ago`;
  return `${Math.floor(ms / (24 * 60 * MIN))}d ago`;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function urlParam(name: string): string {
  try {
    return new URLSearchParams(window.location.search).get(name) ?? '';
  } catch {
    return '';
  }
}

export function humanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes(': ') ? msg.slice(msg.indexOf(': ') + 2) : msg;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export const sprintPath = (s: { id: bigint; title: string }) => `/sprint/${s.id}-${slugify(s.title) || 'sprint'}`;

export const CATEGORY_LABEL: Record<string, string> = {
  water: 'Water',
  agri: 'Agri',
  health: 'Health',
  recycle: 'Recycle',
  mobility: 'Mobility',
  robotics: 'Robotics',
  energy: 'Energy',
  other: 'Other',
};
export const STAGE_LABEL: Record<string, string> = {
  sketch: 'Sketch',
  prototype: 'Prototype',
  pilot: 'Pilot',
  shipping: 'Shipping',
};
export const CATEGORIES = Object.keys(CATEGORY_LABEL);
export const STAGES = Object.keys(STAGE_LABEL);

// The BidFund mark: a rising infinity. One continuous stroke, right loop
// larger and slightly higher than the left. Same geometry as public/favicon.svg
// and public/brand/*.svg — keep these in sync.
export const MARK_PATH = 'M16 12C18.4 7.6 23.6 3.6 28 5.4C32.4 7.2 31.8 14.2 26.6 15.2C22.2 16 18.6 13.8 16 12C13.4 10.2 9.4 8.2 5.6 10.2C1.8 12.2 2.4 18.6 7.6 18.6C11.8 18.6 14 14.4 16 12Z';

export function Mark({ size = 22, color = 'var(--accent)', className }: { size?: number; color?: string; className?: string }) {
  return (
    <svg viewBox="0 0 32 24" width={Math.round((size * 32) / 24)} height={size} fill="none" stroke={color} strokeWidth={size < 18 ? 3.8 : 3.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d={MARK_PATH} />
    </svg>
  );
}

export function Logo() {
  return (
    <a className="logo" href="/" aria-label="BidFund home">
      <Mark size={22} />
      <span>
        Bid<b>Fund</b>
      </span>
    </a>
  );
}

export function Header({ me, active, isAdmin }: { me?: { displayName: string; username: string }; active?: string; isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const site = useSite();
  const announcement = site('announcement');
  const links = [
    ['/live', 'Live Sprints'],
    ['/#how-it-works', 'How It Works'],
    ['/builders', 'For Builders'],
  ];
  return (
    <header className="hdr">
      <div className="wrap">
        <Logo />
        <nav className="nav" aria-label="Primary">
          {links.map(([h, l]) => (
            <a key={l} href={h} className={active === h ? 'on' : ''}>
              {l}
            </a>
          ))}
        </nav>
        <span className="grow" />
        {me && (
          <a className="me desk-only" href="/dashboard">
            {me.username ? `@${me.username}` : me.displayName}
          </a>
        )}
        {isAdmin && (
          <a className="ibtn desk-only" href="/admin" aria-label="Admin" title="Admin">
            <ShieldCheck size={19} />
          </a>
        )}
        <a className="ibtn" href="/builder" aria-label="Search builders">
          <Search size={19} />
        </a>
        <a className="btn primary desk-only" href="/start">
          Start a sprint
        </a>
        <button className="ibtn mobile-only" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          {open ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>
      {open && (
        <div className="menu">
          {links.map(([h, l]) => (
            <a key={l} href={h} onClick={() => setOpen(false)}>
              {l}
            </a>
          ))}
          <a href="/dashboard">{me ? (me.username ? `@${me.username}` : me.displayName) : 'Account'}</a>
          {isAdmin && <a href="/admin">Admin</a>}
          <a href="/start" style={{ color: 'var(--accent-ink)', fontWeight: 700 }}>
            Start a sprint →
          </a>
        </div>
      )}
      {announcement && (
        <div className="announce" role="status">
          <div className="wrap">{announcement}</div>
        </div>
      )}
    </header>
  );
}

export function Stars({ value, count }: { value: number; count?: number }) {
  if (!count) return null;
  return (
    <span className="stars" title={`${value.toFixed(1)} from ${count} supporter${count === 1 ? '' : 's'}`}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={14} fill={i <= Math.round(value) ? 'currentColor' : 'none'} />
      ))}
      <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 4 }}>
        {value.toFixed(1)} · {count}
      </span>
    </span>
  );
}

export function Disclaimer() {
  return (
    <p className="disclaimer">
      Community support only. No equity, financial return, or profit share is offered. Hackathon MVP — simulated commitment.
      No money will be charged.
    </p>
  );
}

export function Footer() {
  const site = useSite();
  return (
    <footer className="ftr wrap">
      <div>
        <div>
          <b style={{ color: 'var(--ink2)' }}>BidFund</b> · {site('footer_line')}
        </div>
        <div style={{ marginTop: 6 }}>0% platform commission · No equity · No financial returns</div>
        <div style={{ marginTop: 6 }}>© 2026 Projects by Laksh</div>
      </div>
      <div className="ftr-legal">
        <a href="/live">Live Sprints</a>
        <a href="/builders">For Builders</a>
        <a href="/contact">Contact</a>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
        <a href="/refunds">Refunds</a>
        <a href="/shipping">Shipping</a>
      </div>
    </footer>
  );
}
