# CardCircle

CardCircle was a trust-circle app for sharing bank card discounts among friends and family in Pakistan. A **requester** (someone who wants a discount on a purchase) asks a **holder** (someone with a qualifying bank card) to place an order on their behalf. Real money was intended to flow through a licensed payment service provider (PSP)—not through an in-app wallet.

This document describes the product concept, order logic, and what was built during development. It is a record of the project as it stood before work stopped.

---

## Core idea

- Users connect in a **trust circle** (friends/family only—not an open marketplace).
- Holders register cards they are willing to share (with consent and visibility controls).
- Requesters create orders against a specific holder and card, specifying merchant, amount, and delivery details.
- The holder accepts, the requester pays upfront, the holder shops, submits proof, and the requester confirms before funds are split.
- The platform takes a small fee from the **savings** (difference between escrow and actual checkout), not from the full order amount.

Amounts are whole **PKR** integers (e.g. `5000` = Rs 5,000).

---

## Roles

### Requester (e.g. Sara)

- Creates purchase requests for friends in her circle.
- Pays the full **order amount** into escrow via PSP checkout when the holder has accepted.
- Reviews checkout proof (screenshot + actual amount paid) and confirms or disputes.
- Does **not** need payout linking to pay—only to accept requests from others later if she becomes a holder.
- Lifetime **total_saved** tracks net discount kept across completed orders.

### Holder (e.g. Ahmed)

- Must link a **payout account** through the PSP before accepting requests.
- Accepts or declines incoming requests.
- After payment is locked, sees the delivery address and places the order at the merchant using their card.
- Submits tracking: receipt screenshot + **actual amount paid** at checkout.
- Receives reimbursement for what they paid at the store plus an **incentive** share of the savings.
- Lifetime **total_earned** tracks incentive fees across completed orders.

### Platform (CardCircle)

- Orchestrates order state and fee calculation.
- Never stores raw bank or card credentials—only opaque PSP references (`psp_hold_id`, `psp_payee_id`).
- Collects a **platform fee** (5% of actual savings) on successful completion.

Every user can act as both requester and holder over time.

---

## Order lifecycle

```
pending
  → payment_pending   (holder accepted; waiting for requester to pay)
  → escrow_locked     (requester paid; holder may shop)
  → tracking_submitted (holder uploaded proof + actual amount)
  → completed         (requester confirmed; counters updated)
```

Alternative exits: **cancelled** (holder cancel from escrow, full refund intended), **disputed** (requester rejects proof, full refund intended).

### Step-by-step flow

1. **Create request** — Requester picks holder, card, merchant, order amount, discount estimate, and delivery address. Status: `pending`. No money moves.

2. **Accept** — Holder accepts if payout is verified. Status: `payment_pending`. Delivery address stays hidden until payment.

3. **Pay** — Requester starts PSP checkout for the full order amount. On successful payment and webhook, status: `escrow_locked` and `psp_hold_id` (Safepay tracker) is stored.

4. **Shop** — Holder sees address only at `escrow_locked`. They must not pay more than the agreed order amount at the merchant.

5. **Submit tracking** — Holder uploads checkout screenshot and enters **actual amount paid**. System calculates:
   - **Actual saving** = order amount − actual amount paid  
   - **Platform fee** = 5% of saving  
   - **Incentive fee** = 15% of saving  
   Status: `tracking_submitted`.

6. **Confirm or dispute** — Requester reviews proof.
   - **Confirm** — Intended: PSP triple split (pay holder, refund requester unused portion, keep platform fee), then mark transaction **completed** and bump saved/earned counters.
   - **Dispute** — Intended: full refund to requester via PSP, transaction sealed as **disputed**.

### Fee split example (Rs 5,000 order, Rs 4,500 paid at checkout)

| Recipient | Amount | Purpose |
|-----------|--------|---------|
| Holder | Rs 4,575 | Rs 4,500 checkout reimbursement + Rs 75 incentive (15% of Rs 500 saving) |
| Requester | Rs 400 | Refund of unused escrow (net saving after fees) |
| Platform | Rs 25 | 5% of saving |

---

## Trust and safety rules

- **One active request per friend pair** at a time (parallel orders with different friends allowed).
- **Pay gate** — Holder must not shop until `escrow_locked`.
- **Escrow cap** — Actual amount paid cannot exceed order amount; over-limit flows prompt chat or cancel/re-create.
- **Payout gating** — Cards are not requestable until the holder’s payout status is verified.
- **Re-link cooldown** — After changing payout account, holder may face a 24-hour accept cooldown.
- **No timers** on orders in the pilot design—trust circle, not marketplace urgency.

---

## What was built

### Backend (Node.js / Express)

- Authentication: phone OTP, PIN, device binding, sessions, JWT access tokens, refresh rotation.
- Onboarding, profile, trust circle, and card management APIs.
- Requester APIs: create/cancel requests, initiate pay, confirm tracking, dispute, history.
- Holder APIs: incoming requests, accept/decline, active orders, cancel, screenshot upload, submit tracking, history.
- Order-scoped chat with image support.
- PSP dev simulation endpoints for payout verification and manual escrow testing.

### Safepay integration (sandbox, tested end-to-end for pay-in)

- **Pay-in** — `POST /api/requester/requests/:id/pay` creates a Safepay payment session and hosted checkout URL.
- **Webhook** — `POST /api/webhooks/safepay` handles `payment.succeeded`, parses tracker and order metadata, calls `lock_escrow()` in the database.
- **Auto escrow lock** — Verified in sandbox: requester pays in browser → Safepay webhook → order moves to `escrow_locked` with `psp_hold_id`.
- **Redirect pages** — `/payment/success` and `/payment/cancel` after hosted checkout (cosmetic; escrow locks via webhook, not redirect).

### Database (PostgreSQL / Supabase)

- Schema for users, sessions, refresh tokens, OTP, cards, circle, requests, transactions, chat.
- SQL functions for the full order state machine: create, accept, lock escrow, submit tracking, confirm, dispute, cancel.
- Payout status and PSP reference fields on users and requests.
- Setup script (`database/db_setup.py`) to apply schema and role-specific SQL files.

### Frontend (scaffolding only)

- Folder structure for web and mobile apps (screens, components, shared utilities)—not a finished UI product.

---

## What was not completed

- **Triple split payout** — Refund to requester, payout to holder, platform fee retention via Safepay (or alternative PSP) after confirm.
- **Real holder payout onboarding** — Production Safepay payee linking (dev simulation only).
- **Refund webhooks** for cancel and dispute paths.
- **Webhook signature verification** for Safepay.
- **Production mobile/web clients** — API-first backend only.

During development we also clarified that Safepay card checkout **captures payment to the merchant account**; “escrow” in the app is **logical state** in our database, not a separate PSP escrow vault. Settlement compliance for holding and splitting funds required further Safepay and legal sign-off before production.

---

## Architecture summary

```
Requester app  ──►  CardCircle API  ──►  PostgreSQL (order state, counters)
                         │
                         ├──► Safepay (checkout, webhooks)
                         └──► Supabase Storage (screenshots, chat images)
```

Money was never stored in app wallets. The database tracks order status, PSP reference tokens, and lifetime saved/earned counters only.

---

## Project status

**Development on CardCircle has stopped.**

After review, this concept cannot proceed as designed. Facilitating shared use of bank card discounts through a third-party platform may **conflict with contract and terms-of-use agreements between banks and cardholders** (unauthorized sharing of card benefits, misuse of promotional programs, and related issuer rules). Continuing would expose users and the platform to legal and contractual risk beyond what technical implementation alone can resolve.

**Sign-off date: 28/07/2026**
