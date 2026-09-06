import { useMemo } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from './module_bindings';
import type { Infer } from 'spacetimedb';
import SprintRow from './module_bindings/sprint_table';
import ProfileRow from './module_bindings/profile_table';
import { CATEGORY_LABEL, Disclaimer, Footer, Header, STAGE_LABEL, pad2, rupees, toMs } from './ui';

type Sprint = Infer<typeof SprintRow>;
type Profile = Infer<typeof ProfileRow>;

// Permanent record of a finished sprint, from final_result. No login needed.
export default function ResultPage({ sprint, profiles, me }: { sprint: Sprint; profiles: readonly Profile[]; me: Profile | undefined }) {
  const [finals] = useTable(tables.finalResult);
  const [commitments] = useTable(tables.supportCommitment);
  const [options] = useTable(tables.supportOption);
  const [journey] = useTable(tables.journeyEntry.where(r => r.sprintId.eq(sprint.id)));
  const fin = finals.find(f => f.sprintId === sprint.id);
  const amount = fin ? fin.finalCommittedAmount : sprint.committedAmount;
  const count = fin ? fin.finalSupporterCount : sprint.supporterCount;
  const funded = amount >= sprint.goalAmount;
  const pct = Math.min(100, Number((amount * 1000n) / sprint.goalAmount) / 10);
  const closedAt = fin ? new Date(toMs(fin.closedAt)) : new Date(toMs(sprint.deadline));
  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profiles) m.set(p.identity.toHexString(), p.username ? `@${p.username}` : p.displayName);
    return (hex: string) => m.get(hex) ?? 'Supporter';
  }, [profiles]);
  const perks = useMemo(() => [...options].filter(o => o.sprintId === sprint.id), [options, sprint.id]);
  const list = useMemo(() => [...commitments].filter(c => c.sprintId === sprint.id).sort((a, b) => Number(b.amount - a.amount)), [commitments, sprint.id]);
  const timeline = useMemo(() => [...journey].sort((a, b) => a.position - b.position), [journey]);

  return (
    <>
      <Header me={me} />
      <main className="wrap detail">
        <div>
          <div className="strip">
            <span className="pill muted">Sprint closed</span>
            <span className="pill info">{STAGE_LABEL[sprint.stage] ?? sprint.stage}</span>
            <span className="pill">{CATEGORY_LABEL[sprint.category] ?? sprint.category}</span>
          </div>
          <h1>{sprint.title}</h1>
          {sprint.tagline && <p className="tagline">{sprint.tagline}</p>}
          <div className="byline">
            {sprint.builderName}
            {sprint.builderUsername ? ` · @${sprint.builderUsername}` : ''} · closed {closedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
          <div className="gallery">{sprint.mediaUrl ? <img src={sprint.mediaUrl} alt="Working prototype" /> : <div className="noimg">Working prototype</div>}</div>
          <div className="block">
            <h2>What's already built</h2>
            <p>{sprint.description}</p>
          </div>
          <div className="block">
            <h2>What this sprint was for</h2>
            <p className="big">{sprint.nextStep}</p>
          </div>
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
          {list.length > 0 && (
            <div className="block">
              <h2>All supporters</h2>
              <ul className="activity">
                {list.map(c => {
                  const perk = c.supportOptionId != null ? perks.find(p => p.id === c.supportOptionId) : null;
                  return (
                    <li key={String(c.id)}>
                      <span>
                        {nameOf(c.identity.toHexString())}
                        {perk ? ` · ${perk.title}` : ''}
                      </span>
                      <span className="amt">{rupees(c.amount)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <Disclaimer />
        </div>
        <aside className={`panel${funded ? ' funded' : ''}`}>
          <span className={`pill ${funded ? 'live' : 'muted'}`}>{funded ? 'Pilot funded ✓' : 'Sprint ended'}</span>
          <div className="amt" style={{ marginTop: 14 }}>
            {rupees(amount)}
          </div>
          <div className="of">backed of {rupees(sprint.goalAmount)}</div>
          <div className="track">
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className="meta">
            <span>
              <b>{pct.toFixed(0)}%</b> funded
            </span>
            <span>
              <b>{count}</b> supporters
            </span>
            {sprint.reserveAmount > 0n && (
              <span>
                <b>{rupees(sprint.reserveAmount)}</b> reserve
              </span>
            )}
          </div>
          {perks.length > 0 && (
            <ul className="list">
              {perks.map(p => (
                <li key={String(p.id)}>
                  <span>{p.title}</span>
                  <span className="v">{p.slotsTotal != null ? `${p.slotsClaimed} / ${p.slotsTotal}` : `${p.slotsClaimed} claimed`}</span>
                </li>
              ))}
            </ul>
          )}
          <a className="btn secondary block" href="/live" style={{ marginTop: 14 }}>
            Back to live sprints
          </a>
        </aside>
      </main>
      <Footer />
    </>
  );
}
