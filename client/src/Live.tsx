import { useEffect, useMemo, useState } from 'react';
import type { Infer } from 'spacetimedb';
import ProfileRow from './module_bindings/profile_table';
import { Card, DEFAULT_FILTERS, DiscoveryTabs, FilterButton, HappeningNow, applyDisc, applyFilters, useSprintSignals, type Disc, type Filters } from './Cards';
import { Disclaimer, Footer, Header } from './ui';

type Profile = Infer<typeof ProfileRow>;

// /live — all discovery. Same controls as the homepage, no cap on cards.
export default function Live({ now, me }: { now: number; me: Profile | undefined }) {
  const sig = useSprintSignals(now);
  const [disc, setDisc] = useState<Disc>('live');
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS });
  const [all, setAll] = useState(false);
  useEffect(() => {
    document.title = 'Live Sprints — BidFund';
  }, []);
  const active = filters.stage !== 'all' || filters.category !== 'all' || filters.status !== 'all' || filters.sort !== 'ending';
  const rows = useMemo(() => (all || active ? applyFilters(sig.sprints, all && !active ? { ...DEFAULT_FILTERS } : filters, sig) : applyDisc(sig.sprints, disc, sig, now)), [sig, filters, disc, active, all, now]);

  return (
    <>
      <Header me={me} active="/live" />
      <main className="wrap" style={{ paddingTop: 40, paddingBottom: 80 }}>
        <p className="eyebrow">Live hardware</p>
        <h1 className="h2">All sprints</h1>
        <div style={{ height: 20 }} />
        <HappeningNow sig={sig} now={now} />
        <div className="tabs">
          <DiscoveryTabs
            disc={disc}
            setDisc={d => {
              setDisc(d);
              setAll(false);
              setFilters({ ...DEFAULT_FILTERS });
            }}
          />
          <button type="button" className={`tab${all && !active ? ' on' : ''}`} onClick={() => setAll(true)}>
            Everything
          </button>
          <span className="grow" />
          <FilterButton filters={filters} setFilters={f => setFilters(f)} count={rows.length} />
        </div>
        {!sig.ready ? (
          <div className="grid">
            {[0, 1, 2].map(i => (
              <div key={i} className="skel" style={{ height: 420 }} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="empty">Nothing matches right now.</div>
        ) : (
          <div className="grid">
            {rows.map(s => (
              <Card key={String(s.id)} s={s} sig={sig} now={now} />
            ))}
          </div>
        )}
        <Disclaimer />
      </main>
      <Footer />
    </>
  );
}
