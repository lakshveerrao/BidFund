import { useMemo, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from './module_bindings';
import type { Infer } from 'spacetimedb';
import ProfileRow from './module_bindings/profile_table';
import { ArrowRight, Pencil } from 'lucide-react';
import UsernameField, { useUsernames, USERNAME_RE } from './UsernameField';
import Invite from './Invite';
import { ShareSheet } from './Share';
import { CATEGORIES, CATEGORY_LABEL, Disclaimer, Footer, Header, humanError, rupees, sprintPath } from './ui';

type Profile = Infer<typeof ProfileRow>;
type Offer = { title: string; description: string; limited: boolean; slots: string; min: string };
type Journey = { date: string; text: string };
type Img = { thumb: string; full: string; name: string };
const emptyOffer = (): Offer => ({ title: '', description: '', limited: false, slots: '', min: '' });
const emptyJourney = (): Journey => ({ date: new Date().toISOString().slice(0, 10), text: '' });
const MAX_IMAGES = 4;
const STAGE_CHOICES = [
  ['prototype', 'Prototype', 'A working version exists.'],
  ['pilot', 'Pilot', 'Ready to test with real users.'],
  ['shipping', 'Shipping', 'Already being delivered in small numbers.'],
] as const;
const ALLOC = [
  ['Tooling', 'Fixtures, moulds or fabrication setup'],
  ['Components', 'Boards, sensors, motors and materials'],
  ['Certification', 'Testing, compliance and approvals'],
  ['Buffer', 'Unexpected pilot costs'],
] as const;
const digits = (v: string) => v.replace(/[^\d]/g, '');

function resizeToDataUrl(file: File, maxSide: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name}`));
    };
    img.src = url;
  });
}

// Label + one visible helper sentence + input. Every field uses this.
function F({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {help && <span className="help">{help}</span>}
      {children}
    </label>
  );
}

export default function CreateSprint({ me }: { me: Profile | undefined }) {
  const createSprint = useReducer(reducers.createSprintV2);
  const register = useReducer(reducers.register);
  const claimUsername = useReducer(reducers.claimUsername);
  const [sprints] = useTable(tables.sprint);
  const { identity } = useSpacetimeDB();
  const taken = useUsernames();

  const [gateName, setGateName] = useState('');
  const [gateEmail, setGateEmail] = useState('');
  const [gateHandle, setGateHandle] = useState('');

  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [builderName, setBuilderName] = useState(me?.displayName ?? '');
  const [builderBio, setBuilderBio] = useState(me?.bio ?? '');
  const [builderCity, setBuilderCity] = useState(me?.location ?? '');
  const [category, setCategory] = useState('other');
  const [stage, setStage] = useState('prototype');
  const [description, setDescription] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [goal, setGoal] = useState('');
  const [days, setDays] = useState(2);
  const [fund, setFund] = useState(['40', '40', '10', '10']);
  const [extra, setExtra] = useState<{ label: string; pct: string }[]>([]);
  const [offers, setOffers] = useState<Offer[]>([emptyOffer()]);
  const [journey, setJourney] = useState<Journey[]>([emptyJourney()]);
  const [cover, setCover] = useState<Img | null>(null);
  const [images, setImages] = useState<Img[]>([]);
  const [dragging, setDragging] = useState(false);
  const [dragCover, setDragCover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [created, setCreated] = useState<{ title: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  const fundSum = fund.reduce((a, v) => a + (Number(v) || 0), 0) + extra.reduce((a, x) => a + (Number(x.pct) || 0), 0);
  const usedOffers = useMemo(() => offers.filter(o => o.title.trim()), [offers]);
  const usedJourney = useMemo(() => journey.filter(j => j.text.trim()), [journey]);
  const goalN = Number(goal || 0);

  async function setCoverFile(list: FileList | File[]) {
    setError(null);
    const f = [...list].find(x => x.type.startsWith('image/'));
    if (!f) return;
    try {
      const [thumb, full] = await Promise.all([resizeToDataUrl(f, 320, 0.7), resizeToDataUrl(f, 960, 0.72)]);
      setCover({ thumb, full, name: f.name });
    } catch (e) {
      setError(humanError(e));
    }
  }
  async function addFiles(list: FileList | File[]) {
    setError(null);
    const files = [...list].filter(f => f.type.startsWith('image/')).slice(0, MAX_IMAGES - images.length);
    if (!files.length) return;
    try {
      const made: Img[] = [];
      for (const f of files) {
        const [thumb, full] = await Promise.all([resizeToDataUrl(f, 320, 0.7), resizeToDataUrl(f, 960, 0.72)]);
        made.push({ thumb, full, name: f.name });
      }
      setImages(imgs => [...imgs, ...made].slice(0, MAX_IMAGES));
    } catch (e) {
      setError(humanError(e));
    }
  }

  async function onGate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const u = gateHandle.trim().toLowerCase();
    if (!USERNAME_RE.test(u) || taken.has(u)) {
      setError(taken.has(u) ? `@${u} is taken. Pick one of the suggestions below.` : 'Pick a username with letters, numbers or underscore, up to 24 characters.');
      setBusy(false);
      return;
    }
    try {
      if (!me) await register({ displayName: gateName, email: gateEmail, sourceRef: 'list', sprintId: sprints[0]?.id ?? 1n });
      await claimUsername({ username: u });
      setBuilderName(gateName || me?.displayName || '');
    } catch (err) {
      setError(humanError(err));
    } finally {
      setBusy(false);
    }
  }

  // Errors say what to fix, never "invalid".
  function problems(): string | null {
    if (!title.trim()) return 'Give your build a name so supporters know what they are backing.';
    if (!description.trim()) return 'Tell supporters what already works today.';
    if (!cover) return 'Add a cover photo. It is the main image supporters will see.';
    if (!nextStep.trim()) return 'Tell supporters what this funding will help you do next.';
    if (!goalN) return 'Enter how much you need for this next step, in whole rupees.';
    if (days < 1 || days > 5) return 'Choose a sprint duration from 1 to 5 days.';
    if (fundSum !== 100) return fundSum < 100 ? `Your funding split totals ${fundSum}%. Add another ${100 - fundSum}% so it reaches 100%.` : `Your funding split totals ${fundSum}%. Remove ${fundSum - 100}% so it comes back to 100%.`;
    if (usedJourney.length === 0) return 'Add one milestone that shows the build has progressed.';
    for (const o of usedOffers) if (o.limited && !Number(o.slots)) return `Say how many "${o.title.trim()}" are available, or turn off "limited".`;
    return null;
  }
  function onReview(e: FormEvent) {
    e.preventDefault();
    const p = problems();
    setError(p);
    if (p) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setReviewing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await createSprint({
        title: title.trim(),
        tagline: tagline.trim(),
        description: description.trim(),
        nextStep: nextStep.trim(),
        builderName: builderName.trim() || me?.displayName || 'Builder',
        builderBio: builderBio.trim(),
        builderCity: builderCity.trim(),
        category,
        stage,
        goalAmount: BigInt(goalN),
        // Live immediately; the server stamps the start and the real deadline.
        durationSeconds: BigInt(days) * 86400n,
        opensInSeconds: 0n,
        fundPct: new Uint8Array(fund.map(v => Number(v) || 0)),
        perkTitles: usedOffers.map(o => o.title.trim()),
        perkDescriptions: usedOffers.map(o => o.description.trim()),
        perkSlots: usedOffers.map(o => (o.limited ? Number(digits(o.slots)) : 0)),
        perkMinAmounts: usedOffers.map(o => BigInt(digits(o.min) || '0')),
        journeyDates: usedJourney.map(j => j.date),
        journeyTexts: usedJourney.map(j => j.text.trim()),
        imageThumbs: [cover!, ...images].map(i => i.thumb),
        imageFulls: [cover!, ...images].map(i => i.full),
        extraAllocLabels: extra.filter(x => x.label.trim() && Number(x.pct) > 0).map(x => x.label.trim()),
        extraAllocPcts: new Uint8Array(extra.filter(x => x.label.trim() && Number(x.pct) > 0).map(x => Number(x.pct))),
      });
      setCreated({ title: title.trim() });
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(humanError(err));
      setReviewing(false);
    } finally {
      setBusy(false);
    }
  }

  const mine = created ? [...sprints].filter(s => s.title === created.title).sort((a, b) => Number(b.id - a.id))[0] : undefined;

  const shell = (children: ReactNode) => (
    <>
      <Header me={me} />
      <main className="wrap narrow" style={{ paddingTop: 28, paddingBottom: 60 }}>
        {children}
      </main>
      <Footer />
    </>
  );

  // ---- success -------------------------------------------------------------
  if (created) {
    return shell(
      <>
        <div className="stateblock ok">
          <div className="label strong" style={{ color: 'var(--ok-ink)' }}>
            Sprint is live ✓
          </div>
          <h1 className="h2" style={{ margin: '8px 0 6px' }}>
            {created.title}
          </h1>
          <p style={{ color: 'var(--ink2)', margin: 0 }}>
            Your build is open for support for the next {days} day{days === 1 ? '' : 's'}. Share it now — sprints fund fastest in the first hour.
          </p>
          {mine && (
            <a className="btn secondary" href={sprintPath(mine)} style={{ marginTop: 14 }}>
              View live sprint <ArrowRight size={16} />
            </a>
          )}
        </div>
        <div className="share-block">
          {mine ? (
            <ShareSheet sprint={mine} amount={mine.committedAmount} count={mine.supporterCount} state="live" remaining={days * 86400_000} who="builder" inline heading="Share your sprint" />
          ) : (
            <div className="note">Preparing your share link…</div>
          )}
        </div>
        <div className="fsec" style={{ marginTop: 14 }}>
          <h2>Invite people already on BidFund</h2>
          {mine ? <Invite sprintId={mine.id} myUsername={me?.username ?? ''} myHex={identity?.toHexString()} /> : <div className="note">Still saving…</div>}
        </div>
      </>
    );
  }

  // ---- gate ----------------------------------------------------------------
  if (!me || !me.username) {
    return shell(
      <form className="fsec" onSubmit={onGate}>
        <h2>Who's listing this build?</h2>
        <p style={{ color: 'var(--ink2)', marginTop: 0 }}>No password. Your name and username appear on the listing. Your email stays private.</p>
        {error && <div className="err">{error}</div>}
        {!me && (
          <>
            <F label="Your name" help="Who is building this?">
              <input value={gateName} onChange={e => setGateName(e.target.value)} required maxLength={40} placeholder="e.g. Lakshveer Rao" autoComplete="name" />
            </F>
            <F label="Email" help="We send you the sprint link and each support receipt here.">
              <input type="email" value={gateEmail} onChange={e => setGateEmail(e.target.value)} required placeholder="e.g. you@example.com" autoComplete="email" inputMode="email" />
            </F>
          </>
        )}
        <UsernameField value={gateHandle} onChange={setGateHandle} name={gateName || me?.displayName || ''} taken={taken} />
        <button type="submit" className="btn primary big block" disabled={busy || (!me && (!gateName.trim() || !gateEmail.trim())) || !gateHandle.trim()}>
          Continue to your sprint <ArrowRight size={16} />
        </button>
      </form>
    );
  }

  // ---- review --------------------------------------------------------------
  if (reviewing) {
    const offerText = usedOffers.length ? usedOffers.map(o => `${o.title.trim()}${o.limited && Number(o.slots) ? ` (${Number(o.slots)} available)` : ''}`).join(', ') : 'No condition — community support only';
    return shell(
      <>
        <p className="eyebrow">07 / Review &amp; go live</p>
        <h1 className="h2" style={{ marginBottom: 6 }}>
          Your sprint
        </h1>
        <p className="sub" style={{ marginBottom: 20 }}>
          This is exactly what goes live. It starts the moment you press Start sprint.
        </p>
        {error && <div className="err">{error}</div>}
        <div className="fsec review">
          {cover && (
            <div className="gallery" style={{ maxWidth: 360, marginBottom: 16 }}>
              <img src={cover.full} alt="" />
            </div>
          )}
          <div className="row">
            <span>Project</span>
            <span>{title.trim()}</span>
          </div>
          {tagline.trim() && (
            <div className="row">
              <span>In one line</span>
              <span>{tagline.trim()}</span>
            </div>
          )}
          <div className="row">
            <span>Next step</span>
            <span>{nextStep.trim()}</span>
          </div>
          <div className="row">
            <span>Goal</span>
            <span>{rupees(BigInt(goalN))}</span>
          </div>
          <div className="row">
            <span>Runs for</span>
            <span>
              {days} day{days === 1 ? '' : 's'}, starting now
            </span>
          </div>
          <div className="row">
            <span>Where the money goes</span>
            <span>{[...ALLOC.map((a, i) => `${a[0]} ${fund[i] || 0}%`), ...extra.filter(x => x.label.trim() && Number(x.pct) > 0).map(x => `${x.label.trim()} ${x.pct}%`)].join(' · ')}</span>
          </div>
          <div className="row">
            <span>What you can offer</span>
            <span>{offerText}</span>
          </div>
          <div className="row">
            <span>Milestones</span>
            <span>{usedJourney.length}</span>
          </div>
          <div className="row">
            <span>BidFund platform commission</span>
            <span style={{ color: 'var(--accent-ink)' }}>₹0</span>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <button type="button" className="btn primary big" disabled={busy} onClick={publish}>
              {busy ? 'Starting…' : 'Start sprint'} <ArrowRight size={16} />
            </button>
            <button type="button" className="btn secondary big" disabled={busy} onClick={() => setReviewing(false)}>
              <Pencil size={15} /> Edit
            </button>
          </div>
        </div>
        <Disclaimer />
      </>
    );
  }

  // ---- form ----------------------------------------------------------------
  const setOffer = (i: number, patch: Partial<Offer>) => setOffers(os => os.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  return shell(
    <form onSubmit={onReview}>
      <p className="eyebrow">Start a sprint</p>
      <h1 className="h2" style={{ marginBottom: 6 }}>
        A few obvious questions, then you're live.
      </h1>
      <p className="sub" style={{ marginBottom: 22 }}>
        Your sprint starts the moment you publish. Most builders finish this in under three minutes.
      </p>
      {error && <div className="err">{error}</div>}

      <section className="fsec">
        <h2>01 / The build</h2>
        <F label="Project name" help="What do you call the hardware you've built?">
          <input value={title} onChange={e => setTitle(e.target.value)} required maxLength={80} placeholder="e.g. AirRemote" />
        </F>
        <F label="One-line description" help="Explain what it does in one simple sentence.">
          <input value={tagline} onChange={e => setTagline(e.target.value)} maxLength={110} placeholder="e.g. A motion controller for games, music and workouts" />
        </F>
        <F label="Category" help="Pick the closest match. Choose Other if nothing fits.">
          <select value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </F>
        <div className="field">
          <span>Where is the build today?</span>
          <span className="help">BidFund is for hardware that already exists. Choose the stage that best describes it.</span>
          <div className="stages" role="radiogroup" aria-label="Stage">
            {STAGE_CHOICES.map(([k, l, d]) => (
              <button key={k} type="button" role="radio" aria-checked={stage === k} className={stage === k ? 'on' : ''} onClick={() => setStage(k)}>
                <b>{l}</b>
                <span>{d}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="two">
          <F label="Your name" help="Who is building this?">
            <input value={builderName} onChange={e => setBuilderName(e.target.value)} required maxLength={40} placeholder="e.g. Lakshveer Rao" />
          </F>
          <F label="City" help="Where are you building this?">
            <input value={builderCity} onChange={e => setBuilderCity(e.target.value)} maxLength={80} placeholder="e.g. Hyderabad" />
          </F>
        </div>
        <F label="What have you built?" help="Tell supporters what already works today.">
          <textarea value={description} onChange={e => setDescription(e.target.value)} required rows={3} maxLength={600} placeholder="e.g. We have a working ESP32-based controller tested with games and music." />
        </F>
        <F label="About you — optional" help="One or two lines. Who you are, what you've built before.">
          <textarea value={builderBio} onChange={e => setBuilderBio(e.target.value)} rows={2} maxLength={300} placeholder="e.g. Hardware builder, three shipped boards, currently at a Hyderabad makerspace." />
        </F>
      </section>

      <section className="fsec">
        <h2>02 / Show the build</h2>
        <p className="help" style={{ margin: '-6px 0 12px', color: 'var(--muted)', fontSize: 13 }}>
          Real prototype photos build trust. Show what actually exists. Images will be cropped to fit.
        </p>
        <div className="field">
          <span>Cover photo</span>
          <span className="help">This is the main image supporters will see.</span>
        </div>
        <div
          className={`dropzone cover${dragCover ? ' over' : ''}`}
          onDragOver={e => {
            e.preventDefault();
            setDragCover(true);
          }}
          onDragLeave={() => setDragCover(false)}
          onDrop={(e: DragEvent) => {
            e.preventDefault();
            setDragCover(false);
            void setCoverFile(e.dataTransfer.files);
          }}
          onClick={() => coverInput.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Cover photo"
        >
          {cover ? (
            <>
              <img src={cover.full} alt="Cover" />
              <span className="cap">Cover · tap to replace</span>
            </>
          ) : (
            <span style={{ padding: 24, color: 'var(--ink2)' }}>Drop the cover photo here or tap to choose one</span>
          )}
          <input
            ref={coverInput}
            type="file"
            accept="image/*"
            hidden
            onChange={e => {
              if (e.target.files) void setCoverFile(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        <div className="field" style={{ marginTop: 16 }}>
          <span>Gallery — optional</span>
          <span className="help">Add photos of the build, testing or real-world use. Up to {MAX_IMAGES}.</span>
        </div>
        <div
          className={`dropzone${dragging ? ' over' : ''}`}
          onDragOver={e => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e: DragEvent) => {
            e.preventDefault();
            setDragging(false);
            void addFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInput.current?.click()}
          role="button"
          tabIndex={0}
        >
          {images.length === 0 ? 'Add another photo if you want to show testing or real-world use' : `${images.length} of ${MAX_IMAGES} added — drop or tap to add more`}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={e => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        {images.length > 0 && (
          <div className="previews">
            {images.map((im, i) => (
              <div key={i}>
                <img src={im.full} alt={im.name} />
                <button type="button" aria-label="Remove" onClick={() => setImages(imgs => imgs.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="fsec">
        <h2>03 / The next step</h2>
        <F label="What will this funding help you do next?" help="Name one concrete thing this money will make possible.">
          <textarea value={nextStep} onChange={e => setNextStep(e.target.value)} required rows={2} maxLength={140} placeholder="e.g. Build and test 20 pilot units with real users" />
        </F>
        <F label="How much do you need?" help="Enter only what you need for this next step — not your full future roadmap.">
          <input className="mono" value={goal} onChange={e => setGoal(digits(e.target.value))} inputMode="numeric" pattern="[0-9]*" required placeholder="e.g. 25000" />
        </F>
        <div className="note" style={{ marginTop: -6, marginBottom: 14 }}>
          Small, specific asks work best on BidFund.
        </div>
        <div className="field">
          <span>How long should this sprint run?</span>
          <span className="help">Choose how many days people can support this build. Shorter sprints create more urgency.</span>
          <div className="days" role="radiogroup" aria-label="Sprint duration">
            {[1, 2, 3, 4, 5].map(d => (
              <button key={d} type="button" role="radio" aria-checked={days === d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>
                {d}
                <small>{d === 1 ? 'day' : 'days'}</small>
              </button>
            ))}
          </div>
          <span className="help">2–3 days is a good starting point for a focused community push. The sprint starts as soon as you publish.</span>
        </div>
      </section>

      <section className="fsec">
        <h2>04 / Where will the money go?</h2>
        <p className="help" style={{ margin: '-6px 0 12px', color: 'var(--muted)', fontSize: 13 }}>
          Give supporters a rough split. The total must equal 100%.
        </p>
        <div className="four">
          {ALLOC.map(([l, h], i) => (
            <F label={`${l} %`} help={h} key={l}>
              <input className="mono" value={fund[i]} onChange={e => setFund(f => f.map((v, j) => (j === i ? digits(e.target.value).slice(0, 3) : v)))} inputMode="numeric" pattern="[0-9]*" />
            </F>
          ))}
        </div>
        {extra.map((x, i) => (
          <div className="rowform j" key={i}>
            <input value={x.pct} onChange={e => setExtra(xs => xs.map((y, j) => (j === i ? { ...y, pct: digits(e.target.value).slice(0, 3) } : y)))} inputMode="numeric" placeholder="%" aria-label="Percent" />
            <input value={x.label} onChange={e => setExtra(xs => xs.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} placeholder="e.g. Field test with 10 users" aria-label="What for" maxLength={40} />
          </div>
        ))}
        <button type="button" className="btn quiet sm" onClick={() => setExtra(xs => [...xs, { label: '', pct: '' }])}>
          + Add another line
        </button>
        <div className={`totalline ${fundSum === 100 ? 'ok' : 'bad'}`} style={{ marginTop: 10 }}>
          {fundSum === 100 ? 'Total / 100% ✓' : fundSum < 100 ? `Total / ${fundSum}% — add ${100 - fundSum}% more. Total must be 100%.` : `Total / ${fundSum}% — remove ${fundSum - 100}%. Total must be 100%.`}
        </div>
      </section>

      <section className="fsec">
        <h2>05 / What can you offer supporters? — optional</h2>
        <p className="help" style={{ margin: '-6px 0 12px', color: 'var(--muted)', fontSize: 13 }}>
          You don't have to offer anything. If you want, mention a simple thank-you or benefit. Leave this blank if people are simply supporting the build.
        </p>
        {offers.map((o, i) => (
          <div className="offer" key={i}>
            <F label={i === 0 ? 'What can you offer?' : 'Option name'} help={i === 0 ? undefined : 'A short name supporters will pick.'}>
              <input value={o.title} onChange={e => setOffer(i, { title: e.target.value })} maxLength={60} placeholder={['e.g. A pilot unit if we successfully build the batch', 'e.g. 20% off the final product', 'e.g. Founding Supporter credit', 'e.g. A private demo session'][i % 4]} />
            </F>
            {o.title.trim() && (
              <>
                <F label="What does the supporter get?" help="One sentence. Be specific about what and when.">
                  <input value={o.description} onChange={e => setOffer(i, { description: e.target.value })} maxLength={140} placeholder="e.g. One pilot unit if the first batch is successfully produced" />
                </F>
                {!o.limited ? (
                  <button type="button" className="btn quiet sm" onClick={() => setOffer(i, { limited: true })}>
                    + Make this limited
                  </button>
                ) : (
                  <div className="two">
                    <F label="How many are available?" help="First confirmed supporters get them.">
                      <input className="mono" value={o.slots} onChange={e => setOffer(i, { slots: digits(e.target.value).slice(0, 4) })} inputMode="numeric" placeholder="e.g. 5" />
                    </F>
                    <F label="Minimum support — optional" help="Only for supporters choosing this.">
                      <input className="mono" value={o.min} onChange={e => setOffer(i, { min: digits(e.target.value) })} inputMode="numeric" placeholder="e.g. 2500" />
                    </F>
                  </div>
                )}
                {offers.length > 1 && (
                  <button type="button" className="linkbtn" style={{ margin: '6px 0 0' }} onClick={() => setOffers(os => os.filter((_, j) => j !== i))}>
                    Remove this option
                  </button>
                )}
              </>
            )}
          </div>
        ))}
        {offers[offers.length - 1]?.title.trim() && (
          <button type="button" className="btn quiet sm" onClick={() => setOffers(os => [...os, emptyOffer()])}>
            + Add something else I can offer
          </button>
        )}
        <div className="note" style={{ marginTop: 10 }}>
          "Just support this build" is always available to supporters, whatever you add here.
        </div>
      </section>

      <section className="fsec">
        <h2>06 / Build journey</h2>
        <p className="help" style={{ margin: '-6px 0 12px', color: 'var(--muted)', fontSize: 13 }}>
          Add a few moments that show how this build became real. One to three is plenty.
        </p>
        {journey.map((j, i) => (
          <div className="rowform j" key={i}>
            <input type="date" value={j.date} onChange={e => setJourney(js => js.map((y, k) => (k === i ? { ...y, date: e.target.value } : y)))} aria-label="Date" />
            <input value={j.text} onChange={e => setJourney(js => js.map((y, k) => (k === i ? { ...y, text: e.target.value } : y)))} placeholder="e.g. First working prototype tested" aria-label="What happened" maxLength={140} />
          </div>
        ))}
        {usedJourney.length === 0 && <div className="note" style={{ marginBottom: 8 }}>Add one milestone that proves the build has progressed.</div>}
        <button type="button" className="btn quiet sm" onClick={() => setJourney(js => [...js, emptyJourney()])}>
          + Add milestone
        </button>
      </section>

      <div className="formbar">
        <button type="submit" className="btn primary big block">
          Review &amp; go live <ArrowRight size={16} />
        </button>
        <div className="note" style={{ textAlign: 'center', marginTop: 6 }}>
          Nothing goes live until you confirm on the next screen. 0% platform commission.
        </div>
      </div>
    </form>
  );
}
