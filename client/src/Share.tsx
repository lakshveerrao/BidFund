import { useEffect, useRef, useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { reducers } from './module_bindings';
import type { Infer } from 'spacetimedb';
import SprintRow from './module_bindings/sprint_table';
import { Copy, Download, Share2, X } from 'lucide-react';
import { rupees, short, slugify } from './ui';

type Sprint = Infer<typeof SprintRow>;
export type SprintState = 'live' | 'upcoming' | 'closed';

// Public, permanent sprint URL. /s/<id-slug> is the short form; the router
// treats it exactly like /sprint/<id-slug>. `ref` tags the source on join.
export const shortPath = (s: Sprint) => `/s/${s.id}-${slugify(s.title) || 'sprint'}`;
export const publicUrl = (s: Sprint, ref: string) => `${window.location.origin}${shortPath(s)}?ref=${ref}`;
export const qrCta = (state: SprintState) => (state === 'live' ? 'Scan to support this build' : state === 'upcoming' ? 'Scan to follow this build' : 'Scan to see this build');

// Real, lazily generated QR for a public sprint URL. SVG so it prints clean.
export function SprintQr({ url, title, size = 220 }: { url: string; title: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    import('qrcode')
      .then(q => q.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#1b1f1c', light: '#ffffff' } }))
      .then(s => alive && setSvg(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);
  return (
    <div className="qr pub" role="img" aria-label={`QR code linking to ${title} live sprint`} style={{ width: size + 24 }}>
      {svg ? <div style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="skel" style={{ width: size, height: size }} />}
    </div>
  );
}

async function downloadQr(url: string, filename: string) {
  const q = await import('qrcode');
  const data = await q.toDataURL(url, { errorCorrectionLevel: 'M', margin: 4, width: 1024, color: { dark: '#1b1f1c', light: '#ffffff' } });
  const a = document.createElement('a');
  a.href = data;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Human WhatsApp copy from real state. Builder voice or supporter voice.
export function shareText(s: Sprint, amount: bigint, count: number, state: SprintState, who: 'builder' | 'supporter', myAmount?: bigint): string {
  const gap = s.goalAmount > amount ? s.goalAmount - amount : 0n;
  const funded = amount >= s.goalAmount;
  const step = s.nextStep ? s.nextStep.replace(/\.$/, '') : 'the next step';
  if (who === 'builder') {
    if (funded) return `Our pilot is funded. ${s.title} reached its ${rupees(s.goalAmount)} goal with ${count} supporters on BidFund. Thank you.`;
    if (state === 'closed') return `${s.title} ran a live funding sprint on BidFund: ${rupees(amount)} backed by ${count} supporters. Here's the build.`;
    if (state === 'upcoming') return `I've built ${s.title} and I'm about to raise ${rupees(s.goalAmount)} for ${step}. The BidFund sprint opens soon. Follow it here.`;
    if (amount === 0n) return `I've built ${s.title} and I'm raising ${rupees(s.goalAmount)} for ${step}.\n\nThe BidFund sprint is live now. If you'd like to be one of the first people to support it:`;
    return `I've built ${s.title} and I'm raising ${rupees(s.goalAmount)} for ${step}.\n\n${rupees(amount)} is already backed. ${rupees(gap)} to go.\n\nIf you'd like to help move it forward:`;
  }
  if (myAmount) {
    if (funded) return `I helped fund the pilot for ${s.title} on BidFund. ${rupees(s.goalAmount)} goal reached. See the build:`;
    return `I just backed ${s.title} with ${rupees(myAmount)} on BidFund. ${rupees(amount)} backed, ${rupees(gap)} to pilot. If you'd like to help:`;
  }
  // Visitor who hasn't backed yet: neutral, honest.
  if (funded) return `${s.title} just got its pilot funded on BidFund: ${rupees(s.goalAmount)} from ${count} supporters. See the build:`;
  if (state !== 'live') return `${s.title} on BidFund: a working prototype raising ${rupees(s.goalAmount)} for ${step}. Take a look:`;
  return `${s.title} is a working prototype raising ${rupees(s.goalAmount)} for ${step} on BidFund. ${rupees(amount)} backed so far, ${rupees(gap)} to pilot. If you'd like to help:`;
}

export function ShareSheet({
  sprint,
  amount,
  count,
  state,
  remaining,
  who,
  myAmount,
  inline,
  onClose,
  heading,
}: {
  sprint: Sprint;
  amount: bigint;
  count: number;
  state: SprintState;
  remaining: number;
  who: 'builder' | 'supporter';
  myAmount?: bigint;
  inline?: boolean;
  onClose?: () => void;
  heading?: string;
}) {
  const record = useReducer(reducers.recordEvent);
  const [copied, setCopied] = useState(false);
  const first = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
  const log = () => record({ kind: 'share_clicked', sprintId: sprint.id, sessionCode: who }).catch(() => {});
  const gap = sprint.goalAmount > amount ? sprint.goalAmount - amount : 0n;
  const funded = amount >= sprint.goalAmount;
  const pct = Math.min(100, Number((amount * 1000n) / sprint.goalAmount) / 10);
  const url = (ref: string) => publicUrl(sprint, `${ref}-${who}`);
  const qrUrl = url('qr');
  const text = shareText(sprint, amount, count, state, who, myAmount);
  const wa = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url('whatsapp')}\n\nBidFund takes 0% platform commission.`)}`;
  const canNative = typeof navigator !== 'undefined' && 'share' in navigator;
  useEffect(() => {
    if (!inline) first.current?.focus();
  }, [inline]);
  useEffect(() => {
    if (inline || !onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inline, onClose]);

  const body = (
    <div className="share">
      <div className="share-head">
        <div>
          <div className="label strong">{heading ?? 'Share this sprint'}</div>
          <div className="share-title">
            {sprint.mediaUrl && <img src={sprint.mediaUrl} alt="" />}
            <div>
              <b>{sprint.title}</b>
              <div className="note" style={{ marginTop: 0 }}>
                {funded ? `Pilot funded ✓ · ${count} supporters` : `${rupees(amount)} of ${rupees(sprint.goalAmount)} · ${funded ? '' : `${rupees(gap)} to pilot`}`}
                {state === 'live' ? ` · ${short(remaining)}` : state === 'upcoming' ? ' · upcoming' : ' · closed'}
              </div>
            </div>
          </div>
        </div>
        {onClose && !inline && (
          <button type="button" className="ibtn" aria-label="Close" onClick={onClose} style={{ width: 36, height: 36 }}>
            <X size={16} />
          </button>
        )}
      </div>
      {who === 'supporter' && myAmount ? (
        <div className="share-lines">
          <div className="h">I just backed {sprint.title}</div>
          <div>{rupees(myAmount)} committed</div>
          <div>{pct.toFixed(0)}% funded</div>
          {!funded && <div>{rupees(gap)} to pilot</div>}
        </div>
      ) : null}
      <div className="share-qr">
        <SprintQr url={qrUrl} title={sprint.title} />
        <div className="label strong" style={{ marginTop: 8 }}>
          {qrCta(state)}
        </div>
        <div className="share-url mono">{`${window.location.host}${shortPath(sprint)}`}</div>
      </div>
      <div className="share-actions big">
        <a ref={first as never} className="btn primary" href={wa} target="_blank" rel="noreferrer" onClick={log}>
          WhatsApp
        </a>
        {canNative && (
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              log();
              navigator.share({ title: sprint.title, text, url: url('native-share') }).catch(() => {});
            }}
          >
            <Share2 size={15} /> Share
          </button>
        )}
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            log();
            navigator.clipboard?.writeText(url('copy-link')).then(() => setCopied(true));
          }}
        >
          <Copy size={15} /> {copied ? 'Copied' : 'Copy link'}
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            log();
            downloadQr(qrUrl, `bidfund-${slugify(sprint.title) || 'sprint'}-qr.png`).catch(() => {});
          }}
        >
          <Download size={15} /> Download QR
        </button>
      </div>
      <div className="share-actions" style={{ marginTop: 8 }}>
        <a className="btn quiet sm" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${text}\n${url('x')}`)}`} target="_blank" rel="noreferrer" onClick={log}>
          X
        </a>
        <a className="btn quiet sm" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url('linkedin'))}`} target="_blank" rel="noreferrer" onClick={log}>
          LinkedIn
        </a>
      </div>
      <div className="note" style={{ marginTop: 10 }}>
        0% BidFund platform commission. The QR and link stay valid after the sprint closes.
      </div>
    </div>
  );
  if (inline) return body;
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-label="Share this sprint" onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className="sheet" style={{ maxHeight: '92vh', overflow: 'auto' }}>
        {body}
      </div>
    </div>
  );
}

// Builder prompt that adapts to the sprint state.
export function builderPrompt(amount: bigint, goal: bigint, count: number, state: SprintState): { h: string; sub?: string; cta: string } {
  const gap = goal > amount ? goal - amount : 0n;
  if (amount >= goal) return { h: 'Pilot funded ✓', sub: `${count} supporters`, cta: 'Share the win' };
  if (state === 'closed') return { h: 'Sprint closed', sub: `${rupees(amount)} backed`, cta: 'Share the result' };
  if (state === 'upcoming') return { h: 'Line up your first supporters', cta: 'Share sprint' };
  if (amount === 0n) return { h: 'Get your first supporter', cta: 'Share sprint' };
  if (Number((amount * 100n) / goal) >= 75) return { h: `Only ${rupees(gap)} to go`, cta: 'Help close the gap' };
  return { h: 'Keep the momentum going', sub: `${rupees(gap)} to pilot`, cta: 'Share sprint' };
}
