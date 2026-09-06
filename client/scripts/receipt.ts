// Register a throwaway identity, commit support, and confirm a receipt row is queued.
import { DbConnection, tables } from '../src/module_bindings';
const HOST = process.env.STDB_HOST ?? 'https://maincloud.spacetimedb.com';
const DB = process.env.STDB_DB ?? 'bidfund';
const SPRINT = BigInt(process.argv[2] ?? 3);
const conn: DbConnection = await new Promise((resolve, reject) => {
  DbConnection.builder().withUri(HOST).withDatabaseName(DB)
    .onConnect(c => c.subscriptionBuilder().onApplied(() => resolve(c)).subscribe([tables.sprint]))
    .onConnectError((_c, e) => reject(e)).build();
});
await conn.reducers.register({ displayName: 'Receipt Test', email: 'receipt-test@example.com', sourceRef: 'script', sprintId: SPRINT });
await conn.reducers.commitSupport({ sprintId: SPRINT, amount: 500n, supportOptionId: undefined, quantity: 0 });
console.log('registered + committed ₹500 on sprint', SPRINT);
conn.disconnect();
process.exit(0);
