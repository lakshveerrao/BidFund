import { useEffect, useMemo, useState } from 'react';
import type { Infer } from 'spacetimedb';
import ProfileRow from './module_bindings/profile_table';
import { ArrowRight, Cpu, Crosshair, Percent, ShieldOff } from 'lucide-react';
import { Card, DEFAULT_FILTERS, DiscoveryTabs, FilterButton, HappeningNow, Metrics, applyDisc, applyFilters, useSprintSignals, type Disc, type Filters } from './Cards';
import { Footer, Header, MIN, rupees, short, sprintPath, toMs, useSite } from './ui';

type Profile = Infer<typeof ProfileRow>;

export default function Home({ now, me, isAdmin }: { now: number; me: Profile | undefined; isAdmin?: boolean }) {
  const sig = useSprintSignals(now);
  const site = useSite();
  const [disc, setDisc] = useState<Disc>('live');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  useEffect(() => {
    document.title = 'BidFund — Micro-Funding for Hardware Builders';
  }, []);

  // Featured sprint = the most active real live sprint: live first, then real
  // support, then recent momentum, then closeness to goal. Never a ₹0 sprint
  // when an active one exists.
  const featured = useMemo(() => {
    const live = sig.sprints.filter(s => sig.isLive(s) && s.mediaUrl);
    const score = (s: (typeof live)[number]) => {
      const ls = sig.lastSupport.get(String(s.id));
      return (sig.countOf(s) > 0 ? 1_000_000 : 0) + (ls ? ls.recent10 * 10_000 + Number(ls.last30 / 100n) : 0) + sig.pctOf(s) * 10;
    };
    return live.sort((a, b) => score(b) - score(a))[0] ?? sig.sprints.find(s => s.mediaUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig.sprints, sig.commitments, now]);
  // One momentum line, from real data only.
  const momentum = useMemo(() => {
    if (!featured) return null;
    const s = featured;
    const gap = s.goalAmount > sig.amountOf(s) ? s.goalAmount - sig.amountOf(s) : 0n;
    const low = sig.lowLeft(s);
    const today = sig.commitments.filter(c => c.sprintId === s.id && now - toMs(c.createdAt) < 24 * 60 * MIN).length;
    if (sig.isFunded(s)) return { text: 'Just funded', tone: 'live' };
    if (sig.countOf(s) === 0) return { text: 'Just launched', tone: 'info' };
    if (low && low.left > 0 && low.left <= 2) return { text: `Only ${low.left} ${low.title.toLowerCase()}${low.left === 1 ? '' : 's'} left`, tone: 'urg' };
    if (sig.pctOf(s) >= 80) return { text: `${sig.pctOf(s).toFixed(0)}% funded`, tone: 'live' };
    if (today >= 3) return { text: `${today} people backed this today`, tone: 'live' };
    return { text: `${rupees(gap)} to pilot`, tone: 'live' };
  }, [featured, sig, now]);
  const active = filters.stage !== 'all' || filters.category !== 'all' || filters.status !== 'all' || filters.sort !== 'ending';
  const rows = useMemo(() => (active ? applyFilters(sig.sprints, filters, sig) : applyDisc(sig.sprints, disc, sig, now)), [sig, filters, disc, active, now]);

  return (
    <>
      <Header me={me} isAdmin={isAdmin} />
      <main>
        <div className="wrap">
          <section className="hero">
            <div>
              <p className="eyebrow">{site('hero_eyebrow')}</p>
              <h1 className="h1">
                {site('hero_title')} {site('hero_accent') && <span className="accent">{site('hero_accent')}</span>}
              </h1>
              <p className="lead">{site('hero_sub')}</p>
              <div className="ctas">
                <a className="btn primary big" href="/live">
                  Explore live sprints <ArrowRight size={17} />
                </a>
                <a className="btn quiet" href="/builders">
                  Builders: start a sprint <ArrowRight size={15} />
                </a>
              </div>
            </div>
            {featured && (
              <a className="herocard" href={sprintPath(featured)} aria-label={`Happening now: ${featured.title}`}>
                <div className="img">
                  <img src={featured.mediaUrl} alt="" />
                  <span className="hn">
                    <i className="dot" /> {sig.isLive(featured) ? 'Happening now' : 'Recently closed'}
                  </span>
                </div>
                <div className="body">
                  <div className="title">{featured.title}</div>
                  {featured.nextStep && <div className="next">Next step: {featured.nextStep}</div>}
                  <div className="backed">
                    <b>{rupees(sig.amountOf(featured))}</b>
                    <span>backed</span>
                  </div>
                  {momentum && <div className={`mom ${momentum.tone}`}>{momentum.text}</div>}
                  <div className="track" style={{ margin: '12px 0 6px' }}>
                    <i style={{ width: `${sig.pctOf(featured)}%` }} />
                  </div>
                  <div className="foot">
                    <span>{sig.pctOf(featured).toFixed(0)}% funded</span>
                    <span>
                      {sig.countOf(featured)} supporter{sig.countOf(featured) === 1 ? '' : 's'}
                    </span>
                    <span className={`left${sig.isAlarm(featured) ? ' urg' : ''}`}>{sig.isLive(featured) ? short(sig.remainingOf(featured)) : 'Ended'}</span>
                  </div>
                </div>
              </a>
            )}
          </section>

          <div className="trustrow">
            <span>
              <Cpu size={15} /> Working prototypes
            </span>
            <span>
              <Crosshair size={15} /> Small, specific asks
            </span>
            <span>
              <Percent size={15} /> <b>0%</b> platform commission
            </span>
            <span>
              <ShieldOff size={15} /> No equity / no returns
            </span>
          </div>
        </div>

        <section className="section tight">
          <div className="wrap">
            {site('hide_metrics') ? null : sig.ready ? <Metrics sig={sig} /> : <div className="skel" style={{ height: 120 }} />}
            <div style={{ height: 24 }} />
            {!site('hide_happening') && <HappeningNow sig={sig} now={now} />}
          </div>
        </section>

        <section className="section soft" id="live" style={{ paddingTop: 64 }}>
          <div className="wrap">
            <p className="eyebrow">Live hardware</p>
            <h2 className="h2">{site('wall_title')}</h2>
            <p className="sub">{site('wall_sub')}</p>
            <div className="tabs">
              <DiscoveryTabs
                disc={disc}
                setDisc={d => {
                  setDisc(d);
                  setFilters(DEFAULT_FILTERS);
                }}
              />
              <span className="grow" />
              <FilterButton filters={filters} setFilters={setFilters} count={rows.length} />
            </div>
            {!sig.ready ? (
              <div className="grid">
                {[0, 1, 2].map(i => (
                  <div key={i} className="skel" style={{ height: 420 }} />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="empty">
                Nothing here right now.{' '}
                <a href="/live" style={{ color: 'var(--accent-ink)' }}>
                  See all sprints →
                </a>
              </div>
            ) : (
              <div className="grid">
                {rows.slice(0, 6).map(s => (
                  <Card key={String(s.id)} s={s} sig={sig} now={now} />
                ))}
              </div>
            )}
            {rows.length > 6 && (
              <div style={{ textAlign: 'center', marginTop: 26 }}>
                <a className="btn secondary big" href="/live">
                  See all {rows.length} sprints <ArrowRight size={16} />
                </a>
              </div>
            )}
          </div>
        </section>

        <section className="section" id="how-it-works">
          <div className="wrap">
            <p className="eyebrow">How it works</p>
            <h2 className="h2">Three steps. One live moment.</h2>
            <div className="three" style={{ marginTop: 32 }}>
              <div className="step">
                <div className="idx">01 / DISCOVER</div>
                <h3>Find something real.</h3>
                <p>Browse working hardware prototypes with a clear next step.</p>
              </div>
              <div className="step">
                <div className="idx">02 / SUPPORT</div>
                <h3>Back what you believe in.</h3>
                <p>Choose an amount and, if offered, a builder condition that matters to you.</p>
              </div>
              <div className="step">
                <div className="idx">03 / WATCH IT MOVE</div>
                <h3>See the sprint happen live.</h3>
                <p>Funding, supporters and limited options update in real time as the community backs the build.</p>
              </div>
            </div>
            <div className="proofrow" aria-label="Why trust BidFund">
              <div>
                <b className="accent">0%</b>
                <span>Platform commission</span>
              </div>
              <div>
                <b>No equity</b>
                <span>Support, not investment</span>
              </div>
              <div>
                <b>Prototype first</b>
                <span>Real builds only</span>
              </div>
            </div>
          </div>
        </section>

        <section className="section tight">
          <div className="wrap">
            <div className="banner light">
              <div>
                <p className="eyebrow">For hardware builders</p>
                <h2 className="h2">
                  Already have something working?
                  <br />
                  Fund the next real step.
                </h2>
                <p>Small raises for a pilot batch, field test, certification run or prototype iteration.</p>
                <div className="label strong" style={{ color: 'var(--accent-ink)', margin: '4px 0 18px' }}>
                  0% platform commission
                </div>
                <a className="btn primary big" href="/start">
                  Start a sprint <ArrowRight size={17} />
                </a>
              </div>
              <div className="paths">
                <div>
                  Prototype → <b>Pilot batch</b>
                </div>
                <div>
                  Prototype → <b>Field test</b>
                </div>
                <div>
                  Prototype → <b>Certification</b>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section warm" id="about">
          <div className="wrap">
            <div className="about">
              <div>
                <p className="eyebrow">{site('about_eyebrow')}</p>
                <h2 className="h2">{site('about_headline')}</h2>
                {site('about_body')
                  .split(/\n\s*\n/)
                  .map((p, i) => (
                    <p className="sub" key={i}>
                      {p}
                    </p>
                  ))}
              </div>
              <div className="zero">
                <div className="n">0%</div>
                <div className="l">Platform commission</div>
                <p>We don't take a cut of what builders raise.</p>
                <span>No equity. No financial returns.</span>
              </div>
            </div>
            <div hidden={!!site('hide_people')}>
              <p className="eyebrow" style={{ marginTop: 48 }}>
                The people building BidFund
              </p>
              <div className="people">
                <div className="person">
                  <div className="avatar">LR</div>
                  <div>
                    <b>Lakshveer Rao</b>
                    <div className="role">Hardware Builder</div>
                    <p>Building, testing and shipping real hardware.</p>
                  </div>
                </div>
                <div className="person">
                  <div className="avatar warm">AM</div>
                  <div>
                    <b>Adarsh Malpeddiwar</b>
                    <div className="role">Hardware Builder</div>
                    <p>Working through the prototype-to-pilot gap firsthand.</p>
                  </div>
                </div>
                <div className="person">
                  <div className="avatar info">CV</div>
                  <div>
                    <b>Capt Venkat</b>
                    <div className="role">Supporting the Build</div>
                    <p>Helping builders find the people and support they need.</p>
                  </div>
                </div>
              </div>
              <p className="note" style={{ marginTop: 22, fontSize: 14 }}>
                {site('credit')}
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
