# CardCircle — Order Timer Removal (Trust-Circle Pivot)

**Date:** July 2026  
**Decision:** Remove all user-facing order timers and automatic expiry/settlement jobs.

## Context

We ran user validation (n=25) for a friends-and-family card discount sharing app. Key findings:

- 92% had missed a discount because they didn't have the right card
- 72% would share discounts with trusted people
- Concerns were about abuse, scams, and unauthorized use — not slow response times
- Users expect to coordinate with people they already know, inside and outside the app

The product is not a public marketplace. It is a trust circle — Sara and Ahmed are friends or family who already talk to each other.

## Why timers were added originally

Order timers were copied from marketplace / stranger patterns:

| Timer | Was | Purpose |
|-------|-----|---------|
| Pending | 15 min | Ahmed must accept or request deleted |
| Payment pending | 10 min | Sara must pay or accept voided |
| Escrow locked | 30 min | Ahmed must submit screenshot or Sara auto-refunded |
| Dispute window | 30 min | Sara must confirm/dispute or Ahmed auto-paid |

Background jobs (`auto_expire_requests`, `auto_release_escrow`) enforced these deadlines so the system cleaned itself up without human action — designed for people who don't trust each other.

That logic fits Uber, Fiverr, or a stranger marketplace. It does not fit cousins splitting a Foodpanda order.

## Why we removed timers

1. **Wrong tone for the product** — Countdowns signal: we assume you'll screw each other. For a trust circle, that feels like distrust, not safety.

2. **Doesn't match user behavior** — Real concerns (unauthorized use, getting money back) are addressed by escrow + circle-only access + no card numbers — not by SLA-style deadlines.

3. **Users coordinate outside the app anyway** — If Ahmed is busy, Sara messages him. These are people who already have WhatsApp and in-person contact.

4. **Ghosting is acceptable; money stays safe** — If someone is busy for days, the order can wait. Sara's money sits in escrow until someone acts — it is not lost.

5. **Validation supported moving forward without timer UX** — Enough signal on problem + willingness + trust model to pilot without marketplace-style urgency.

## What we changed (technical)

### Removed

- `expires_at` and `dispute_deadline` columns on `requests`
- `total_paid` field (escrow amount = `order_amount` throughout)
- `auto_expire_requests()` and `auto_release_escrow()` procedures
- Order cron job (`cron.js` deleted; `node-cron` removed)
- All expiry checks in SQL functions (accept, pay, submit tracking, confirm, dispute)

### Kept

- Escrow flow — Sara's wallet debited at payment; funds released only on confirm, dispute, or holder cancel
- `FOR UPDATE` locks on settlement — prevents double-payout races (technical safety, not user-facing timers)
- Auth timers — OTP expiry, refresh token TTL, PIN reset grants (security, unrelated to orders)
- Manual actions anytime — Sara can cancel before pay; Ahmed can decline/cancel; Sara can confirm or dispute whenever after tracking is submitted

### Transaction statuses (unchanged meaning)

| Status | Meaning |
|--------|---------|
| `completed` | Sara approved; Ahmed paid, Sara got saving back |
| `cancelled` | Ahmed backed out after escrow; Sara fully refunded |
| `disputed` | Sara rejected screenshot/amount; Sara fully refunded |
| `refunded` | Legacy only (old auto-refund cron); no longer written |

## New product principle

**No order deadlines.** Money is safe in escrow until humans move the order forward. Trust the circle; coordinate in chat or in person.

Stale requests may sit open — that is intentional. Sara can cancel while pending. Ahmed can cancel after escrow. Neither party is rushed by a clock.

## What we did not change

- Circle-only sharing model
- Escrow payment model
- Fee calculation on actual saving at `submit_tracking`
- Chat per request
- Auth / security timers (OTP, sessions)

## Decision rationale (one line)

Timers protect strangers in a marketplace; they undermine trust in a friends-and-family circle. We removed them because CardCircle is the latter.
