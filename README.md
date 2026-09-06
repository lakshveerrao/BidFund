# BidFund

**Live funding sprints for hardware builders taking working prototypes to pilot.**

A builder with a working prototype sets a goal and a clock. Supporters commit an
amount, optionally claim one of the builder's limited perks, and everyone watches
the funding state change live. Built on [SpacetimeDB](https://spacetimedb.com):
tables + reducers + subscriptions are the only source of truth.

- Live app: https://bidfund.me (also https://bidfund.vercel.app)
- Maincloud database: `bidfund` (https://spacetimedb.com/bidfund)

> Community support only. No equity, investment return, or financial return is
> offered. Payment is simulated for the hackathon MVP — no real money is charged.

## Why SpacetimeDB

When many people back the same sprint at once, one authoritative funding state
must exist and limited perks must never be oversold. `commit_support` does the
availability check and the claim inside one atomic reducer transaction, and every
client subscribes to the resulting rows directly. No polling, no client-side
totals, no floats (money is `u64` rupees).

## Layout

```
spacetimedb/   TypeScript module (tables, reducers, scheduled close, email pump)
client/        Vite + React client using spacetimedb/react hooks
client/scripts/contention.ts   N clients race for one perk slot (checkpoint test)
```

## Tables

| table                | visibility | purpose |
|----------------------|------------|---------|
| `sprint`             | public     | goal, authoritative `committed_amount`, `supporter_count`, deadline, status |
| `support_option`     | public     | perks; `slots_total` null = unlimited, `slots_claimed` |
| `support_commitment` | public     | one row per mock commitment (permanent) |
| `final_result`       | public     | written once by `close_sprint`, immutable |
| `profile`            | public     | display name per identity |
| `room_presence`      | public     | one row per connection; count distinct identities |
| `participant_email`  | private    | email + `?ref=` source, reducer access only |
| `email_outbox`       | private    | signup emails queued by `register`, drained by scheduled `email_pump` |

## Reducers

- `commit_support(sprint_id, amount, support_option_id?)` — the hero reducer.
  Rejects with a plain message when the perk was just taken:
  *"That perk was just claimed by someone else. Choose another option or support without one."*
- `close_sprint` — scheduled at the deadline; re-checks expiry, writes `final_result`, sets `closed`.
- `register(display_name, email, source_ref, sprint_id)` — no password; queues one signup email.
- `enter_sprint(sprint_id)` — presence; cleaned up in `client_disconnected`.
- `create_sprint(...)` — builder form at `/create`.
- `set_email_config(resend_api_key, from_address, app_url)` — owner only; starts the pump.

## Run it

```bash
# module
cd spacetimedb && npm install
spacetime publish bidfund --yes            # from repo root; uses spacetime.json

# bindings
spacetime generate --lang typescript --out-dir ./client/src/module_bindings --module-path ./spacetimedb

# client
cd client && npm install && npm run dev

# contention checkpoint: 8 clients, perk 1, ₹100 each → exactly one winner
cd client && npx tsx scripts/contention.ts 8 1 100
```

Enable signup emails (owner identity only):

```bash
spacetime call bidfund set_email_config '"re_xxx"' '"BidFund <onboarding@resend.dev>"' '"https://bidfund.me"'
```
