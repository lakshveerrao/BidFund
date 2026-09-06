import { useEffect, useState, type FormEvent } from 'react';
import { useReducer } from 'spacetimedb/react';
import { reducers } from './module_bindings';
import type { Infer } from 'spacetimedb';
import ProfileRow from './module_bindings/profile_table';
import { ArrowRight, Mail } from 'lucide-react';
import { Footer, Header, Mark, humanError } from './ui';

type Profile = Infer<typeof ProfileRow>;

// /contact — a plain message form. No account needed. Messages go through the
// module's email pump to the team inbox, with reply-to set to the sender.
export default function Contact({ me }: { me: Profile | undefined }) {
  const sendContact = useReducer(reducers.sendContact);
  const [name, setName] = useState(me?.displayName ?? '');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    document.title = 'Contact — BidFund';
    return () => {
      document.title = 'BidFund — Micro-Funding for Hardware Builders';
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendContact({ name, email, message });
      setSent(true);
    } catch (err) {
      setError(humanError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Header me={me} />
      <main className="wrap narrow" style={{ paddingTop: 40, paddingBottom: 80 }}>
        <p className="eyebrow">Contact</p>
        <h1 className="h2">Talk to the BidFund team.</h1>
        <p className="sub">
          Questions about a sprint, listing your build, partnerships, press, or anything that doesn't fit. We read everything and reply by email.
        </p>
        {sent ? (
          <div className="stateblock ok" style={{ marginTop: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Mark size={18} />
              <span className="label strong" style={{ color: 'var(--ok-ink)' }}>
                Message sent
              </span>
            </div>
            <p style={{ margin: '12px 0 16px' }}>Thanks, {name.trim() || 'there'}. It's on its way to the team. We'll reply to {email.trim()}.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a className="btn primary" href="/live">
                See live sprints <ArrowRight size={16} />
              </a>
              <button
                type="button"
                className="btn quiet"
                onClick={() => {
                  setSent(false);
                  setMessage('');
                }}
              >
                Send another
              </button>
            </div>
          </div>
        ) : (
          <form className="fsec" onSubmit={onSubmit} style={{ marginTop: 28 }}>
            <h2>
              <Mail size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              Send a message
            </h2>
            {error && <div className="err">{error}</div>}
            <div className="two">
              <label className="field">
                <span>Your name</span>
                <input value={name} onChange={e => setName(e.target.value)} maxLength={80} autoComplete="name" required />
              </label>
              <label className="field">
                <span>Email (we reply here)</span>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
              </label>
            </div>
            <label className="field">
              <span>Message</span>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={6} maxLength={4000} required placeholder="What's on your mind?" />
            </label>
            <button type="submit" className="btn primary big" disabled={busy || !name.trim() || !email.trim() || message.trim().length < 10}>
              {busy ? 'Sending…' : 'Send message'} <ArrowRight size={16} />
            </button>
            <p className="note">No account needed. We don't share your email with anyone.</p>
          </form>
        )}
        <div className="block">
          <h2>Projects by Laksh</h2>
          <p style={{ color: 'var(--ink2)' }}>Plot No. 149, Road No. 6, Krushi Nagar, Nagole, Hyderabad 500068, Telangana, India</p>
          <p style={{ color: 'var(--ink2)' }}>
            Email for any issues:{' '}
            <a href="mailto:venky24aug@gmail.com" style={{ color: 'var(--accent-ink)' }}>
              venky24aug@gmail.com
            </a>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
