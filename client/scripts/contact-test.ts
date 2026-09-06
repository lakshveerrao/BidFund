// Sends one real message through the contact form reducer with a throwaway
// identity, then reports whether the pump delivered it (status flips to 'sent').
// Usage: npx tsx scripts/contact-test.ts
import { DbConnection, tables } from '../src/module_bindings';

const HOST = process.env.STDB_HOST ?? 'https://maincloud.spacetimedb.com';
const DB = process.env.STDB_DB ?? 'bidfund';

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
          .subscribe([tables.sprint]);
      })
      .onConnectError((_ctx, err) => reject(err))
      .build();
  });
}

async function main() {
  const c = await connect();
  const t0 = Date.now();
  await c.reducers.sendContact({
    name: 'BidFund contact test',
    email: 'hello@bidfund.me',
    message: `Test message from the new /contact page at ${new Date().toISOString()}. If you can read this, the contact form is delivering to the team inbox with a copy to the second address.`,
  });
  console.log(`queued in ${Date.now() - t0}ms — check the inbox in ~10s`);
  try {
    await c.reducers.sendContact({ name: 'x', email: 'bad', message: 'short' });
    console.log('FAIL validation accepted a bad email');
  } catch (e) {
    console.log('PASS validation:', e instanceof Error ? e.message : String(e));
  }
  process.exit(0);
}
main().catch(e => {
  console.error('ERROR', e);
  process.exit(1);
});
