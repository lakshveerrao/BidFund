// Owner-only: set a sprint's description/next step/media from files, using the
// CLI login token so the call carries the publisher identity.
//   npx tsx scripts/owner-media.ts <sprintId> <mediaFile|url> [descriptionFile] [nextStepFile]
import { readFileSync } from 'node:fs';
import { DbConnection, tables } from '../src/module_bindings';

const HOST = process.env.STDB_HOST ?? 'https://maincloud.spacetimedb.com';
const DB = process.env.STDB_DB ?? 'bidfund';
const CLI_TOML = process.env.SPACETIME_CLI_TOML ?? 'C:/Users/ADMIN/AppData/Local/SpacetimeDB/config/cli.toml';

const [sprintArg, mediaArg, descFile, nextFile] = process.argv.slice(2);
if (!sprintArg || !mediaArg) {
  console.error('usage: owner-media.ts <sprintId> <mediaFile|url> [descriptionFile] [nextStepFile]');
  process.exit(2);
}
const token = /spacetimedb_token\s*=\s*"([^"]+)"/.exec(readFileSync(CLI_TOML, 'utf8'))?.[1];
if (!token) throw new Error('no spacetimedb_token in cli.toml');
const media = mediaArg.startsWith('http') || mediaArg.startsWith('data:') ? mediaArg : readFileSync(mediaArg, 'utf8').trim();

const conn: DbConnection = await new Promise((resolve, reject) => {
  DbConnection.builder()
    .withUri(HOST)
    .withDatabaseName(DB)
    .withToken(token)
    .onConnect(c => c.subscriptionBuilder().onApplied(() => resolve(c)).subscribe([tables.sprint]))
    .onConnectError((_c, e) => reject(e))
    .build();
});
const s = conn.db.sprint.id.find(BigInt(sprintArg));
if (!s) throw new Error('sprint not found');
await conn.reducers.updateSprintDetails({
  sprintId: s.id,
  description: descFile ? readFileSync(descFile, 'utf8').trim() : s.description,
  nextStep: nextFile ? readFileSync(nextFile, 'utf8').trim() : s.nextStep,
  mediaUrl: media,
});
console.log(`sprint ${s.id} updated; media ${media.length} chars`);
conn.disconnect();
process.exit(0);
