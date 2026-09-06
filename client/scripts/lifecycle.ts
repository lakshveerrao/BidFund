// Mentor-feedback lifecycle check with throwaway identities:
// builder lists a sprint → builder cannot back it (OWN_SPRINT) → backer commits →
// backer rates builder → builder edits → builder archives (deleteSprint) →
// backer deletes account. Leaves one archived test sprint behind (hidden from the wall).
//
// Usage: npx tsx scripts/lifecycle.ts
import { DbConnection, tables } from '../src/module_bindings';

const HOST = process.env.STDB_HOST ?? 'https://maincloud.spacetimedb.com';
const DB = process.env.STDB_DB ?? 'bidfund';

function connect(label: string): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(DB)
      .onConnect(conn => {
        conn
          .subscriptionBuilder()
          .onApplied(() => resolve(conn))
          .onError((_ctx, err) => reject(err))
          .subscribe([tables.sprint, tables.supportOption, tables.profile, tables.builderRating, tables.sprintOwner, tables.allocationItem]);
      })
      .onConnectError((_ctx, err) => reject(new Error(`${label}: ${err.message}`)))
      .build();
  });
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const step = (name: string, ok: boolean, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function main() {
  const tag = Date.now().toString(36).slice(-5);
  const [builder, backer] = await Promise.all([connect('builder'), connect('backer')]);
  await builder.reducers.register({ displayName: 'Test Builder', email: `tb_${tag}@example.com`, sourceRef: 'test', sprintId: 1n });
  await builder.reducers.claimUsername({ username: `tb_${tag}` });
  await backer.reducers.register({ displayName: 'Test Backer', email: `tk_${tag}@example.com`, sourceRef: 'test', sprintId: 1n });
  await backer.reducers.claimUsername({ username: `tk_${tag}` });

  const title = `Lifecycle test ${tag}`;
  await builder.reducers.createSprintV2({
    title,
    tagline: 'temporary test listing',
    description: 'A test. It works. It is archived right after.',
    nextStep: 'Verify mentor features end to end.',
    builderName: 'Test Builder',
    builderBio: 'Script.',
    builderCity: 'Nowhere',
    category: 'other',
    stage: 'prototype',
    goalAmount: 1000n,
    durationSeconds: 600n,
    opensInSeconds: 0n,
    fundPct: new Uint8Array([30, 30, 10, 10]),
    perkTitles: ['Thanks note'],
    perkDescriptions: ['A note'],
    perkSlots: [0],
    perkMinAmounts: [0n],
    journeyDates: ['2026-09-05'],
    journeyTexts: ['Scripted'],
    imageThumbs: ['data:image/gif;base64,R0lGODlhAQABAAAAACw='],
    imageFulls: ['data:image/gif;base64,R0lGODlhAQABAAAAACw='],
    extraAllocLabels: ['Field test'],
    extraAllocPcts: new Uint8Array([20]),
  });
  await sleep(1500);
  const sprint = [...builder.db.sprint.iter()].find(s => s.title === title);
  step('createSprintV2 with extra allocation line', !!sprint, sprint ? `id ${sprint.id}` : 'sprint not found');
  if (!sprint) return;
  const extra = [...builder.db.allocationItem.iter()].filter(a => a.sprintId === sprint.id);
  step('allocation_item row written', extra.length === 1 && extra[0].pct === 20, JSON.stringify(extra.map(a => [a.label, a.pct])));
  const owner = [...builder.db.sprintOwner.iter()].find(o => o.sprintId === sprint.id);
  step('sprint_owner row is the builder', !!owner && owner.identity.toHexString() === builder.identity!.toHexString());

  try {
    await builder.reducers.commitSupport({ sprintId: sprint.id, amount: 100n, supportOptionId: undefined, quantity: 1 });
    step('builder cannot back own sprint', false, 'commit was accepted');
  } catch (e) {
    step('builder cannot back own sprint', errText(e).includes('OWN_SPRINT'), errText(e));
  }

  try {
    await backer.reducers.rateBuilder({ sprintId: sprint.id, stars: 5 });
    step('rating rejected before backing', false, 'accepted');
  } catch (e) {
    step('rating rejected before backing', true, errText(e));
  }
  await backer.reducers.commitSupport({ sprintId: sprint.id, amount: 250n, supportOptionId: undefined, quantity: 1 });
  await backer.reducers.rateBuilder({ sprintId: sprint.id, stars: 4 });
  await backer.reducers.rateBuilder({ sprintId: sprint.id, stars: 5 });
  await sleep(1200);
  const ratings = [...backer.db.builderRating.iter()].filter(r => r.builderIdentity.toHexString() === builder.identity!.toHexString());
  step('rating upserts (one row, latest stars)', ratings.length === 1 && ratings[0].stars === 5, JSON.stringify(ratings.map(r => r.stars)));

  try {
    await backer.reducers.updateSprint({ sprintId: sprint.id, title: 'hijack', tagline: '', description: 'x', nextStep: 'x', builderName: 'x', builderBio: '', builderCity: '', category: 'other', stage: 'pilot' });
    step('non-owner cannot edit', false, 'accepted');
  } catch (e) {
    step('non-owner cannot edit', true, errText(e));
  }
  await builder.reducers.updateSprint({ sprintId: sprint.id, title: title + ' (edited)', tagline: 'edited', description: sprint.description, nextStep: sprint.nextStep, builderName: 'Test Builder', builderBio: 'Script.', builderCity: 'Somewhere', category: 'robotics', stage: 'pilot' });
  await sleep(1200);
  const edited = builder.db.sprint.id.find(sprint.id)!;
  step('owner edit applied', edited.title.endsWith('(edited)') && edited.stage === 'pilot' && edited.builderCity === 'Somewhere');

  try {
    await backer.reducers.deleteSprint({ sprintId: sprint.id });
    step('non-owner cannot delete', false, 'accepted');
  } catch (e) {
    step('non-owner cannot delete', true, errText(e));
  }
  await builder.reducers.deleteSprint({ sprintId: sprint.id });
  await sleep(1200);
  step('owner delete archives listing', builder.db.sprint.id.find(sprint.id)?.status === 'archived', builder.db.sprint.id.find(sprint.id)?.status);

  await backer.reducers.deleteAccount();
  await sleep(1200);
  const gone = ![...builder.db.profile.iter()].some(p => p.username === `tk_${tag}`);
  const ratingGone = ![...builder.db.builderRating.iter()].some(r => r.raterIdentity.toHexString() === backer.identity!.toHexString());
  step('delete account removes profile + rating', gone && ratingGone, `profile gone=${gone} rating gone=${ratingGone}`);
  await builder.reducers.deleteAccount();
  process.exit(0);
}
main().catch(e => {
  console.error('ERROR', e);
  process.exit(1);
});
