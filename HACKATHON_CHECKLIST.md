# BidFund — Hackathon Qualifier Checklist

Nothing below is marked complete automatically. Tick each item only after a real test.

- [ ] Public URL opens on an external phone
- [ ] Full experience works in incognito
- [ ] No password/OTP wall
- [ ] New stranger enters in under 30 seconds
- [ ] First-time onboarding is visible
- [ ] Stranger completes core task unaided in under 3 minutes
- [ ] Signup email lands in a real external inbox
- [ ] Maincloud module is live
- [ ] Maincloud module was created inside allowed window
- [ ] Repo creation time is valid
- [ ] No commits after freeze
- [ ] Two tabs sync with no refresh
- [ ] Real action in tab one visibly updates tab two
- [ ] 10+ simultaneous-user test completed
- [ ] Limited-condition contention tested
- [ ] Mobile support flow tested one-handed
- [ ] Demo video is under 3 minutes
- [ ] Public launch post contains live URL
- [ ] Public launch post contains repo URL
- [ ] Public launch post contains demo-video URL
- [ ] Public launch post contains the exact one-liner

One-liner (use verbatim): **Live funding sprints for hardware builders taking working prototypes to pilot.**

## Where to look

- Live app: https://bidfund.me (sprint links: `https://bidfund.me/?sprint=<id>`)
- Maincloud database: `bidfund` — https://spacetimedb.com/bidfund
- Repo: https://github.com/lakshveerrao/BidFund
- Contention test: `cd client && npx tsx scripts/contention.ts 8 <optionId> <amount>`
- Launch numbers: `bash scripts/stats.sh`
