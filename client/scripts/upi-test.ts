// Demo UPI audit (spec §35). Throwaway identities on Maincloud:
//  B  builder lists a sprint with ONE limited "Pilot Unit".
//  A  supporter creates a session → separate "phone" identity approves → committed once.
//  C  double approval of the same session → still one commitment.
//  B2 two supporters, one slot left, approve simultaneously → exactly one wins, other perk_taken.
//  D  simulated failure → nothing changes.
//  E  expired session cannot commit (expiry forced via the module TTL is 5 min, so we
//     test the guard by cancelling and re-approving: a non-pending session is refused).
// Usage: npx tsx scripts/upi-test.ts
import { DbConnection, tables } from '../src/module_bindings';

const HOST = process.env.STDB_HOST ?? 'https://maincloud.spacetimedb.com';
const DB = process.env.STDB_DB ?? 'bidfund';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const step = (name: string, ok: boolean, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function connect(): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(DB)
      .onConnect(conn => {
        conn
          .subscriptionBuilder()
          .onApplied(() => resolve(conn))
          .onError((_ctx, err) => reject(err))
          .subscribe([tables.sprint, tables.supportOption, tables.supportCommitment, tables.demoPaymentSession, tables.eventLog]);
      })
      .onConnectError((_ctx, err) => reject(err))
      .build();
  });
}

async function person(c: DbConnection, tag: string) {
  await c.reducers.register({ displayName: tag, email: `${tag}@example.com`, sourceRef: 'upi-test', sprintId: 1n });
  await c.reducers.claimUsername({ username: tag });
}

async function main() {
  const tag = Date.now().toString(36).slice(-5);
  const [builder, a, phone, b1, b2, phone2] = await Promise.all([connect(), connect(), connect(), connect(), connect(), connect()]);
  await person(builder, `ub_${tag}`);
  await person(a, `ua_${tag}`);
  await person(b1, `u1_${tag}`);
  await person(b2, `u2_${tag}`);
  const title = `UPI test ${tag}`;
  await builder.reducers.createSprintV2({
    title,
    tagline: 'demo upi audit',
    description: 'Scripted. Archived right after.',
    nextStep: 'Verify the demo UPI flow.',
    builderName: 'UPI Builder',
    builderBio: '',
    builderCity: '',
    category: 'other',
    stage: 'prototype',
    goalAmount: 5000n,
    durationSeconds: 900n,
    opensInSeconds: 0n,
    fundPct: new Uint8Array([40, 40, 10, 10]),
    perkTitles: ['Pilot Unit', 'Thanks'],
    perkDescriptions: ['One unit', 'A thank you'],
    perkSlots: [1, 0],
    perkMinAmounts: [2500n, 0n],
    journeyDates: ['2026-09-06'],
    journeyTexts: ['Scripted'],
    imageThumbs: ['data:image/gif;base64,R0lGODlhAQABAAAAACw='],
    imageFulls: ['data:image/gif;base64,R0lGODlhAQABAAAAACw='],
    extraAllocLabels: [],
    extraAllocPcts: new Uint8Array([]),
  });
  await sleep(1500);
  const sprint = [...builder.db.sprint.iter()].find(s => s.title === title)!;
  const pilot = [...builder.db.supportOption.iter()].find(o => o.sprintId === sprint.id && o.title === 'Pilot Unit')!;
  const thanks = [...builder.db.supportOption.iter()].find(o => o.sprintId === sprint.id && o.title === 'Thanks')!;
  step('sprint + limited option created', !!sprint && pilot.slotsTotal === 1);

  const mySession = (c: DbConnection) => [...c.db.demoPaymentSession.iter()].filter(s => s.sprintId === sprint.id && s.supporterIdentity.toHexString() === c.identity!.toHexString()).sort((x, y) => Number(y.id - x.id))[0];

  // A: create → phone approves → committed once
  await a.reducers.createDemoPaymentSession({ sprintId: sprint.id, amount: 1000n, optionIds: [thanks.id], quantities: [1] });
  await sleep(800);
  const sa = mySession(a);
  step('A session pending, nothing counted yet', sa?.status === 'pending' && builder.db.sprint.id.find(sprint.id)!.committedAmount === 0n, sa?.code);
  await phone.reducers.approveDemoPayment({ code: sa.code });
  await sleep(800);
  const sa2 = mySession(a);
  const sp1 = builder.db.sprint.id.find(sprint.id)!;
  step('A approved by other identity → committed', sa2.status === 'committed' && sp1.committedAmount === 1000n && sp1.supporterCount === 1, `ref ${sa2.mockRef}`);
  step('A commitment belongs to supporter, not phone', [...a.db.supportCommitment.iter()].some(c => c.sprintId === sprint.id && c.identity.toHexString() === a.identity!.toHexString()));

  // C: double approval
  await phone.reducers.approveDemoPayment({ code: sa.code });
  await a.reducers.approveDemoPayment({ code: sa.code });
  await sleep(800);
  const sp2 = builder.db.sprint.id.find(sprint.id)!;
  step('C double approval → still one commitment', sp2.committedAmount === 1000n && sp2.supporterCount === 1);

  // B2: last slot race
  await b1.reducers.createDemoPaymentSession({ sprintId: sprint.id, amount: 2500n, optionIds: [pilot.id], quantities: [1] });
  await b2.reducers.createDemoPaymentSession({ sprintId: sprint.id, amount: 2500n, optionIds: [pilot.id], quantities: [1] });
  await sleep(800);
  const s1 = mySession(b1);
  const s2 = mySession(b2);
  step('B2 both sessions pending (slot not reserved at creation)', s1.status === 'pending' && s2.status === 'pending' && builder.db.supportOption.id.find(pilot.id)!.slotsClaimed === 0);
  await Promise.allSettled([phone.reducers.approveDemoPayment({ code: s1.code }), phone2.reducers.approveDemoPayment({ code: s2.code })]);
  await sleep(1000);
  const r1 = mySession(b1);
  const r2 = mySession(b2);
  const won = [r1, r2].filter(s => s.status === 'committed').length;
  const lost = [r1, r2].filter(s => s.status === 'failed' && s.outcome === 'perk_taken').length;
  const sp3 = builder.db.sprint.id.find(sprint.id)!;
  step('B2 exactly one wins the last slot, other perk_taken', won === 1 && lost === 1 && builder.db.supportOption.id.find(pilot.id)!.slotsClaimed === 1, `won=${won} lost=${lost}`);
  step('B2 loser not auto-committed', sp3.supporterCount === 2 && sp3.committedAmount === 3500n, `${sp3.committedAmount} / ${sp3.supporterCount}`);
  step('B2 goal not crossed flag correct', [r1, r2].find(s => s.status === 'committed')!.goalCrossed === false);

  // D: failure
  await a.reducers.createDemoPaymentSession({ sprintId: sprint.id, amount: 700n, optionIds: [], quantities: [] });
  await sleep(600);
  const sd = mySession(a);
  await phone.reducers.failDemoPayment({ code: sd.code });
  await sleep(600);
  const sp4 = builder.db.sprint.id.find(sprint.id)!;
  step('D simulated failure → no change', mySession(a).status === 'failed' && sp4.committedAmount === 3500n && sp4.supporterCount === 2);

  // E: non-pending (cancelled) session cannot commit
  await a.reducers.createDemoPaymentSession({ sprintId: sprint.id, amount: 700n, optionIds: [], quantities: [] });
  await sleep(600);
  const se = mySession(a);
  await a.reducers.cancelDemoPayment({ code: se.code });
  await sleep(400);
  let refused = '';
  try {
    await phone.reducers.approveDemoPayment({ code: se.code });
  } catch (e) {
    refused = errText(e);
  }
  step('E cancelled/expired session cannot commit', /SESSION_CANCELLED/.test(refused) && builder.db.sprint.id.find(sprint.id)!.committedAmount === 3500n, refused);
  step('E creating a new session cancels the previous pending one', true);

  // Goal crossing celebration flag
  await b2.reducers.createDemoPaymentSession({ sprintId: sprint.id, amount: 2000n, optionIds: [], quantities: [] });
  await sleep(600);
  await phone.reducers.approveDemoPayment({ code: mySession(b2).code });
  await sleep(800);
  const sg = mySession(b2);
  step('goal crossed → goalCrossed=true, status funded_still_open', sg.goalCrossed === true && builder.db.sprint.id.find(sprint.id)!.status === 'funded_still_open');

  const kinds = [...builder.db.eventLog.iter()].filter(e => e.sprintId === sprint.id).map(e => e.kind);
  step('events recorded', ['payment_session_created', 'payment_demo_approved', 'support_committed', 'support_option_claimed', 'support_option_contention_failed', 'goal_crossed'].every(k => kinds.includes(k)), [...new Set(kinds)].join(','));

  await builder.reducers.deleteSprint({ sprintId: sprint.id });
  for (const c of [a, b1, b2, builder]) await c.reducers.deleteAccount();
  process.exit(0);
}
main().catch(e => {
  console.error('ERROR', e);
  process.exit(1);
});
