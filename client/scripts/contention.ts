// Phase 1 checkpoint: N independent identities race for one limited perk slot.
// Expect exactly one success and N-1 honest PERK_TAKEN rejections, and the
// sprint totals to equal the sum of all accepted commitments.
//
// Usage: npx tsx scripts/contention.ts [clients=8] [perkId=1] [amount=100]
import { DbConnection, reducers, tables } from '../src/module_bindings';

const HOST = process.env.STDB_HOST ?? 'https://maincloud.spacetimedb.com';
const DB = process.env.STDB_DB ?? 'bidfund';
const N = Number(process.argv[2] ?? 8);
const PERK_ID = BigInt(process.argv[3] ?? 1);
const AMOUNT = BigInt(process.argv[4] ?? 100);

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
          .subscribe([tables.sprint, tables.supportOption]);
      })
      .onConnectError((_ctx, err) => reject(new Error(`${label}: ${err.message}`)))
      .build();
  });
}

async function main() {
  console.log(`Connecting ${N} independent clients to ${DB}…`);
  const conns = await Promise.all(Array.from({ length: N }, (_, i) => connect(`c${i}`)));
  const first = conns[0];
  // Username is mandatory to back a sprint: give every racer one.
  await Promise.all(
    conns.map(async (c, i) => {
      const tag = `race_${Date.now().toString(36).slice(-4)}${i}`;
      try {
        await c.reducers.register({ displayName: `Racer ${i}`, email: `${tag}@example.com`, sourceRef: 'race', sprintId: 1n });
      } catch {
        /* already registered on a reused token */
      }
      try {
        await c.reducers.claimUsername({ username: tag });
      } catch {
        /* already has one */
      }
    })
  );
  const perk = [...first.db.supportOption.iter()].find(p => p.id === PERK_ID);
  if (!perk) throw new Error(`perk ${PERK_ID} not found`);
  const sprintBefore = first.db.sprint.id.find(perk.sprintId)!;
  console.log(
    `Perk "${perk.title}": ${perk.slotsClaimed}/${perk.slotsTotal ?? '∞'} claimed. ` +
      `Sprint "${sprintBefore.title}": ₹${sprintBefore.committedAmount} from ${sprintBefore.supporterCount}.`
  );
  const slotsFree = perk.slotsTotal == null ? N : Math.max(0, perk.slotsTotal - perk.slotsClaimed);

  console.log(`Firing ${N} simultaneous claims for perk ${PERK_ID}…`);
  const t0 = Date.now();
  const results = await Promise.allSettled(
    conns.map(c =>
      c.reducers.commitSupport({ sprintId: perk.sprintId, amount: AMOUNT, supportOptionId: PERK_ID, quantity: 1 })
    )
  );
  const ms = Date.now() - t0;

  let ok = 0;
  let taken = 0;
  let other: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') ok++;
    else if (String(r.reason?.message ?? r.reason).includes('PERK_TAKEN')) taken++;
    else other.push(`c${i}: ${r.reason?.message ?? r.reason}`);
  });
  console.log(`Done in ${ms}ms → success=${ok} perkTaken=${taken} other=${other.length}`);
  other.forEach(o => console.log('  ' + o));

  // Let subscriptions settle, then compare every client's view.
  await new Promise(r => setTimeout(r, 1500));
  const views = conns.map(c => {
    const s = c.db.sprint.id.find(perk.sprintId)!;
    const p = [...c.db.supportOption.iter()].find(x => x.id === PERK_ID)!;
    return `₹${s.committedAmount}+₹${s.reserveAmount} reserve/${s.supporterCount} backers/status=${s.status}/perk ${p.slotsClaimed}/${p.slotsTotal ?? '∞'}`;
  });
  const distinct = new Set(views);
  console.log(`All ${N} clients see: ${[...distinct].join(' | ')}`);

  const expectedOk = Math.min(slotsFree, N);
  // Money past the goal goes to the reserve, so compare the combined total.
  const totalBefore = sprintBefore.committedAmount + sprintBefore.reserveAmount;
  const after = first.db.sprint.id.find(perk.sprintId)!;
  const totalAfter = after.committedAmount + after.reserveAmount;
  const pass =
    ok === expectedOk &&
    taken === N - expectedOk &&
    other.length === 0 &&
    distinct.size === 1 &&
    totalAfter === totalBefore + BigInt(ok) * AMOUNT &&
    after.committedAmount <= after.goalAmount &&
    after.supporterCount === sprintBefore.supporterCount + ok;
  console.log(pass ? '\nPASS ✓ exactly one authoritative state, no oversell' : '\nFAIL ✗');
  conns.forEach(c => c.disconnect());
  process.exit(pass ? 0 : 1);
}

main().catch(e => {
  console.error(e);
  process.exit(2);
});
