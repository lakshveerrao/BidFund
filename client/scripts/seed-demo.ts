// Seeds one judge-ready demo sprint (AirRemote) with a limited "Pilot Unit"
// condition, using the AiroMote photos from the pre-wipe backup.
// Usage: npx tsx scripts/seed-demo.ts [minutes=240]
import { readFileSync } from 'node:fs';
import { DbConnection, tables } from '../src/module_bindings';

const HOST = process.env.STDB_HOST ?? 'https://maincloud.spacetimedb.com';
const DB = process.env.STDB_DB ?? 'bidfund';
const MINUTES = Number(process.argv[2] ?? 240);
const BACKUP = 'C:/Users/ADMIN/bidfund-backup-2026-09-06/sprint_media.txt';

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
          .subscribe([tables.sprint, tables.profile]);
      })
      .onConnectError((_ctx, err) => reject(err))
      .build();
  });
}

async function main() {
  // Backup rows: id | sprint_id | position | thumb | full  → pair data URLs in order.
  const urls = readFileSync(BACKUP, 'utf8').match(/data:image\/jpeg;base64,[A-Za-z0-9+/=]+/g) ?? [];
  const pairs: { thumb: string; full: string }[] = [];
  for (let i = 0; i + 1 < urls.length; i += 2) pairs.push({ thumb: urls[i], full: urls[i + 1] });
  const pics = pairs.slice(0, 4);
  if (!pics.length) throw new Error('no images in backup');

  const c = await connect();
  // Each run is a fresh identity, so the handle must be free: airremote, then airremote2, 3…
  const me = [...c.db.profile.iter()].find(p => p.identity.toHexString() === c.identity!.toHexString());
  if (!me) await c.reducers.register({ displayName: 'Lakshveer', email: 'lakshveeronline@gmail.com', sourceRef: 'seed', sprintId: 1n });
  let tag = me?.username ?? '';
  if (!tag) {
    const taken = new Set([...c.db.profile.iter()].map(p => p.username));
    tag = 'airremote';
    for (let i = 2; taken.has(tag); i++) tag = `airremote${i}`;
    await c.reducers.claimUsername({ username: tag });
  }
  await c.reducers.createSprintV2({
    title: 'AirRemote — pilot batch of 10 boards',
    tagline: 'A tiny ESP32-C6 gesture remote that already works on the bench.',
    description:
      'Two working boards, BLE HID and I2C sensor stack tested. 3D-printed shell fits the PCB. Battery life measured at 9 days on a 250 mAh cell. Five friends have used it to control slides and a TV.',
    nextStep: 'Assemble and ship a pilot batch of 10 boards to early testers, with enclosures and a first firmware release.',
    builderName: 'Lakshveer Rao',
    builderBio: 'Hardware builder. Building, testing and shipping real hardware.',
    builderCity: 'Hyderabad',
    category: 'robotics',
    stage: 'prototype',
    goalAmount: 40000n,
    durationSeconds: BigInt(MINUTES) * 60n,
    opensInSeconds: 0n,
    fundPct: new Uint8Array([25, 45, 10, 10]),
    perkTitles: ['Pilot Unit', 'Name on the build'],
    perkDescriptions: ['One assembled AirRemote from the pilot batch, shipped to you in India.', 'Your name etched inside the enclosure of every pilot unit.'],
    perkSlots: [3, 0],
    perkMinAmounts: [2500n, 500n],
    journeyDates: ['2026-07-14', '2026-08-02', '2026-08-28'],
    journeyTexts: ['First board up: BLE pairing and gesture detection working.', 'Second revision: sensor on I2C, power-cycle bug fixed.', 'Enclosure printed, battery life measured at 9 days.'],
    imageThumbs: pics.map(p => p.thumb),
    imageFulls: pics.map(p => p.full),
    extraAllocLabels: ['Field test'],
    extraAllocPcts: new Uint8Array([10]),
  });
  await new Promise(r => setTimeout(r, 1200));
  const s = [...c.db.sprint.iter()].sort((a, b) => Number(b.id - a.id))[0];
  console.log(`seeded sprint #${s.id} "${s.title}" for ${MINUTES} min, ${pics.length} images, builder @${tag}`);
  process.exit(0);
}
main().catch(e => {
  console.error('ERROR', e);
  process.exit(1);
});
