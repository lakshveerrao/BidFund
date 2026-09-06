import {
  schema,
  table,
  t,
  SenderError,
  type InferSchema,
  type ReducerCtx,
} from 'spacetimedb/server';
import { ScheduleAt, Timestamp, type Identity } from 'spacetimedb';

// ---------------------------------------------------------------------------
// BidFund — live, time-boxed funding sprints for hardware builders.
// All money is an integer number of rupees (u64). Never floats.
// The client never computes authoritative state: it calls reducers and
// renders whatever these tables say.
// ---------------------------------------------------------------------------

const SPRINT_OPEN = 'open';
const SPRINT_FUNDED_STILL_OPEN = 'funded_still_open';
const SPRINT_CLOSED = 'closed';
const SPRINT_ARCHIVED = 'archived';

const sprint = table(
  { name: 'sprint', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    title: t.string(),
    description: t.string(),
    nextStep: t.string(),
    mediaUrl: t.string(),
    builderName: t.string(),
    goalAmount: t.u64(),
    committedAmount: t.u64(), // authoritative, written only by reducers
    supporterCount: t.u32(),
    deadline: t.timestamp(),
    status: t.string(), // 'open' | 'funded_still_open' | 'closed' | 'archived'
    createdAt: t.timestamp(),
    peakPresence: t.u32().default(0), // max distinct identities seen in the room
    builderBio: t.string().default(''),
    reserveAmount: t.u64().default(0n), // support received after the goal was met
    tagline: t.string().default(''),
    category: t.string().default('other'), // water|agri|health|recycle|mobility|robotics|energy|other
    stage: t.string().default('prototype'), // sketch|prototype|pilot|shipping
    builderCity: t.string().default(''),
    builderUsername: t.string().default(''),
    fundToolingPct: t.u8().default(0),
    fundComponentsPct: t.u8().default(0),
    fundCertPct: t.u8().default(0),
    fundBufferPct: t.u8().default(0),
    opensAt: t.timestamp().default(new Timestamp(0n)), // <= now means open; future = upcoming
    interestCount: t.u32().default(0),
  }
);

// Build journey milestones per sprint.
const journey_entry = table(
  { name: 'journey_entry', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    sprintId: t.u64().index('btree'),
    position: t.u32(),
    entryDate: t.string(), // YYYY-MM-DD
    text: t.string(),
  }
);

// 👍 interest: one row per identity per sprint.
const interest = table(
  { name: 'interest', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    sprintId: t.u64().index('btree'),
    identity: t.identity(),
    createdAt: t.timestamp(),
  }
);

// Invitations from one username to another for a sprint.
const invite = table(
  { name: 'invite', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    sprintId: t.u64().index('btree'),
    invitedUsername: t.string().index('btree'),
    invitedByUsername: t.string(),
    createdAt: t.timestamp(),
  }
);

// Who created each sprint (identity), for "My listings".
const sprint_owner = table(
  { name: 'sprint_owner', public: true },
  {
    sprintId: t.u64().primaryKey(),
    identity: t.identity().index('btree'),
  }
);

// Extra "where the money goes" lines beyond the four fixed buckets.
const allocation_item = table(
  { name: 'allocation_item', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    sprintId: t.u64().index('btree'),
    label: t.string(),
    pct: t.u8(),
  }
);

// Supporter → builder star rating, one per (rater, builder). Only supporters
// who actually backed one of the builder's sprints can rate.
const builder_rating = table(
  { name: 'builder_rating', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    builderIdentity: t.identity().index('btree'),
    raterIdentity: t.identity(),
    sprintId: t.u64(),
    stars: t.u8(),
    createdAt: t.timestamp(),
  }
);

// Line items of a multi-perk commitment.
const commitment_item = table(
  { name: 'commitment_item', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    commitmentId: t.u64().index('btree'),
    supportOptionId: t.u64().index('btree'),
    quantity: t.u32(),
  }
);

// Product images: compressed client-side, stored per sprint. Clients subscribe
// to one sprint's rows at a time; the homepage uses sprint.media_url (thumb).
const sprint_media = table(
  { name: 'sprint_media', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    sprintId: t.u64().index('btree'),
    position: t.u32(),
    thumb: t.string(), // small data URL
    full: t.string(), // larger data URL
  }
);

const support_option = table(
  { name: 'support_option', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    sprintId: t.u64().index('btree'),
    title: t.string(),
    description: t.string(),
    slotsTotal: t.option(t.u32()), // null = unlimited
    slotsClaimed: t.u32(),
    minAmount: t.u64().default(0n), // rupees per unit for this perk (0 = any amount)
  }
);

const support_commitment = table(
  { name: 'support_commitment', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    sprintId: t.u64().index('btree'),
    identity: t.identity(),
    amount: t.u64(),
    supportOptionId: t.option(t.u64()),
    mockTransactionId: t.string(),
    createdAt: t.timestamp(),
    quantity: t.u32().default(1), // perk slots claimed in this commitment
    reserveAmount: t.u64().default(0n), // portion of amount held in reserve
  }
);

// Written exactly once per sprint by close_sprint. Immutable afterwards.
const final_result = table(
  { name: 'final_result', public: true },
  {
    sprintId: t.u64().primaryKey(),
    finalCommittedAmount: t.u64(),
    finalSupporterCount: t.u32(),
    closedAt: t.timestamp(),
  }
);

// Scheduled row: one per sprint, fires at the sprint deadline.
const sprint_close_timer = table(
  { name: 'sprint_close_timer', scheduled: (): any => closeSprint },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
    sprintId: t.u64(),
  }
);

// --- Phase 3: people ------------------------------------------------------

// Public: what everyone may see about a participant.
const profile = table(
  { name: 'profile', public: true },
  {
    identity: t.identity().primaryKey(),
    displayName: t.string(),
    createdAt: t.timestamp(),
    username: t.string().default(''), // claimed handle, lowercase, unique (enforced in claim_username)
    bio: t.string().default(''),
    contact: t.string().default(''),
    location: t.string().default(''),
    socialX: t.string().default(''),
    socialLinkedin: t.string().default(''),
    socialInstagram: t.string().default(''),
  }
);

// Private: never subscribed to by any client. Reducer/procedure access only.
const participant_email = table(
  { name: 'participant_email' },
  {
    identity: t.identity().primaryKey(),
    email: t.string(),
    sourceRef: t.string(),
    createdAt: t.timestamp(),
  }
);

// One row per live connection inside a sprint room. Count DISTINCT identities
// when displaying "N people here now".
const room_presence = table(
  { name: 'room_presence', public: true },
  {
    connectionId: t.connectionId().primaryKey(),
    identity: t.identity(),
    sprintId: t.u64().index('btree'),
    enteredAt: t.timestamp(),
  }
);

// Private outbox. The registration reducer only inserts here; a scheduled
// procedure drains it. A slow or failed email never blocks registration.
const email_outbox = table(
  { name: 'email_outbox' },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.identity(),
    toEmail: t.string(),
    toName: t.string(),
    sprintId: t.u64(),
    kind: t.string(), // 'signup' | 'receipt'
    status: t.string().index('btree'), // 'pending' | 'sent' | 'failed'
    attempts: t.u32(),
    lastError: t.string(),
    createdAt: t.timestamp(),
    amount: t.u64().default(0n),
    perkTitle: t.string().default(''),
    mockRef: t.string().default(''),
  }
);

// Demo UPI payment session. Public: the supporter's device and the approving
// phone both subscribe by code. The code is the only authorisation needed to
// approve, so it is random (32^8) and short-lived (5 minutes).
const demo_payment_session = table(
  { name: 'demo_payment_session', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    code: t.string().index('btree'),
    sprintId: t.u64().index('btree'),
    supporterIdentity: t.identity(),
    supporterUsername: t.string(),
    amount: t.u64(),
    optionIds: t.array(t.u64()),
    quantities: t.array(t.u32()),
    conditionLabel: t.string(),
    status: t.string(), // pending | committed | failed | cancelled | expired
    outcome: t.string(), // '' | committed | perk_taken | rejected | simulated_failure
    errorText: t.string(),
    createdAt: t.timestamp(),
    expiresAt: t.timestamp(),
    approvedAt: t.option(t.timestamp()),
    commitmentId: t.option(t.u64()),
    mockRef: t.string(),
    goalCrossed: t.bool(),
    committedAfter: t.u64(),
    supportersAfter: t.u32(),
  }
);

// Lightweight demo analytics. Public so the dashboard can show counts.
const event_log = table(
  { name: 'event_log', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    kind: t.string().index('btree'),
    sprintId: t.u64(),
    sessionCode: t.string(),
    identity: t.identity(),
    amount: t.u64(),
    createdAt: t.timestamp(),
  }
);

// Contact-form messages. Private; delivered by the email pump to the team inbox.
const contact_message = table(
  { name: 'contact_message' },
  {
    id: t.u64().primaryKey().autoInc(),
    identity: t.identity(),
    name: t.string(),
    email: t.string(),
    message: t.string(),
    status: t.string().index('btree'), // 'pending' | 'sent' | 'failed'
    attempts: t.u32(),
    lastError: t.string(),
    createdAt: t.timestamp(),
  }
);

// Private module configuration (owner identity captured at init).
const app_config = table(
  { name: 'app_config' },
  {
    key: t.string().primaryKey(),
    value: t.string(),
  }
);

const owner_identity = table(
  { name: 'owner_identity' },
  {
    id: t.u8().primaryKey(),
    identity: t.identity(),
  }
);

// Admin layer. Admins can edit site copy, block/delete people, and delete,
// close, extend or wipe listings. Bootstrapped with a code the owner sets.
const admin = table(
  { name: 'admin', public: true },
  {
    identity: t.identity().primaryKey(),
    username: t.string(),
    grantedAt: t.timestamp(),
  }
);

const blocked_user = table(
  { name: 'blocked_user', public: true },
  {
    identity: t.identity().primaryKey(),
    username: t.string(),
    reason: t.string(),
    blockedAt: t.timestamp(),
  }
);

// Editable site copy / flags. Public so every client renders the same text.
const site_config = table(
  { name: 'site_config', public: true },
  {
    key: t.string().primaryKey(),
    value: t.string(),
    updatedAt: t.timestamp(),
  }
);

const email_pump_timer = table(
  { name: 'email_pump_timer', scheduled: (): any => emailPump },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

const spacetimedb = schema({
  sprint,
  sprint_media,
  journey_entry,
  sprint_owner,
  allocation_item,
  builder_rating,
  interest,
  invite,
  commitment_item,
  support_option,
  support_commitment,
  final_result,
  sprint_close_timer,
  profile,
  participant_email,
  room_presence,
  email_outbox,
  app_config,
  owner_identity,
  email_pump_timer,
  admin,
  blocked_user,
  site_config,
  contact_message,
  demo_payment_session,
  event_log,
});
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

const MICROS_PER_SECOND = 1_000_000n;

function mockTransactionId(ctx: Ctx): string {
  const bytes = ctx.random.fill(new Uint8Array(6));
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `MOCK-${hex.toUpperCase()}`;
}

function scheduleClose(ctx: Ctx, sprintId: bigint, deadlineMicros: bigint) {
  ctx.db.sprint_close_timer.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(deadlineMicros),
    sprintId,
  });
}

function createSprintRow(
  ctx: Ctx,
  args: {
    title: string;
    description: string;
    nextStep: string;
    mediaUrl: string;
    builderName: string;
    builderBio?: string;
    goalAmount: bigint;
    durationSeconds: bigint;
    tagline?: string;
    category?: string;
    stage?: string;
    builderCity?: string;
    builderUsername?: string;
    fund?: [number, number, number, number];
    opensInSeconds?: bigint;
  }
) {
  const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
  const deadlineMicros = nowMicros + args.durationSeconds * MICROS_PER_SECOND;
  const row = ctx.db.sprint.insert({
    id: 0n,
    title: args.title,
    description: args.description,
    nextStep: args.nextStep,
    mediaUrl: args.mediaUrl,
    builderName: args.builderName,
    goalAmount: args.goalAmount,
    committedAmount: 0n,
    supporterCount: 0,
    deadline: new Timestamp(deadlineMicros),
    status: SPRINT_OPEN,
    createdAt: ctx.timestamp,
    peakPresence: 0,
    builderBio: (args.builderBio ?? '').trim(),
    reserveAmount: 0n,
    tagline: (args.tagline ?? '').trim(),
    category: args.category ?? 'other',
    stage: args.stage ?? 'prototype',
    builderCity: (args.builderCity ?? '').trim(),
    builderUsername: args.builderUsername ?? '',
    fundToolingPct: args.fund?.[0] ?? 0,
    fundComponentsPct: args.fund?.[1] ?? 0,
    fundCertPct: args.fund?.[2] ?? 0,
    fundBufferPct: args.fund?.[3] ?? 0,
    opensAt: new Timestamp(nowMicros + (args.opensInSeconds ?? 0n) * MICROS_PER_SECOND),
    interestCount: 0,
  });
  scheduleClose(ctx, row.id, deadlineMicros);
  ctx.db.sprint_owner.insert({ sprintId: row.id, identity: ctx.sender });
  return row;
}

// Publisher identity (spacetime login show). owner_identity is only populated
// by init on a fresh database, so the hex fallback keeps owner ops working
// on a database that was migrated in place.
const OWNER_HEX = 'c2008c52481d3ee6494e47e61ddea8c6c2bc81c307374de67c73f15b3391e2a6';

function requireOwner(ctx: Ctx) {
  const owner = ctx.db.owner_identity.id.find(0);
  const ok =
    (owner && owner.identity.equals(ctx.sender)) || ctx.sender.toHexString() === OWNER_HEX;
  if (!ok) throw new SenderError('UNAUTHORIZED: owner only.');
}

function isAdminIdentity(ctx: Ctx, who: Identity): boolean {
  const owner = ctx.db.owner_identity.id.find(0);
  if (owner && owner.identity.equals(who)) return true;
  if (who.toHexString() === OWNER_HEX) return true;
  return !!ctx.db.admin.identity.find(who);
}

function isAdmin(ctx: Ctx): boolean {
  return isAdminIdentity(ctx, ctx.sender);
}

function requireAdmin(ctx: Ctx) {
  if (!isAdmin(ctx)) throw new SenderError('UNAUTHORIZED: admin only.');
}

function requireNotBlocked(ctx: Ctx) {
  const b = ctx.db.blocked_user.identity.find(ctx.sender);
  if (b) throw new SenderError('BLOCKED: This account has been blocked by an admin.' + (b.reason ? ' ' + b.reason : ''));
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export const init = spacetimedb.init(ctx => {
  ctx.db.owner_identity.insert({ id: 0, identity: ctx.sender });
  // Seed one sprint so the app is never empty on first publish.
  const s = createSprintRow(ctx, {
    title: 'Card Game Pilot',
    description:
      'A working tabletop card game prototype, playtested with 40+ people. ' +
      'Every card, rule and layout already exists and has been played.',
    nextStep:
      'Print a 50-deck pilot run at a real card printer to hand to shops and playtest groups.',
    mediaUrl: '',
    builderName: 'Lakshveer',
    goalAmount: 10_000n,
    durationSeconds: 30n * 60n,
  });
  ctx.db.support_option.insert({
    id: 0n,
    sprintId: s.id,
    title: 'Pilot deck',
    description: 'One deck from the first pilot print run, signed.',
    slotsTotal: 1,
    slotsClaimed: 0,
    minAmount: 0n,
  });
  ctx.db.support_option.insert({
    id: 0n,
    sprintId: s.id,
    title: 'Name in the rulebook',
    description: 'Your name printed in the thanks section of the pilot rulebook.',
    slotsTotal: undefined,
    slotsClaimed: 0,
    minAmount: 0n,
  });
});

export const onConnect = spacetimedb.clientConnected(_ctx => {
  // Presence is created by enter_sprint, not on raw connect.
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  if (ctx.connectionId) {
    ctx.db.room_presence.connectionId.delete(ctx.connectionId);
  }
});

const CATEGORIES = ['water', 'agri', 'health', 'recycle', 'mobility', 'robotics', 'energy', 'other'];
const STAGES = ['sketch', 'prototype', 'pilot', 'shipping'];

function usernameValid(u: string): boolean {
  return /^[a-z0-9_]{1,24}$/.test(u);
}

function findProfileByUsername(ctx: Ctx, username: string) {
  for (const p of ctx.db.profile.iter()) if (p.username === username) return p;
  return null;
}

type Line = { optionId: bigint; qty: number };

function isSprintOwner(ctx: Ctx, sprintId: bigint): boolean {
  const o = ctx.db.sprint_owner.sprintId.find(sprintId);
  return (!!o && o.identity.equals(ctx.sender)) || isAdmin(ctx);
}

// Hard removal of a sprint and every row that hangs off it.
function purgeSprint(ctx: Ctx, sprintId: bigint) {
  for (const r of [...ctx.db.sprint_media.iter()]) if (r.sprintId === sprintId) ctx.db.sprint_media.id.delete(r.id);
  for (const r of [...ctx.db.journey_entry.iter()]) if (r.sprintId === sprintId) ctx.db.journey_entry.id.delete(r.id);
  for (const r of [...ctx.db.allocation_item.iter()]) if (r.sprintId === sprintId) ctx.db.allocation_item.id.delete(r.id);
  for (const r of [...ctx.db.builder_rating.iter()]) if (r.sprintId === sprintId) ctx.db.builder_rating.id.delete(r.id);
  for (const r of [...ctx.db.interest.iter()]) if (r.sprintId === sprintId) ctx.db.interest.id.delete(r.id);
  for (const r of [...ctx.db.invite.iter()]) if (r.sprintId === sprintId) ctx.db.invite.id.delete(r.id);
  for (const c of [...ctx.db.support_commitment.iter()]) {
    if (c.sprintId !== sprintId) continue;
    for (const r of [...ctx.db.commitment_item.iter()]) if (r.commitmentId === c.id) ctx.db.commitment_item.id.delete(r.id);
    ctx.db.support_commitment.id.delete(c.id);
  }
  for (const r of [...ctx.db.support_option.iter()]) if (r.sprintId === sprintId) ctx.db.support_option.id.delete(r.id);
  for (const r of [...ctx.db.room_presence.iter()]) if (r.sprintId === sprintId) ctx.db.room_presence.connectionId.delete(r.connectionId);
  for (const r of [...ctx.db.sprint_close_timer.iter()]) if (r.sprintId === sprintId) ctx.db.sprint_close_timer.scheduledId.delete(r.scheduledId);
  if (ctx.db.sprint_owner.sprintId.find(sprintId)) ctx.db.sprint_owner.sprintId.delete(sprintId);
  if (ctx.db.final_result.sprintId.find(sprintId)) ctx.db.final_result.sprintId.delete(sprintId);
  if (ctx.db.sprint.id.find(sprintId)) ctx.db.sprint.id.delete(sprintId);
}

// Hard removal of a person: profile, private email, presence, interests,
// ratings they gave, invites they sent or received. Commitments stay as
// anonymous history.
function purgeUser(ctx: Ctx, who: Identity, username: string) {
  if (ctx.db.profile.identity.find(who)) ctx.db.profile.identity.delete(who);
  if (ctx.db.participant_email.identity.find(who)) ctx.db.participant_email.identity.delete(who);
  for (const r of [...ctx.db.room_presence.iter()]) if (r.identity.equals(who)) ctx.db.room_presence.connectionId.delete(r.connectionId);
  for (const r of [...ctx.db.interest.iter()]) if (r.identity.equals(who)) ctx.db.interest.id.delete(r.id);
  for (const r of [...ctx.db.builder_rating.iter()]) if (r.raterIdentity.equals(who)) ctx.db.builder_rating.id.delete(r.id);
  if (username) for (const r of [...ctx.db.invite.iter()]) if (r.invitedByUsername === username || r.invitedUsername === username) ctx.db.invite.id.delete(r.id);
}

// Shared by commit_support (single perk) and place_bid (cart). Runs inside
// the caller's transaction: every check and write commits together or not at all.
type CommitResult = { commitmentId: bigint; mockRef: string; goalCrossed: boolean; committedAmount: bigint; goalAmount: bigint; supporterCount: number };

// `backer` is normally ctx.sender; for demo UPI approval it is the session's
// supporter (the approving phone is a different identity).
function applyCommitment(ctx: Ctx, backer: Identity, sprintId: bigint, amount: bigint, lines: Line[]): CommitResult {
  const s = ctx.db.sprint.id.find(sprintId);
  if (!s) throw new SenderError('SPRINT_NOT_FOUND: This sprint does not exist.');
  if (s.status === SPRINT_CLOSED || s.status === SPRINT_ARCHIVED) {
    throw new SenderError('SPRINT_CLOSED: This sprint has ended.');
  }
  const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
  if (nowMicros >= s.deadline.microsSinceUnixEpoch) {
    throw new SenderError('SPRINT_CLOSED: This sprint has ended.');
  }
  if (nowMicros < s.opensAt.microsSinceUnixEpoch) {
    throw new SenderError('NOT_OPEN: Backing has not opened yet. Show interest and come back when it goes live.');
  }
  if (amount <= 0n) throw new SenderError('BAD_AMOUNT: Amount must be a positive whole number.');
  if (amount > 10_000_000n) throw new SenderError('BAD_AMOUNT: Amount is too large for this MVP.');
  const blocked = ctx.db.blocked_user.identity.find(backer);
  if (blocked) throw new SenderError('BLOCKED: This account has been blocked by an admin.');
  const backerProfile = ctx.db.profile.identity.find(backer);
  if (!backerProfile || !backerProfile.username) {
    throw new SenderError('NO_USERNAME: Claim a username before backing a sprint.');
  }
  const owner = ctx.db.sprint_owner.sprintId.find(sprintId);
  if (owner && owner.identity.equals(backer)) {
    throw new SenderError('OWN_SPRINT: You listed this build — you can\'t back your own sprint.');
  }

  // Perk checks (all before any write).
  const options = [] as { option: ReturnType<typeof ctx.db.support_option.id.find> & object; qty: number }[];
  let minTotal = 0n;
  for (const line of lines) {
    if (line.qty < 1 || line.qty > 100) throw new SenderError('BAD_QUANTITY: Choose between 1 and 100 of a perk.');
    const option = ctx.db.support_option.id.find(line.optionId);
    if (!option || option.sprintId !== sprintId) {
      throw new SenderError('PERK_NOT_FOUND: That perk does not belong to this sprint.');
    }
    if (option.slotsTotal !== undefined && option.slotsTotal !== null) {
      const left = option.slotsTotal - option.slotsClaimed;
      if (left <= 0) {
        throw new SenderError(
          'PERK_TAKEN: That perk was just claimed by someone else. Choose another option or support without one.'
        );
      }
      if (line.qty > left) {
        throw new SenderError(
          `PERK_SHORT: Only ${left} of "${option.title}" ${left === 1 ? 'is' : 'are'} left. Lower the quantity or choose another option.`
        );
      }
    }
    minTotal += option.minAmount * BigInt(line.qty);
    options.push({ option, qty: line.qty });
  }
  if (amount < minTotal) {
    throw new SenderError(`BAD_AMOUNT: Those perks need at least ₹${minTotal}.`);
  }

  const room = s.goalAmount > s.committedAmount ? s.goalAmount - s.committedAmount : 0n;
  const towardGoal = amount < room ? amount : room;
  const toReserve = amount - towardGoal;
  const mockRef = mockTransactionId(ctx);
  const first = options[0];
  const commitment = ctx.db.support_commitment.insert({
    id: 0n,
    sprintId,
    identity: backer,
    amount,
    supportOptionId: first ? first.option.id : undefined,
    mockTransactionId: mockRef,
    createdAt: ctx.timestamp,
    quantity: first ? first.qty : 0,
    reserveAmount: toReserve,
  });
  for (const { option, qty } of options) {
    ctx.db.support_option.id.update({ ...option, slotsClaimed: option.slotsClaimed + qty });
    ctx.db.commitment_item.insert({ id: 0n, commitmentId: commitment.id, supportOptionId: option.id, quantity: qty });
  }
  const committedAmount = s.committedAmount + towardGoal;
  const goalCrossed = s.committedAmount < s.goalAmount && committedAmount >= s.goalAmount;
  ctx.db.sprint.id.update({
    ...s,
    committedAmount,
    reserveAmount: s.reserveAmount + toReserve,
    supporterCount: s.supporterCount + 1,
    status: committedAmount >= s.goalAmount ? SPRINT_FUNDED_STILL_OPEN : s.status,
  });

  // Mock receipt email, decoupled: only queued here, never sent from a reducer.
  const pe = ctx.db.participant_email.identity.find(backer);
  if (pe) {
    ctx.db.email_outbox.insert({
      id: 0n,
      identity: backer,
      toEmail: pe.email,
      toName: backerProfile.displayName,
      sprintId,
      kind: 'receipt',
      status: 'pending',
      attempts: 0,
      lastError: '',
      createdAt: ctx.timestamp,
      amount,
      perkTitle: options.map(o => `${o.qty} × ${o.option.title}`).join(', '),
      mockRef,
    });
  }
  return { commitmentId: commitment.id, mockRef, goalCrossed, committedAmount, goalAmount: s.goalAmount, supporterCount: s.supporterCount + 1 };
}

// ---------------------------------------------------------------------------
// Hero reducer: commit_support
// ---------------------------------------------------------------------------

export const commitSupport = spacetimedb.reducer(
  {
    sprintId: t.u64(),
    amount: t.u64(),
    supportOptionId: t.option(t.u64()),
    quantity: t.u32(),
  },
  (ctx, { sprintId, amount, supportOptionId, quantity }) => {
    const lines: Line[] =
      supportOptionId !== undefined && supportOptionId !== null ? [{ optionId: supportOptionId, qty: quantity }] : [];
    requireNotBlocked(ctx);
    applyCommitment(ctx, ctx.sender, sprintId, amount, lines);
  }
);

// Cart-style commitment: several perks with quantities in one atomic claim.
export const placeBid = spacetimedb.reducer(
  { sprintId: t.u64(), amount: t.u64(), optionIds: t.array(t.u64()), quantities: t.array(t.u32()) },
  (ctx, { sprintId, amount, optionIds, quantities }) => {
    if (optionIds.length !== quantities.length || optionIds.length > 10) {
      throw new SenderError('BAD_CART: Perk ids and quantities must match (max 10).');
    }
    requireNotBlocked(ctx);
    applyCommitment(ctx, ctx.sender, sprintId, amount, cartLines(optionIds, quantities));
  }
);

function cartLines(optionIds: readonly bigint[], quantities: readonly number[]): Line[] {
  const seen = new Set<string>();
  return optionIds.map((optionId, i) => {
    const k = String(optionId);
    if (seen.has(k)) throw new SenderError('BAD_CART: Duplicate perk in cart.');
    seen.add(k);
    return { optionId, qty: quantities[i] };
  });
}

// ---------------------------------------------------------------------------
// Demo UPI payment sessions — cross-device simulated approval. No real money.
// ---------------------------------------------------------------------------

const SESSION_TTL_MICROS = 5n * 60n * MICROS_PER_SECOND;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function sessionCode(ctx: Ctx): string {
  const bytes = ctx.random.fill(new Uint8Array(8));
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `BF-UPI-${out}`;
}

function findSession(ctx: Ctx, code: string) {
  for (const s of ctx.db.demo_payment_session.code.filter(code)) return s;
  return null;
}

function logEvent(ctx: Ctx, kind: string, sprintId: bigint, sessionCode: string, amount: bigint) {
  ctx.db.event_log.insert({ id: 0n, kind, sprintId, sessionCode, identity: ctx.sender, amount, createdAt: ctx.timestamp });
}

// Step 1: the supporter's own device creates the session. Everything is
// validated here but NOTHING is claimed or counted until approval.
export const createDemoPaymentSession = spacetimedb.reducer(
  { sprintId: t.u64(), amount: t.u64(), optionIds: t.array(t.u64()), quantities: t.array(t.u32()) },
  (ctx, { sprintId, amount, optionIds, quantities }) => {
    requireNotBlocked(ctx);
    if (optionIds.length !== quantities.length || optionIds.length > 10) throw new SenderError('BAD_CART: Perk ids and quantities must match (max 10).');
    const lines = cartLines(optionIds, quantities);
    const s = ctx.db.sprint.id.find(sprintId);
    if (!s) throw new SenderError('SPRINT_NOT_FOUND: This sprint does not exist.');
    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    if (s.status === SPRINT_CLOSED || s.status === SPRINT_ARCHIVED || nowMicros >= s.deadline.microsSinceUnixEpoch) throw new SenderError('SPRINT_CLOSED: This sprint has ended.');
    if (nowMicros < s.opensAt.microsSinceUnixEpoch) throw new SenderError('NOT_OPEN: Backing has not opened yet.');
    if (amount <= 0n || amount > 10_000_000n) throw new SenderError('BAD_AMOUNT: Amount must be a positive whole number.');
    const me = ctx.db.profile.identity.find(ctx.sender);
    if (!me || !me.username) throw new SenderError('NO_USERNAME: Claim a username before backing a sprint.');
    const owner = ctx.db.sprint_owner.sprintId.find(sprintId);
    if (owner && owner.identity.equals(ctx.sender)) throw new SenderError("OWN_SPRINT: You listed this build — you can't back your own sprint.");
    let minTotal = 0n;
    const titles: string[] = [];
    for (const line of lines) {
      const o = ctx.db.support_option.id.find(line.optionId);
      if (!o || o.sprintId !== sprintId) throw new SenderError('PERK_NOT_FOUND: That option does not belong to this sprint.');
      if (line.qty < 1 || line.qty > 100) throw new SenderError('BAD_QUANTITY');
      if (o.slotsTotal !== undefined && o.slotsTotal !== null && o.slotsTotal - o.slotsClaimed < line.qty) {
        throw new SenderError(`PERK_TAKEN: "${o.title}" is no longer available in that quantity.`);
      }
      minTotal += o.minAmount * BigInt(line.qty);
      titles.push(line.qty > 1 ? `${line.qty} × ${o.title}` : o.title);
    }
    if (amount < minTotal) throw new SenderError(`BAD_AMOUNT: Those options need at least ₹${minTotal}.`);
    // One live session per supporter per sprint: older pending ones are cancelled.
    for (const old of [...ctx.db.demo_payment_session.sprintId.filter(sprintId)]) {
      if (old.supporterIdentity.equals(ctx.sender) && old.status === 'pending') ctx.db.demo_payment_session.id.update({ ...old, status: 'cancelled' });
    }
    const code = sessionCode(ctx);
    ctx.db.demo_payment_session.insert({
      id: 0n,
      code,
      sprintId,
      supporterIdentity: ctx.sender,
      supporterUsername: me.username,
      amount,
      optionIds: [...optionIds],
      quantities: [...quantities],
      conditionLabel: titles.join(', '),
      status: 'pending',
      outcome: '',
      errorText: '',
      createdAt: ctx.timestamp,
      expiresAt: new Timestamp(nowMicros + SESSION_TTL_MICROS),
      approvedAt: undefined,
      commitmentId: undefined,
      mockRef: '',
      goalCrossed: false,
      committedAfter: 0n,
      supportersAfter: 0,
    });
    logEvent(ctx, 'payment_session_created', sprintId, code, amount);
  }
);

// Step 2: whoever holds the session code (the scanning phone, or the same
// device) approves. Idempotent: a committed session returns as-is. The real
// commitment, slot claim, totals and events all happen in this one transaction.
export const approveDemoPayment = spacetimedb.reducer({ code: t.string() }, (ctx, { code }) => {
  const sess = findSession(ctx, code.trim().toUpperCase());
  if (!sess) throw new SenderError('SESSION_NOT_FOUND: That payment session does not exist.');
  if (sess.status === 'committed') return; // already done — idempotent
  if (sess.status !== 'pending') throw new SenderError(`SESSION_${sess.status.toUpperCase()}: This payment session is ${sess.status}.`);
  const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
  if (nowMicros >= sess.expiresAt.microsSinceUnixEpoch) {
    ctx.db.demo_payment_session.id.update({ ...sess, status: 'expired' });
    return;
  }
  logEvent(ctx, 'payment_demo_approved', sess.sprintId, sess.code, sess.amount);
  const lines = cartLines(sess.optionIds, sess.quantities);
  // Limited-slot race: check inside this same transaction, record the loss on
  // the session instead of throwing so both devices can render it.
  for (const line of lines) {
    const o = ctx.db.support_option.id.find(line.optionId);
    if (o && o.slotsTotal !== undefined && o.slotsTotal !== null && o.slotsTotal - o.slotsClaimed < line.qty) {
      ctx.db.demo_payment_session.id.update({ ...sess, status: 'failed', outcome: 'perk_taken', errorText: `Someone else secured the last "${o.title}" while you were confirming.` });
      logEvent(ctx, 'support_option_contention_failed', sess.sprintId, sess.code, sess.amount);
      return;
    }
  }
  let result: CommitResult;
  try {
    result = applyCommitment(ctx, sess.supporterIdentity, sess.sprintId, sess.amount, lines);
  } catch (e) {
    // Validation failures happen before any write in applyCommitment, so it is
    // safe to record the failure and commit this transaction.
    const msg = e instanceof Error ? e.message : String(e);
    ctx.db.demo_payment_session.id.update({ ...sess, status: 'failed', outcome: 'rejected', errorText: msg.includes(': ') ? msg.slice(msg.indexOf(': ') + 2) : msg });
    return;
  }
  ctx.db.demo_payment_session.id.update({
    ...sess,
    status: 'committed',
    outcome: 'committed',
    approvedAt: ctx.timestamp,
    commitmentId: result.commitmentId,
    mockRef: result.mockRef,
    goalCrossed: result.goalCrossed,
    committedAfter: result.committedAmount,
    supportersAfter: result.supporterCount,
  });
  logEvent(ctx, 'support_committed', sess.sprintId, sess.code, sess.amount);
  if (lines.length) logEvent(ctx, 'support_option_claimed', sess.sprintId, sess.code, sess.amount);
  if (result.goalCrossed) logEvent(ctx, 'goal_crossed', sess.sprintId, sess.code, sess.amount);
});

// Demo failure path / cancel. Nothing is committed, nothing is claimed.
export const failDemoPayment = spacetimedb.reducer({ code: t.string() }, (ctx, { code }) => {
  const sess = findSession(ctx, code.trim().toUpperCase());
  if (!sess) throw new SenderError('SESSION_NOT_FOUND');
  if (sess.status !== 'pending') return;
  ctx.db.demo_payment_session.id.update({ ...sess, status: 'failed', outcome: 'simulated_failure', errorText: 'Payment not completed (simulated failure).' });
  logEvent(ctx, 'payment_demo_failed', sess.sprintId, sess.code, sess.amount);
});

export const cancelDemoPayment = spacetimedb.reducer({ code: t.string() }, (ctx, { code }) => {
  const sess = findSession(ctx, code.trim().toUpperCase());
  if (!sess) throw new SenderError('SESSION_NOT_FOUND');
  if (sess.status !== 'pending') return;
  ctx.db.demo_payment_session.id.update({ ...sess, status: 'cancelled' });
  logEvent(ctx, 'payment_session_cancelled', sess.sprintId, sess.code, sess.amount);
});

// Client-side analytics hook for events the server can't see itself.
export const recordEvent = spacetimedb.reducer({ kind: t.string(), sprintId: t.u64(), sessionCode: t.string() }, (ctx, { kind, sprintId, sessionCode }) => {
  const k = kind.trim();
  if (!['payment_session_opened', 'share_clicked'].includes(k)) throw new SenderError('BAD_EVENT');
  logEvent(ctx, k, sprintId, sessionCode.trim().slice(0, 32), 0n);
});

// ---------------------------------------------------------------------------
// Scheduled: close_sprint — fires at deadline, locks the final state.
// ---------------------------------------------------------------------------

export const closeSprint = spacetimedb.reducer(
  { timer: sprint_close_timer.rowType },
  (ctx, { timer }) => {
    const s = ctx.db.sprint.id.find(timer.sprintId);
    if (!s) return;
    if (s.status === SPRINT_CLOSED || s.status === SPRINT_ARCHIVED) return;
    // Re-check genuine expiry; if fired early for any reason, reschedule.
    if (ctx.timestamp.microsSinceUnixEpoch < s.deadline.microsSinceUnixEpoch) {
      scheduleClose(ctx, s.id, s.deadline.microsSinceUnixEpoch);
      return;
    }
    if (!ctx.db.final_result.sprintId.find(s.id)) {
      ctx.db.final_result.insert({
        sprintId: s.id,
        finalCommittedAmount: s.committedAmount,
        finalSupporterCount: s.supporterCount,
        closedAt: ctx.timestamp,
      });
    }
    ctx.db.sprint.id.update({ ...s, status: SPRINT_CLOSED });
  }
);

// ---------------------------------------------------------------------------
// Create a sprint (Phase 4 form; also handy for demos/resets).
// ---------------------------------------------------------------------------

export const createSprint = spacetimedb.reducer(
  {
    title: t.string(),
    description: t.string(),
    nextStep: t.string(),
    mediaUrl: t.string(),
    builderName: t.string(),
    goalAmount: t.u64(),
    durationSeconds: t.u64(),
    perkTitles: t.array(t.string()),
    perkDescriptions: t.array(t.string()),
    perkSlots: t.array(t.u32()), // 0 = unlimited
    builderBio: t.string(),
    imageThumbs: t.array(t.string()), // data URLs, small
    imageFulls: t.array(t.string()), // data URLs, larger
  },
  (ctx, args) => {
    if (args.title.trim().length === 0) throw new SenderError('Title is required.');
    if (args.goalAmount <= 0n) throw new SenderError('Goal must be a positive whole number.');
    if (args.durationSeconds < 60n || args.durationSeconds > 7n * 24n * 3600n) {
      throw new SenderError('Duration must be between 1 minute and 7 days.');
    }
    if (
      args.perkTitles.length !== args.perkDescriptions.length ||
      args.perkTitles.length !== args.perkSlots.length ||
      args.perkTitles.length > 3
    ) {
      throw new SenderError('Provide 0-3 perks with matching titles, descriptions and slots.');
    }
    if (args.imageThumbs.length !== args.imageFulls.length || args.imageThumbs.length > 4) {
      throw new SenderError('Up to 4 images, with matching thumbnails.');
    }
    for (const img of args.imageFulls) {
      if (img.length > 400_000) throw new SenderError('An image is too large after compression.');
    }
    const mediaUrl = args.imageThumbs.length > 0 ? args.imageThumbs[0] : args.mediaUrl;
    const s = createSprintRow(ctx, { ...args, mediaUrl });
    for (let i = 0; i < args.imageFulls.length; i++) {
      ctx.db.sprint_media.insert({
        id: 0n,
        sprintId: s.id,
        position: i,
        thumb: args.imageThumbs[i],
        full: args.imageFulls[i],
      });
    }
    for (let i = 0; i < args.perkTitles.length; i++) {
      if (args.perkTitles[i].trim().length === 0) continue;
      ctx.db.support_option.insert({
        id: 0n,
        sprintId: s.id,
        title: args.perkTitles[i],
        description: args.perkDescriptions[i],
        slotsTotal: args.perkSlots[i] > 0 ? args.perkSlots[i] : undefined,
        slotsClaimed: 0,
        minAmount: 0n,
      });
    }
  }
);

// Owner only: fix a sprint's copy/media after creation (never touches money).
export const updateSprintDetails = spacetimedb.reducer(
  { sprintId: t.u64(), description: t.string(), nextStep: t.string(), mediaUrl: t.string() },
  (ctx, { sprintId, description, nextStep, mediaUrl }) => {
    requireOwner(ctx);
    const s = ctx.db.sprint.id.find(sprintId);
    if (!s) throw new SenderError('SPRINT_NOT_FOUND');
    ctx.db.sprint.id.update({
      ...s,
      description: description.trim(),
      nextStep: nextStep.trim(),
      mediaUrl: mediaUrl.trim(),
    });
  }
);

// Full listing form: product fields, fund allocation, perks with min amounts, journey.
export const createSprintV2 = spacetimedb.reducer(
  {
    title: t.string(),
    tagline: t.string(),
    description: t.string(),
    nextStep: t.string(),
    builderName: t.string(),
    builderBio: t.string(),
    builderCity: t.string(),
    category: t.string(),
    stage: t.string(),
    goalAmount: t.u64(),
    durationSeconds: t.u64(),
    opensInSeconds: t.u64(),
    fundPct: t.array(t.u8()), // [tooling, components, cert, buffer] summing to 100
    perkTitles: t.array(t.string()),
    perkDescriptions: t.array(t.string()),
    perkSlots: t.array(t.u32()), // 0 = unlimited
    perkMinAmounts: t.array(t.u64()),
    journeyDates: t.array(t.string()),
    journeyTexts: t.array(t.string()),
    imageThumbs: t.array(t.string()),
    imageFulls: t.array(t.string()),
    extraAllocLabels: t.array(t.string()),
    extraAllocPcts: t.array(t.u8()),
  },
  (ctx, a) => {
    if (a.title.trim().length === 0) throw new SenderError('Title is required.');
    if (a.goalAmount <= 0n) throw new SenderError('Goal must be a positive whole number.');
    if (a.durationSeconds < 60n || a.durationSeconds > 30n * 24n * 3600n) {
      throw new SenderError('Duration must be between 1 minute and 30 days.');
    }
    if (a.opensInSeconds > 30n * 24n * 3600n) throw new SenderError('Opening time must be within 30 days.');
    if (!CATEGORIES.includes(a.category)) throw new SenderError('Pick a category.');
    if (!STAGES.includes(a.stage)) throw new SenderError('Pick a stage.');
    if (a.extraAllocLabels.length !== a.extraAllocPcts.length || a.extraAllocLabels.length > 6) {
      throw new SenderError('Up to 6 extra allocation lines with matching labels and percentages.');
    }
    const extraSum = a.extraAllocPcts.reduce((x, y) => x + y, 0);
    if (a.fundPct.length !== 4 || a.fundPct.reduce((x, y) => x + y, 0) + extraSum !== 100) {
      throw new SenderError('Fund allocation must add up to exactly 100%.');
    }
    const n = a.perkTitles.length;
    if (n !== a.perkDescriptions.length || n !== a.perkSlots.length || n !== a.perkMinAmounts.length || n > 5) {
      throw new SenderError('Provide up to 5 perks with matching titles, descriptions, slots and amounts.');
    }
    if (a.journeyDates.length !== a.journeyTexts.length || a.journeyDates.length > 12) {
      throw new SenderError('Provide up to 12 journey milestones with dates.');
    }
    if (a.imageThumbs.length !== a.imageFulls.length || a.imageThumbs.length > 5) {
      throw new SenderError('Up to 5 images, with matching thumbnails.');
    }
    for (const img of a.imageFulls) {
      if (img.length > 400_000) throw new SenderError('An image is too large after compression.');
    }
    const prof = ctx.db.profile.identity.find(ctx.sender);
    requireNotBlocked(ctx);
    if (!prof || !prof.username) throw new SenderError('NO_USERNAME: Claim a username before listing a product.');
    const s = createSprintRow(ctx, {
      title: a.title,
      description: a.description,
      nextStep: a.nextStep,
      mediaUrl: a.imageThumbs[0] ?? '',
      builderName: a.builderName,
      builderBio: a.builderBio,
      goalAmount: a.goalAmount,
      durationSeconds: a.opensInSeconds + a.durationSeconds,
      tagline: a.tagline,
      category: a.category,
      stage: a.stage,
      builderCity: a.builderCity,
      builderUsername: prof?.username ?? '',
      fund: [a.fundPct[0], a.fundPct[1], a.fundPct[2], a.fundPct[3]],
      opensInSeconds: a.opensInSeconds,
    });
    for (let i = 0; i < a.imageFulls.length; i++) {
      ctx.db.sprint_media.insert({ id: 0n, sprintId: s.id, position: i, thumb: a.imageThumbs[i], full: a.imageFulls[i] });
    }
    for (let i = 0; i < n; i++) {
      if (a.perkTitles[i].trim().length === 0) continue;
      ctx.db.support_option.insert({
        id: 0n,
        sprintId: s.id,
        title: a.perkTitles[i],
        description: a.perkDescriptions[i],
        slotsTotal: a.perkSlots[i] > 0 ? a.perkSlots[i] : undefined,
        slotsClaimed: 0,
        minAmount: a.perkMinAmounts[i],
      });
    }
    for (let i = 0; i < a.journeyDates.length; i++) {
      if (a.journeyTexts[i].trim().length === 0) continue;
      ctx.db.journey_entry.insert({ id: 0n, sprintId: s.id, position: i, entryDate: a.journeyDates[i], text: a.journeyTexts[i] });
    }
    for (let i = 0; i < a.extraAllocLabels.length; i++) {
      if (a.extraAllocLabels[i].trim().length === 0 || a.extraAllocPcts[i] === 0) continue;
      ctx.db.allocation_item.insert({ id: 0n, sprintId: s.id, label: a.extraAllocLabels[i].trim().slice(0, 40), pct: a.extraAllocPcts[i] });
    }
  }
);

// Builder edits their own listing copy (money and timing are never editable).
export const updateSprint = spacetimedb.reducer(
  {
    sprintId: t.u64(),
    title: t.string(),
    tagline: t.string(),
    description: t.string(),
    nextStep: t.string(),
    builderName: t.string(),
    builderBio: t.string(),
    builderCity: t.string(),
    category: t.string(),
    stage: t.string(),
  },
  (ctx, a) => {
    const s = ctx.db.sprint.id.find(a.sprintId);
    if (!s) throw new SenderError('SPRINT_NOT_FOUND');
    if (!isSprintOwner(ctx, a.sprintId)) throw new SenderError('NOT_YOURS: Only the builder can edit this listing.');
    if (a.title.trim().length === 0) throw new SenderError('Title is required.');
    if (!CATEGORIES.includes(a.category)) throw new SenderError('Pick a category.');
    if (!STAGES.includes(a.stage)) throw new SenderError('Pick a stage.');
    ctx.db.sprint.id.update({
      ...s,
      title: a.title.trim().slice(0, 80),
      tagline: a.tagline.trim().slice(0, 120),
      description: a.description.trim().slice(0, 1200),
      nextStep: a.nextStep.trim().slice(0, 400),
      builderName: a.builderName.trim().slice(0, 40),
      builderBio: a.builderBio.trim().slice(0, 600),
      builderCity: a.builderCity.trim().slice(0, 80),
      category: a.category,
      stage: a.stage,
    });
  }
);

// Builder removes their listing from the wall. Rows are kept (supporters'
// history and emails reference them); the sprint stops accepting support.
export const deleteSprint = spacetimedb.reducer({ sprintId: t.u64() }, (ctx, { sprintId }) => {
  const s = ctx.db.sprint.id.find(sprintId);
  if (!s) throw new SenderError('SPRINT_NOT_FOUND');
  if (!isSprintOwner(ctx, sprintId)) throw new SenderError('NOT_YOURS: Only the builder can delete this listing.');
  ctx.db.sprint.id.update({ ...s, status: SPRINT_ARCHIVED });
});

// Supporter removes their account: profile, private email, presence,
// interests and ratings go. Commitments stay as anonymous history.
export const deleteAccount = spacetimedb.reducer(ctx => {
  const me = ctx.db.profile.identity.find(ctx.sender);
  if (me) ctx.db.profile.identity.delete(ctx.sender);
  if (ctx.db.participant_email.identity.find(ctx.sender)) ctx.db.participant_email.identity.delete(ctx.sender);
  for (const r of [...ctx.db.room_presence.iter()]) if (r.identity.equals(ctx.sender)) ctx.db.room_presence.connectionId.delete(r.connectionId);
  for (const r of [...ctx.db.interest.iter()]) if (r.identity.equals(ctx.sender)) ctx.db.interest.id.delete(r.id);
  for (const r of [...ctx.db.builder_rating.iter()]) if (r.raterIdentity.equals(ctx.sender)) ctx.db.builder_rating.id.delete(r.id);
});

// Supporters rate the builder of a sprint they backed. 1-5 stars, upsert.
export const rateBuilder = spacetimedb.reducer({ sprintId: t.u64(), stars: t.u8() }, (ctx, { sprintId, stars }) => {
  requireNotBlocked(ctx);
  if (stars < 1 || stars > 5) throw new SenderError('BAD_RATING: Choose 1 to 5 stars.');
  const owner = ctx.db.sprint_owner.sprintId.find(sprintId);
  if (!owner) throw new SenderError('NO_BUILDER: This listing has no builder account to rate.');
  if (owner.identity.equals(ctx.sender)) throw new SenderError('SELF: You can\'t rate yourself.');
  let backed = false;
  for (const c of ctx.db.support_commitment.sprintId.filter(sprintId)) {
    if (c.identity.equals(ctx.sender)) {
      backed = true;
      break;
    }
  }
  if (!backed) throw new SenderError('NOT_BACKED: Back this build before rating the builder.');
  for (const r of ctx.db.builder_rating.builderIdentity.filter(owner.identity)) {
    if (r.raterIdentity.equals(ctx.sender)) {
      ctx.db.builder_rating.id.update({ ...r, stars, sprintId, createdAt: ctx.timestamp });
      return;
    }
  }
  ctx.db.builder_rating.insert({ id: 0n, builderIdentity: owner.identity, raterIdentity: ctx.sender, sprintId, stars, createdAt: ctx.timestamp });
});

// Claim a unique handle, tied to this identity. Once per identity.
export const claimUsername = spacetimedb.reducer({ username: t.string() }, (ctx, { username }) => {
  requireNotBlocked(ctx);
  const u = username.trim().toLowerCase();
  if (!usernameValid(u)) throw new SenderError('BAD_USERNAME: Usernames are 1-24 characters, letters/numbers/underscore only.');
  const me = ctx.db.profile.identity.find(ctx.sender);
  if (!me) throw new SenderError('NOT_REGISTERED: Enter the sprint (name + email) first.');
  if (me.username) throw new SenderError('ALREADY_CLAIMED: You already claimed @' + me.username + '.');
  if (findProfileByUsername(ctx, u)) throw new SenderError('TAKEN: That username is taken.');
  ctx.db.profile.identity.update({ ...me, username: u });
});

export const saveProfile = spacetimedb.reducer(
  {
    displayName: t.string(),
    bio: t.string(),
    contact: t.string(),
    location: t.string(),
    socialX: t.string(),
    socialLinkedin: t.string(),
    socialInstagram: t.string(),
  },
  (ctx, a) => {
    const me = ctx.db.profile.identity.find(ctx.sender);
    if (!me) throw new SenderError('NOT_REGISTERED: Enter the sprint (name + email) first.');
    const name = a.displayName.trim();
    if (name.length < 1 || name.length > 40) throw new SenderError('BAD_NAME: Name must be 1-40 characters.');
    ctx.db.profile.identity.update({
      ...me,
      displayName: name,
      bio: a.bio.trim().slice(0, 600),
      contact: a.contact.trim().slice(0, 120),
      location: a.location.trim().slice(0, 80),
      socialX: a.socialX.trim().slice(0, 120),
      socialLinkedin: a.socialLinkedin.trim().slice(0, 200),
      socialInstagram: a.socialInstagram.trim().slice(0, 120),
    });
  }
);

// 👍 toggle. Identity-keyed so nobody can inflate it; count cached on the sprint.
export const toggleInterest = spacetimedb.reducer({ sprintId: t.u64() }, (ctx, { sprintId }) => {
  const s = ctx.db.sprint.id.find(sprintId);
  if (!s) throw new SenderError('SPRINT_NOT_FOUND');
  let existing: { id: bigint } | null = null;
  for (const r of ctx.db.interest.sprintId.filter(sprintId)) {
    if (r.identity.equals(ctx.sender)) {
      existing = r;
      break;
    }
  }
  if (existing) {
    ctx.db.interest.id.delete(existing.id);
    ctx.db.sprint.id.update({ ...s, interestCount: Math.max(0, s.interestCount - 1) });
  } else {
    ctx.db.interest.insert({ id: 0n, sprintId, identity: ctx.sender, createdAt: ctx.timestamp });
    ctx.db.sprint.id.update({ ...s, interestCount: s.interestCount + 1 });
  }
});

export const sendInvite = spacetimedb.reducer(
  { sprintId: t.u64(), invitedUsername: t.string() },
  (ctx, { sprintId, invitedUsername }) => {
    const me = ctx.db.profile.identity.find(ctx.sender);
    if (!me || !me.username) throw new SenderError('NO_USERNAME: Claim a username first.');
    requireNotBlocked(ctx);
    if (!ctx.db.sprint.id.find(sprintId)) throw new SenderError('SPRINT_NOT_FOUND');
    const u = invitedUsername.trim().toLowerCase().replace(/^@/, '');
    if (!findProfileByUsername(ctx, u)) throw new SenderError(`NO_USER: No user @${u} found.`);
    if (u === me.username) throw new SenderError('SELF: That is you.');
    ctx.db.invite.insert({ id: 0n, sprintId, invitedUsername: u, invitedByUsername: me.username, createdAt: ctx.timestamp });
  }
);

// ---------------------------------------------------------------------------
// Phase 3: register + presence
// ---------------------------------------------------------------------------

// Name + email, no password. Public profile and private email are split so the
// email is never broadcast. A signup email is queued exactly once per identity.
export const register = spacetimedb.reducer(
  { displayName: t.string(), email: t.string(), sourceRef: t.string(), sprintId: t.u64() },
  (ctx, { displayName, email, sourceRef, sprintId }) => {
    const name = displayName.trim();
    const mail = email.trim().toLowerCase();
    if (name.length < 1 || name.length > 40) {
      throw new SenderError('BAD_NAME: Please enter a name (1-40 characters).');
    }
    if (!isValidEmail(mail)) {
      throw new SenderError('BAD_EMAIL: Please enter a valid email address.');
    }
    const ref = sourceRef.trim().slice(0, 64);
    requireNotBlocked(ctx);

    const existing = ctx.db.profile.identity.find(ctx.sender);
    if (existing) {
      ctx.db.profile.identity.update({ ...existing, displayName: name });
    } else {
      ctx.db.profile.insert({
        identity: ctx.sender,
        displayName: name,
        createdAt: ctx.timestamp,
        username: '',
        bio: '',
        contact: '',
        location: '',
        socialX: '',
        socialLinkedin: '',
        socialInstagram: '',
      });
    }

    const existingEmail = ctx.db.participant_email.identity.find(ctx.sender);
    if (existingEmail) {
      ctx.db.participant_email.identity.update({ ...existingEmail, email: mail });
      return; // already signed up: no second signup email
    }
    ctx.db.participant_email.insert({
      identity: ctx.sender,
      email: mail,
      sourceRef: ref,
      createdAt: ctx.timestamp,
    });
    ctx.db.email_outbox.insert({
      id: 0n,
      identity: ctx.sender,
      toEmail: mail,
      toName: name,
      sprintId,
      kind: 'signup',
      status: 'pending',
      attempts: 0,
      lastError: '',
      createdAt: ctx.timestamp,
      amount: 0n,
      perkTitle: '',
      mockRef: '',
    });
  }
);

// Associate this connection with a sprint room. One row per connection.
export const enterSprint = spacetimedb.reducer({ sprintId: t.u64() }, (ctx, { sprintId }) => {
  if (!ctx.connectionId) return;
  if (!ctx.db.sprint.id.find(sprintId)) throw new SenderError('SPRINT_NOT_FOUND');
  const current = ctx.db.room_presence.connectionId.find(ctx.connectionId);
  if (current) {
    if (current.sprintId !== sprintId) {
      ctx.db.room_presence.connectionId.update({ ...current, sprintId, enteredAt: ctx.timestamp });
    }
    return;
  }
  ctx.db.room_presence.insert({
    connectionId: ctx.connectionId,
    identity: ctx.sender,
    sprintId,
    enteredAt: ctx.timestamp,
  });
  const distinct = new Set<string>();
  for (const r of ctx.db.room_presence.sprintId.filter(sprintId)) {
    distinct.add(r.identity.toHexString());
  }
  const s = ctx.db.sprint.id.find(sprintId);
  if (s && distinct.size > s.peakPresence) {
    ctx.db.sprint.id.update({ ...s, peakPresence: distinct.size });
  }
});

// Owner only: hide a junk sprint from the homepage and stop accepting support.
export const archiveSprint = spacetimedb.reducer({ sprintId: t.u64() }, (ctx, { sprintId }) => {
  requireOwner(ctx);
  const s = ctx.db.sprint.id.find(sprintId);
  if (!s) throw new SenderError('SPRINT_NOT_FOUND');
  ctx.db.sprint.id.update({ ...s, status: SPRINT_ARCHIVED });
});

// ---------------------------------------------------------------------------
// Contact form
// ---------------------------------------------------------------------------

const CONTACT_TO = 'lakshveeronline@gmail.com';
const CONTACT_CC = 'adarshmalpeddiwar@gmail.com';

// Anyone (no registration needed) can send a message. Light rate limit per identity.
export const sendContact = spacetimedb.reducer({ name: t.string(), email: t.string(), message: t.string() }, (ctx, { name, email, message }) => {
  requireNotBlocked(ctx);
  const n = name.trim();
  const mail = email.trim().toLowerCase();
  const msg = message.trim();
  if (n.length < 1 || n.length > 80) throw new SenderError('BAD_NAME: Please enter your name (1-80 characters).');
  if (!isValidEmail(mail)) throw new SenderError('BAD_EMAIL: Please enter a valid email address so we can reply.');
  if (msg.length < 10) throw new SenderError('BAD_MESSAGE: Tell us a little more (at least 10 characters).');
  if (msg.length > 4000) throw new SenderError('BAD_MESSAGE: Keep it under 4000 characters.');
  const tenMinAgo = ctx.timestamp.microsSinceUnixEpoch - 10n * 60n * MICROS_PER_SECOND;
  let recent = 0;
  for (const m of ctx.db.contact_message.iter()) {
    if (m.identity.equals(ctx.sender) && m.createdAt.microsSinceUnixEpoch > tenMinAgo) recent++;
  }
  if (recent >= 3) throw new SenderError('RATE_LIMIT: You have sent a few messages already. Please wait a few minutes.');
  ctx.db.contact_message.insert({ id: 0n, identity: ctx.sender, name: n, email: mail, message: msg, status: 'pending', attempts: 0, lastError: '', createdAt: ctx.timestamp });
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

// Admin login: a name + password pair kept in private app_config. The owner
// (CLI) sets it; any admin can change it from /admin. Whoever logs in with it
// gets admin rights bound to their identity.
function setConfig(ctx: Ctx, key: string, value: string) {
  const row = ctx.db.app_config.key.find(key);
  if (row) ctx.db.app_config.key.update({ key, value });
  else ctx.db.app_config.insert({ key, value });
}

export const setAdminCode = spacetimedb.reducer({ name: t.string(), password: t.string() }, (ctx, { name, password }) => {
  if (!isAdmin(ctx)) requireOwner(ctx);
  const n = name.trim();
  const p = password.trim();
  if (n.length < 3) throw new SenderError('BAD_NAME: at least 3 characters.');
  if (p.length < 8) throw new SenderError('BAD_PASSWORD: at least 8 characters.');
  setConfig(ctx, 'admin_name', n);
  setConfig(ctx, 'admin_code', p);
});

export const claimAdmin = spacetimedb.reducer({ name: t.string(), password: t.string() }, (ctx, { name, password }) => {
  const n = ctx.db.app_config.key.find('admin_name');
  const p = ctx.db.app_config.key.find('admin_code');
  if (!n || !p || n.value !== name.trim() || p.value !== password.trim()) throw new SenderError('BAD_LOGIN: Wrong admin name or password.');
  if (ctx.db.admin.identity.find(ctx.sender)) return;
  const me = ctx.db.profile.identity.find(ctx.sender);
  ctx.db.admin.insert({ identity: ctx.sender, username: me?.username ?? '', grantedAt: ctx.timestamp });
});

export const grantAdmin = spacetimedb.reducer({ username: t.string() }, (ctx, { username }) => {
  requireAdmin(ctx);
  const p = findProfileByUsername(ctx, username.trim().toLowerCase().replace(/^@/, ''));
  if (!p) throw new SenderError('NO_USER: No such username.');
  if (ctx.db.admin.identity.find(p.identity)) return;
  ctx.db.admin.insert({ identity: p.identity, username: p.username, grantedAt: ctx.timestamp });
});

export const revokeAdmin = spacetimedb.reducer({ username: t.string() }, (ctx, { username }) => {
  requireAdmin(ctx);
  const u = username.trim().toLowerCase().replace(/^@/, '');
  for (const a of [...ctx.db.admin.iter()]) if (a.username === u) ctx.db.admin.identity.delete(a.identity);
});

// Site copy and flags. An empty value removes the override; the client falls back to its default.
export const setSiteConfig = spacetimedb.reducer({ key: t.string(), value: t.string() }, (ctx, { key, value }) => {
  requireAdmin(ctx);
  const k = key.trim();
  if (!/^[a-z0-9_]{1,40}$/.test(k)) throw new SenderError('BAD_KEY');
  if (value.length > 4000) throw new SenderError('TOO_LONG: max 4000 characters.');
  const row = ctx.db.site_config.key.find(k);
  if (!value.trim()) {
    if (row) ctx.db.site_config.key.delete(k);
    return;
  }
  if (row) ctx.db.site_config.key.update({ key: k, value, updatedAt: ctx.timestamp });
  else ctx.db.site_config.insert({ key: k, value, updatedAt: ctx.timestamp });
});

export const adminBlockUser = spacetimedb.reducer({ username: t.string(), reason: t.string() }, (ctx, { username, reason }) => {
  requireAdmin(ctx);
  const p = findProfileByUsername(ctx, username.trim().toLowerCase().replace(/^@/, ''));
  if (!p) throw new SenderError('NO_USER: No such username.');
  if (isAdminIdentity(ctx, p.identity)) throw new SenderError('IS_ADMIN: Revoke admin first.');
  if (ctx.db.blocked_user.identity.find(p.identity)) return;
  ctx.db.blocked_user.insert({ identity: p.identity, username: p.username, reason: reason.trim().slice(0, 200), blockedAt: ctx.timestamp });
  for (const r of [...ctx.db.room_presence.iter()]) if (r.identity.equals(p.identity)) ctx.db.room_presence.connectionId.delete(r.connectionId);
});

export const adminUnblockUser = spacetimedb.reducer({ username: t.string() }, (ctx, { username }) => {
  requireAdmin(ctx);
  const u = username.trim().toLowerCase().replace(/^@/, '');
  for (const b of [...ctx.db.blocked_user.iter()]) if (b.username === u) ctx.db.blocked_user.identity.delete(b.identity);
});

export const adminDeleteUser = spacetimedb.reducer({ username: t.string() }, (ctx, { username }) => {
  requireAdmin(ctx);
  const p = findProfileByUsername(ctx, username.trim().toLowerCase().replace(/^@/, ''));
  if (!p) throw new SenderError('NO_USER: No such username.');
  if (ctx.db.admin.identity.find(p.identity)) throw new SenderError('IS_ADMIN: Revoke admin first.');
  purgeUser(ctx, p.identity, p.username);
});

// Permanent. Use delete_sprint (archive) when the history should stay.
export const adminDeleteSprint = spacetimedb.reducer({ sprintId: t.u64() }, (ctx, { sprintId }) => {
  requireAdmin(ctx);
  if (!ctx.db.sprint.id.find(sprintId)) throw new SenderError('SPRINT_NOT_FOUND');
  purgeSprint(ctx, sprintId);
});

// status: 'open' | 'closed' | 'archived' | '' (unchanged). extendMinutes moves the deadline and reopens.
export const adminSetSprint = spacetimedb.reducer({ sprintId: t.u64(), status: t.string(), extendMinutes: t.i32() }, (ctx, { sprintId, status, extendMinutes }) => {
  requireAdmin(ctx);
  const s = ctx.db.sprint.id.find(sprintId);
  if (!s) throw new SenderError('SPRINT_NOT_FOUND');
  let next = { ...s };
  if (extendMinutes !== 0) {
    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    const base = s.deadline.microsSinceUnixEpoch > nowMicros ? s.deadline.microsSinceUnixEpoch : nowMicros;
    const micros = base + BigInt(extendMinutes) * 60n * MICROS_PER_SECOND;
    if (micros <= nowMicros) throw new SenderError('BAD_EXTEND: That would end the sprint in the past.');
    next = { ...next, deadline: new Timestamp(micros) };
    if (next.status === SPRINT_CLOSED || next.status === SPRINT_ARCHIVED) next = { ...next, status: SPRINT_OPEN };
    for (const r of [...ctx.db.sprint_close_timer.iter()]) if (r.sprintId === sprintId) ctx.db.sprint_close_timer.scheduledId.delete(r.scheduledId);
    if (ctx.db.final_result.sprintId.find(sprintId)) ctx.db.final_result.sprintId.delete(sprintId);
    scheduleClose(ctx, sprintId, micros);
  }
  if (status === SPRINT_OPEN) next = { ...next, status: next.committedAmount >= next.goalAmount ? SPRINT_FUNDED_STILL_OPEN : SPRINT_OPEN };
  else if (status === SPRINT_CLOSED || status === SPRINT_ARCHIVED) next = { ...next, status };
  else if (status !== '') throw new SenderError('BAD_STATUS');
  ctx.db.sprint.id.update(next);
});

// scope: 'sprints' | 'users' | 'all'. confirm must be the literal WIPE.
export const adminWipe = spacetimedb.reducer({ scope: t.string(), confirm: t.string() }, (ctx, { scope, confirm }) => {
  requireAdmin(ctx);
  if (confirm !== 'WIPE') throw new SenderError('CONFIRM: type WIPE to confirm.');
  const sprints = scope === 'sprints' || scope === 'all';
  const users = scope === 'users' || scope === 'all';
  if (!sprints && !users) throw new SenderError('BAD_SCOPE');
  if (sprints) {
    for (const s of [...ctx.db.sprint.iter()]) purgeSprint(ctx, s.id);
    for (const r of [...ctx.db.support_commitment.iter()]) ctx.db.support_commitment.id.delete(r.id);
    for (const r of [...ctx.db.commitment_item.iter()]) ctx.db.commitment_item.id.delete(r.id);
    for (const r of [...ctx.db.final_result.iter()]) ctx.db.final_result.sprintId.delete(r.sprintId);
    for (const r of [...ctx.db.sprint_close_timer.iter()]) ctx.db.sprint_close_timer.scheduledId.delete(r.scheduledId);
  }
  if (users) {
    for (const p of [...ctx.db.profile.iter()]) purgeUser(ctx, p.identity, p.username);
    for (const r of [...ctx.db.participant_email.iter()]) ctx.db.participant_email.identity.delete(r.identity);
    for (const r of [...ctx.db.room_presence.iter()]) ctx.db.room_presence.connectionId.delete(r.connectionId);
    for (const r of [...ctx.db.interest.iter()]) ctx.db.interest.id.delete(r.id);
    for (const r of [...ctx.db.builder_rating.iter()]) ctx.db.builder_rating.id.delete(r.id);
    for (const r of [...ctx.db.invite.iter()]) ctx.db.invite.id.delete(r.id);
    for (const r of [...ctx.db.email_outbox.iter()]) ctx.db.email_outbox.id.delete(r.id);
  }
});

// ---------------------------------------------------------------------------
// Phase 3: email delivery — owner-configured, decoupled from registration.
// ---------------------------------------------------------------------------

// Owner only. Stores provider config and starts the outbox pump if not running.
export const setEmailConfig = spacetimedb.reducer(
  { resendApiKey: t.string(), fromAddress: t.string(), appUrl: t.string() },
  (ctx, { resendApiKey, fromAddress, appUrl }) => {
    requireOwner(ctx);
    const put = (key: string, value: string) => {
      const row = ctx.db.app_config.key.find(key);
      if (row) ctx.db.app_config.key.update({ key, value });
      else ctx.db.app_config.insert({ key, value });
    };
    put('resend_api_key', resendApiKey);
    put('from_address', fromAddress);
    put('app_url', appUrl);
    if ([...ctx.db.email_pump_timer.iter()].length === 0) {
      ctx.db.email_pump_timer.insert({
        scheduledId: 0n,
        scheduledAt: ScheduleAt.interval(5n * MICROS_PER_SECOND),
      });
    }
  }
);

// Owner only: put failed emails back in the queue (e.g. after fixing the sender).
export const retryFailedEmails = spacetimedb.reducer(ctx => {
  requireOwner(ctx);
  for (const row of ctx.db.email_outbox.status.filter('failed')) {
    if (row.toEmail.endsWith('@example.com')) continue; // test addresses never deliver
    ctx.db.email_outbox.id.update({ ...row, status: 'pending', attempts: 0, lastError: '' });
  }
});

const MAX_EMAIL_ATTEMPTS = 3;

type OutboxJob = {
  id: bigint;
  kind: string;
  toEmail: string;
  toName: string;
  sprintId: bigint;
  sprintTitle: string;
  amount: bigint;
  perkTitle: string;
  mockRef: string;
  apiKey: string;
  from: string;
  appUrl: string;
};

const DISCLAIMER =
  'Community support only. No equity, investment return, or financial return is offered. ' +
  'This is a simulated payment commitment for the hackathon MVP — no real money is charged.';

function emailContent(job: OutboxJob, link: string): { subject: string; text: string } {
  if (job.kind === 'receipt') {
    return {
      subject: `Receipt (mock): you backed "${job.sprintTitle}" with ₹${job.amount}`,
      text:
        `Hi ${job.toName},\n\n` +
        `You backed "${job.sprintTitle}" with ₹${job.amount}` +
        (job.perkTitle ? ` and claimed the perk "${job.perkTitle}"` : '') +
        `.\nMock reference: ${job.mockRef}\n\n` +
        `Watch it fund live: ${link}\n\n${DISCLAIMER}\n`,
    };
  }
  return {
    subject: `You're in — "${job.sprintTitle}" is live on BidFund`,
    text:
      `Hi ${job.toName},\n\n` +
      `You're in — this BidFund sprint is live.\n\n` +
      `Open sprint: ${link}\n\n${DISCLAIMER}\n`,
  };
}

// Scheduled procedure: every 5s, send up to a few pending emails via Resend.
// Network I/O happens outside the transactions; DB work inside withTx.
export const emailPump = spacetimedb.procedure(
  { timer: email_pump_timer.rowType },
  t.unit(),
  (ctx, _args) => {
    const jobs: OutboxJob[] = ctx.withTx(tx => {
      const apiKey = tx.db.app_config.key.find('resend_api_key')?.value ?? '';
      const from = tx.db.app_config.key.find('from_address')?.value ?? '';
      const appUrl = tx.db.app_config.key.find('app_url')?.value ?? '';
      if (!apiKey || !from) return [];
      const out: OutboxJob[] = [];
      for (const row of tx.db.email_outbox.status.filter('pending')) {
        if (out.length >= 5) break;
        // Minimal integrity check: the identity must have a genuine email row
        // that matches what we're about to send to.
        const pe = tx.db.participant_email.identity.find(row.identity);
        if (!pe || pe.email !== row.toEmail) {
          tx.db.email_outbox.id.update({ ...row, status: 'failed', lastError: 'no matching participant_email' });
          continue;
        }
        const s = tx.db.sprint.id.find(row.sprintId);
        out.push({
          id: row.id,
          kind: row.kind,
          toEmail: row.toEmail,
          toName: row.toName,
          sprintId: row.sprintId,
          sprintTitle: s?.title ?? 'BidFund sprint',
          amount: row.amount,
          perkTitle: row.perkTitle,
          mockRef: row.mockRef,
          apiKey,
          from,
          appUrl,
        });
      }
      return out;
    });

    for (const job of jobs) {
      const link = `${job.appUrl.replace(/\/$/, '')}/?sprint=${job.sprintId}`;
      let ok = false;
      let error = '';
      try {
        const res = ctx.http.fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${job.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: job.from, to: [job.toEmail], ...emailContent(job, link) }),
        });
        ok = res.status >= 200 && res.status < 300;
        if (!ok) error = `HTTP ${res.status}: ${res.text().slice(0, 200)}`;
      } catch (e) {
        error = String(e).slice(0, 200);
      }
      ctx.withTx(tx => {
        const row = tx.db.email_outbox.id.find(job.id);
        if (!row) return;
        const attempts = row.attempts + 1;
        tx.db.email_outbox.id.update({
          ...row,
          attempts,
          lastError: ok ? '' : error,
          status: ok ? 'sent' : attempts >= MAX_EMAIL_ATTEMPTS ? 'failed' : 'pending',
        });
      });
    }

    // Contact-form messages → team inbox (to + cc), reply-to set to the sender.
    type ContactJob = { id: bigint; name: string; email: string; message: string; createdAt: bigint; apiKey: string; from: string; to: string; cc: string };
    const contacts: ContactJob[] = ctx.withTx(tx => {
      const apiKey = tx.db.app_config.key.find('resend_api_key')?.value ?? '';
      const from = tx.db.app_config.key.find('from_address')?.value ?? '';
      if (!apiKey || !from) return [];
      const to = tx.db.app_config.key.find('contact_to')?.value || CONTACT_TO;
      const cc = tx.db.app_config.key.find('contact_cc')?.value ?? CONTACT_CC;
      const out: ContactJob[] = [];
      for (const m of tx.db.contact_message.status.filter('pending')) {
        if (out.length >= 3) break;
        out.push({ id: m.id, name: m.name, email: m.email, message: m.message, createdAt: m.createdAt.microsSinceUnixEpoch, apiKey, from, to, cc });
      }
      return out;
    });
    for (const job of contacts) {
      let ok = false;
      let error = '';
      try {
        const res = ctx.http.fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${job.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: job.from,
            to: [job.to],
            cc: job.cc ? [job.cc] : [],
            reply_to: job.email,
            subject: `BidFund contact: ${job.name}`,
            text: `New message from the BidFund contact form.\n\nFrom: ${job.name} <${job.email}>\nSent: ${new Date(Number(job.createdAt / 1000n)).toISOString()}\n\n${job.message}\n\n— Reply to this email to answer ${job.name} directly.\n`,
          }),
        });
        ok = res.status >= 200 && res.status < 300;
        if (!ok) error = `HTTP ${res.status}: ${res.text().slice(0, 200)}`;
      } catch (e) {
        error = String(e).slice(0, 200);
      }
      ctx.withTx(tx => {
        const row = tx.db.contact_message.id.find(job.id);
        if (!row) return;
        const attempts = row.attempts + 1;
        tx.db.contact_message.id.update({ ...row, attempts, lastError: ok ? '' : error, status: ok ? 'sent' : attempts >= MAX_EMAIL_ATTEMPTS ? 'failed' : 'pending' });
      });
    }
    return {};
  }
);
