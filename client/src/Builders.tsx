import type { Infer } from 'spacetimedb';
import ProfileRow from './module_bindings/profile_table';
import { ArrowRight } from 'lucide-react';
import { Disclaimer, Footer, Header } from './ui';

type Profile = Infer<typeof ProfileRow>;

// Public page for prospective builders: one audience, one job.
export default function Builders({ me }: { me: Profile | undefined }) {
  return (
    <>
      <Header me={me} active="/builders" />
      <main>
        <div className="wrap">
          <section className="hero" style={{ gridTemplateColumns: '1fr', paddingBottom: 40 }}>
            <div>
              <p className="eyebrow">For hardware builders</p>
              <h1 className="h1">
                Already have something working?
                <br />
                Fund the next real step.
              </h1>
              <p className="lead">
                Need a small amount for a pilot batch, field test, certification run or prototype iteration? Start a short live micro-funding sprint and
                rally the people who believe in what you're building.
              </p>
              <div className="ctas">
                <a className="btn primary big" href="/start">
                  Start a sprint <ArrowRight size={17} />
                </a>
                <a className="btn secondary big" href="/live">
                  See live sprints
                </a>
              </div>
            </div>
          </section>
        </div>

        <section className="section soft tight">
          <div className="wrap">
            <div className="three">
              <div className="step">
                <div className="idx">SMALL RAISES</div>
                <h3>Built for the prototype → pilot gap</h3>
                <p>Ask for exactly what the next step costs. Tooling, components, certification, buffer, and anything else you name.</p>
              </div>
              <div className="step">
                <div className="idx">0% COMMISSION</div>
                <h3>We don't take a cut</h3>
                <p>BidFund does not charge a percentage of what your community commits.</p>
              </div>
              <div className="step">
                <div className="idx">LIVE SUPPORT</div>
                <h3>One funding moment</h3>
                <p>Bring your community into a short live sprint. Everyone watches the same numbers move.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <div className="metrics">
              <div className="metric">
                <div className="n">₹10K–₹50K</div>
                <div className="l">Small pilot asks</div>
                <div className="c">the range sprints are designed for</div>
              </div>
              <div className="metric">
                <div className="n accent">0%</div>
                <div className="l">Platform commission</div>
              </div>
              <div className="metric">
                <div className="n">15–240 min</div>
                <div className="l">Live sprints</div>
                <div className="c">you set the clock</div>
              </div>
              <div className="metric">
                <div className="n">Real</div>
                <div className="l">Working prototypes</div>
                <div className="c">the prototype is the proof</div>
              </div>
            </div>
          </div>
        </section>

        <section className="section warm">
          <div className="wrap">
            <p className="eyebrow">What you'll set up</p>
            <h2 className="h2">Six short sections. Everything supporters need.</h2>
            <div className="three" style={{ marginTop: 28 }}>
              {[
                ['01 / The build', 'Name, tagline, category, stage, description, your bio and city.'],
                ['02 / Show it', 'A cover photo and up to four more. Images are cropped to fit project cards.'],
                ['03 / Next step', 'What this funding unlocks, the goal, the duration and when it opens.'],
                ['04 / Fund allocation', 'Tooling, components, certification, buffer, plus any lines you add. Must total 100%.'],
                ['05 / Support options', 'What you can offer supporters, with a minimum amount and optional quantity.'],
                ['06 / Build journey', 'Dated milestones that show the build is real.'],
              ].map(([t, d]) => (
                <div className="step" key={t}>
                  <div className="idx">{t.toUpperCase()}</div>
                  <p>{d}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 32 }}>
              <a className="btn primary big" href="/start">
                Start a sprint <ArrowRight size={17} />
              </a>
              <div className="note">Working prototype · No equity · No financial returns</div>
            </div>
            <Disclaimer />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
