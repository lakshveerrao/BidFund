import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducer, useTable } from 'spacetimedb/react';
import { reducers, tables } from './module_bindings';
import type { Infer } from 'spacetimedb';
import SessionRow from './module_bindings/demo_payment_session_table';
import ProfileRow from './module_bindings/profile_table';
import { ArrowRight, Check, Copy, Info, Share2, X } from 'lucide-react';
import { Footer, Header, Mark, clock, humanError, rupees, sprintPath, toMs } from './ui';

export type Session = Infer<typeof SessionRow>;
type Profile = Infer<typeof ProfileRow>;

export const isPhone = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;

// Derived, time-aware status for a session row.
export function sessionState(s: Session | undefined, now: number): 'loading' | 'pending' | 'committed' | 'perk_taken' | 'failed' | 'cancelled' | 'expired' {
  if (!s) return 'loading';
  if (s.status === 'committed') return 'committed';
  if (s.status === 'failed') return s.outcome === 'perk_taken' ? 'perk_taken' : 'failed';
  if (s.status === 'cancelled') return 'cancelled';
  if (s.status === 'expired' || toMs(s.expiresAt) <= now) return 'expired';
  return 'pending';
}

export function useSession(code: string) {
  const [rows] = useTable(tables.demoPaymentSession.where(r => r.code.eq(code)));
  return rows[0];
}

export function DemoBadge() {
  return (
    <span className="pill info" title="Simulation only">
      <Info size={12} /> Demo
    </span>
  );
}

export function Disclosure({ past }: { past?: boolean }) {
  return (
    <div className="demo-note" role="note">
      <Info size={14} /> {past ? 'No real money was charged.' : 'Demo UPI payment. This simulates the payment experience for the hackathon. No real money will be charged.'}
    </div>
  );
}

export function Breakdown({ s, title }: { s: Session; title: string }) {
  return (
    <div className="pay-rows">
      <div className="row">
        <span>Supporting</span>
        <span>{title}</span>
      </div>
      {s.conditionLabel && (
        <div className="row">
          <span>Builder condition</span>
          <span style={{ textAlign: 'right' }}>{s.conditionLabel}</span>
        </div>
      )}
      <div className="row">
        <span>Support amount</span>
        <span className="mono">{rupees(s.amount)}</span>
      </div>
      <div className="row">
        <span>BidFund commission</span>
        <span className="mono">₹0</span>
      </div>
      <div className="row total">
        <span>Total commitment</span>
        <span className="mono">{rupees(s.amount)}</span>
      </div>
    </div>
  );
}

// QR image for the session URL. Loaded lazily so the sprint page stays light.
export function SessionQr({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    import('qrcode').then(q => q.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 264, color: { dark: '#1b1f1c', light: '#ffffff' } })).then(d => alive && setSrc(d)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);
  return (
    <div className="qr" role="img" aria-label={`QR code that opens ${url}`}>
      {src ? <img src={src} alt="" width={264} height={264} /> : <div className="skel" style={{ width: 264, height: 264 }} />}
    </div>
  );
}

// The approval experience: on the scanning phone (/demo-pay/:code) and inline
// on the same device when support starts on a phone.
export function Approval({ code, sprintTitle, embedded, onDone }: { code: string; sprintTitle: string; embedded?: boolean; onDone?: () => void }) {
  const s = useSession(code);
  const approve = useReducer(reducers.approveDemoPayment);
  const fail = useReducer(reducers.failDemoPayment);
  const cancel = useReducer(reducers.cancelDemoPayment);
  const record = useReducer(reducers.recordEvent);
  const [now, setNow] = useState(() => Date.now());
  const [step, setStep] = useState(0); // 0 idle, 1..3 processing steps, 4 waiting for server
  const [err, setErr] = useState<string | null>(null);
  const opened = useRef(false);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (s && !opened.current && !embedded) {
      opened.current = true;
      record({ kind: 'payment_session_opened', sprintId: s.sprintId, sessionCode: code }).catch(() => {});
    }
  }, [s, code, embedded, record]);
  const st = sessionState(s, now);

  async function simulate() {
    if (!s) return;
    setErr(null);
    setStep(1);
    await new Promise(r => setTimeout(r, 380));
    setStep(2);
    await new Promise(r => setTimeout(r, 380));
    setStep(3);
    await new Promise(r => setTimeout(r, 380));
    setStep(4);
    try {
      await approve({ code });
    } catch (e) {
      setErr(humanError(e));
      setStep(0);
    }
  }

  if (!s) return <div className="skel" style={{ height: 320 }} />;
  const left = toMs(s.expiresAt) - now;

  if (st === 'committed') {
    return (
      <div className="pay-card ok">
        <div className="pay-head">
          <span className="label strong" style={{ color: 'var(--ok-ink)' }}>
            <Check size={14} /> Payment simulated
          </span>
          <DemoBadge />
        </div>
        <div className="label strong">Support confirmed</div>
        <div className="pay-amt">{rupees(s.amount)} committed</div>
        <p style={{ color: 'var(--ink2)', margin: '6px 0 14px' }}>
          Your support for <b>{sprintTitle}</b> is on the sprint. {embedded ? '' : 'Head back to your original screen to see the celebration.'}
        </p>
        <div className="row">
          <span>Reference</span>
          <span className="mono">{s.code}</span>
        </div>
        <Disclosure past />
        {onDone && (
          <button type="button" className="btn primary block" style={{ marginTop: 12 }} onClick={onDone}>
            Continue <ArrowRight size={16} />
          </button>
        )}
      </div>
    );
  }
  if (st === 'perk_taken') {
    return (
      <div className="pay-card">
        <div className="pay-head">
          <span className="label strong" style={{ color: 'var(--urg)' }}>
            Support option just claimed
          </span>
          <DemoBadge />
        </div>
        <p style={{ margin: '4px 0 12px' }}>{s.errorText}</p>
        <p style={{ color: 'var(--ink2)', margin: 0 }}>Nothing was committed and your amount of {rupees(s.amount)} is kept. {embedded ? 'Choose another option or support without one.' : 'Go back to your original screen to choose another option or support without one.'}</p>
        {onDone && (
          <button type="button" className="btn primary block" style={{ marginTop: 14 }} onClick={onDone}>
            Choose another option <ArrowRight size={16} />
          </button>
        )}
      </div>
    );
  }
  if (st === 'failed' || st === 'cancelled' || st === 'expired') {
    const title = st === 'expired' ? 'Payment session expired' : st === 'cancelled' ? 'Payment cancelled' : 'Payment not completed';
    return (
      <div className="pay-card">
        <div className="pay-head">
          <span className="label strong" style={{ color: 'var(--urg)' }}>
            {title}
          </span>
          <DemoBadge />
        </div>
        <p style={{ margin: '4px 0 6px' }}>No support was committed. No project total changed. No condition slot was used.</p>
        {s.errorText && st === 'failed' && <p style={{ color: 'var(--ink2)', margin: '0 0 8px' }}>{s.errorText}</p>}
        {onDone ? (
          <button type="button" className="btn primary block" style={{ marginTop: 12 }} onClick={onDone}>
            {st === 'expired' ? 'Create new payment session' : 'Try again'} <ArrowRight size={16} />
          </button>
        ) : (
          <p className="note">Back on your original screen you can start a new payment session.</p>
        )}
      </div>
    );
  }

  // pending
  return (
    <div className="pay-card">
      <div className="pay-head">
        <span className="label strong">Payment request</span>
        <DemoBadge />
      </div>
      <div className="pay-amt big">{rupees(s.amount)}</div>
      <div style={{ color: 'var(--ink2)', marginBottom: 12 }}>
        Supporting <b style={{ color: 'var(--ink)' }}>{sprintTitle}</b>
        {s.conditionLabel ? ` · ${s.conditionLabel}` : ''}
      </div>
      <Breakdown s={s} title={sprintTitle} />
      <div className="row" style={{ borderBottom: 0 }}>
        <span>Payment method</span>
        <span className="pill">UPI</span>
      </div>
      <div className="row" style={{ borderBottom: 0, paddingTop: 0 }}>
        <span>Session expires</span>
        <span className={`mono${left < 60_000 ? ' urgtext' : ''}`}>{clock(Math.max(0, left))}</span>
      </div>
      {err && <div className="err">{err}</div>}
      {step === 0 ? (
        <>
          <button type="button" className="btn primary big block" style={{ marginTop: 8 }} onClick={simulate}>
            Simulate {rupees(s.amount)} payment
          </button>
          <button type="button" className="btn quiet block" style={{ marginTop: 8 }} onClick={() => cancel({ code }).catch(() => {})}>
            Cancel
          </button>
          <button type="button" className="linkbtn" onClick={() => fail({ code }).catch(() => {})}>
            Simulate a failed payment
          </button>
        </>
      ) : (
        <div className="steps" aria-live="polite">
          <div className="label strong" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="spin" /> Processing…
          </div>
          <ol>
            {['Initiating demo payment', 'Verifying support', 'Confirming commitment'].map((t, i) => (
              <li key={t} className={step > i + 1 ? 'done' : step === i + 1 ? 'now' : ''}>
                {step > i + 1 ? <Check size={14} /> : <span className="dot" />} {t}
              </li>
            ))}
          </ol>
        </div>
      )}
      <Disclosure />
      <p className="note" style={{ marginTop: 6 }}>
        In a real payment flow you would scan with a UPI app. This demo QR opens BidFund's simulation instead. No UPI PIN, bank or card details are ever
        asked for.
      </p>
    </div>
  );
}

// /demo-pay/:code — the page the QR opens.
export default function DemoPayPage({ code, me }: { code: string; me: Profile | undefined }) {
  const s = useSession(code);
  const [sprints] = useTable(tables.sprint);
  const sprint = useMemo(() => (s ? sprints.find(x => x.id === s.sprintId) : undefined), [sprints, s]);
  useEffect(() => {
    document.title = 'BidFund Demo UPI';
    return () => {
      document.title = 'BidFund — Micro-Funding for Hardware Builders';
    };
  }, []);
  return (
    <>
      <Header me={me} />
      <main className="wrap" style={{ maxWidth: 520, paddingTop: 28, paddingBottom: 60 }}>
        <div className="strip" style={{ alignItems: 'center' }}>
          <Mark size={18} />
          <span className="label strong">BidFund Demo UPI</span>
        </div>
        {!s && sprints.length > 0 ? (
          <div className="pay-card">
            <div className="label strong" style={{ color: 'var(--urg)' }}>
              Session not found
            </div>
            <p>That payment session does not exist or has been removed.</p>
            <a className="btn secondary" href="/live">
              Back to live sprints
            </a>
          </div>
        ) : (
          <Approval code={code} sprintTitle={sprint?.title ?? 'this build'} />
        )}
        {sprint && (
          <p className="note" style={{ marginTop: 14 }}>
            <a href={sprintPath(sprint)} style={{ color: 'var(--accent-ink)' }}>
              Open the sprint page
            </a>
          </p>
        )}
      </main>
      <Footer />
    </>
  );
}

// Share card after a committed session. Text comes from live state only.
export function ShareMoment({ s, sprintTitle, sprintUrl, pct, gap, funded, supporters, builder }: { s: Session; sprintTitle: string; sprintUrl: string; pct: number; gap: bigint; funded: boolean; supporters: number; builder?: boolean }) {
  const record = useReducer(reducers.recordEvent);
  const [copied, setCopied] = useState(false);
  const lines = builder
    ? funded
      ? [`Our pilot is funded.`, sprintTitle, `${rupees(s.committedAfter)} goal reached`, `${supporters} supporters`, `0% BidFund commission`]
      : [`Someone just moved our pilot forward.`, sprintTitle, `+${rupees(s.amount)}`, `${pct.toFixed(0)}% funded`, `${supporters} supporters`]
    : funded
      ? [`I just helped fund the pilot for ${sprintTitle}.`, `${rupees(s.amount)} committed`, `Goal reached`, `0% BidFund commission`]
      : [`I just backed ${sprintTitle}.`, `${rupees(s.amount)} committed`, `${pct.toFixed(0)}% funded`, `${rupees(gap)} to pilot`, `0% BidFund commission`];
  const text = `${lines.join(' · ')}\n${sprintUrl}`;
  const log = () => record({ kind: 'share_clicked', sprintId: s.sprintId, sessionCode: s.code }).catch(() => {});
  const enc = encodeURIComponent(text);
  return (
    <div className="share-card">
      <div className="label strong">Share the moment</div>
      <div className="share-lines">
        {lines.map((l, i) => (
          <div key={i} className={i === 0 ? 'h' : ''}>
            {l}
          </div>
        ))}
      </div>
      <div className="share-actions">
        <a className="btn secondary sm" href={`https://wa.me/?text=${enc}`} target="_blank" rel="noreferrer" onClick={log}>
          WhatsApp
        </a>
        <button
          type="button"
          className="btn secondary sm"
          onClick={() => {
            log();
            navigator.clipboard?.writeText(text).then(() => setCopied(true));
          }}
        >
          <Copy size={14} /> {copied ? 'Copied' : 'Copy link'}
        </button>
        <a className="btn secondary sm" href={`https://twitter.com/intent/tweet?text=${enc}`} target="_blank" rel="noreferrer" onClick={log}>
          X
        </a>
        <a className="btn secondary sm" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(sprintUrl)}`} target="_blank" rel="noreferrer" onClick={log}>
          LinkedIn
        </a>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button
            type="button"
            className="btn primary sm"
            onClick={() => {
              log();
              navigator.share({ title: sprintTitle, text, url: sprintUrl }).catch(() => {});
            }}
          >
            <Share2 size={14} /> Share
          </button>
        )}
      </div>
    </div>
  );
}

export function CloseX({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="ibtn" aria-label="Close" onClick={onClick} style={{ width: 34, height: 34 }}>
      <X size={16} />
    </button>
  );
}
