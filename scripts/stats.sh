#!/usr/bin/env bash
# Launch-night numbers, straight from the database. Run from anywhere.
#   bash scripts/stats.sh
ST="${SPACETIME_BIN:-/c/Users/ADMIN/AppData/Local/SpacetimeDB/spacetime.exe}"
DB="${STDB_DB:-bidfund}"
q() { "$ST" sql "$DB" "$1" 2>&1 | grep -v WARNING; }

echo "== Participants (registered profiles)"; q "SELECT COUNT(*) AS participants FROM profile"
echo; echo "== Commitments"; q "SELECT COUNT(*) AS commitments FROM support_commitment"
echo; echo "== Per sprint (amount, backers, peak concurrent identities)"
q "SELECT id, title, committed_amount, supporter_count, peak_presence, status FROM sprint"
echo; echo "== Limited perks (claimed/total)"
q "SELECT id, sprint_id, title, slots_claimed, slots_total FROM support_option"
# Maincloud SQL has no GROUP BY; count in the shell.
count() { tail -n +3 | sed 's/^ *//; s/ *$//' | grep -v '^$' | grep -v '^-' | sort | uniq -c | sort -rn; }
echo; echo "== Entrants by ?ref= source (count, ref)"; q "SELECT source_ref FROM participant_email" | count
echo; echo "== Emails (count, kind | status)"; q "SELECT kind, status FROM email_outbox" | count
echo; echo "== Connections in rooms right now (count, sprint_id)"; q "SELECT sprint_id FROM room_presence" | count
echo; echo "Perk-contention rejections: run 'spacetime logs $DB -n 2000 | grep -c PERK_TAKEN'"
