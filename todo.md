# CardCircle — TODO

## Next up (backend — agreed order)

- [ ] **OTP rate limiting** — limit `/api/auth/otp/send`, `/api/auth/otp/verify`, and `/api/auth/pin/verify` (per IP + per phone) using `express-rate-limit`.
- [ ] **OTP resend cooldown (60s)** — enforce in `store_otp` or `sendOtp` using `last_sent_at`; reject resend if less than 60 seconds since last send.
- [ ] **Remove or lock `/wallet/topup`** before production — dev-only env flag, admin auth, or delete route.

---

## Auth hardening (done)

- [x] Device bind at OTP verify — `bind_device` inside `verify_otp`; `complete_onboarding` after profile + PIN.
- [x] Refresh tokens (DB) — table + store/validate/rotate/revoke; `bind_device` revokes all on new device.
- [x] Refresh tokens (backend) — 15m access JWT, `store_refresh_token` on login, `/auth/refresh`, `/auth/logout`.
- [x] Logout unbinds device — `logout_user` revokes refresh + clears `device_id`; OTP for existing users returns `requires_pin` until pin/verify.

---

## Trust-circle order flow (done)

- [x] Remove order timers — no `expires_at`, `dispute_deadline`, auto-expire, or auto-release escrow.
- [x] Remove order cron (`cron.js` deleted; no background jobs for requests).

---

## Ops (optional)

- [ ] **`purge_expired_refresh_tokens` cron** (optional) — housekeeping for expired refresh token rows.

---

## Production hardening

- [ ] **Tighten CORS** — restrict to mobile app origin(s); currently `cors()` is open.
- [ ] **Screenshot URL validation** — restrict `screenshot_url` to your storage domain (e.g. Firebase Storage) on submit.

---

## Fees & settlement (done)

- [x] Fees on actual saving — calculated at `submit_tracking`; estimated preview on `create_request`; Ahmed submits `actual_amount_paid` + screenshot via API.

---

## Mobile app (partner)

- [ ] **PIN on every app reopen** — client rule; do not skip PIN because `has_valid_refresh` is true.
- [ ] **Route after OTP via `verify_otp`** — use `requires_pin` / `is_onboarded`; do not route from `new_device` alone.
- [ ] **Logout UX** — clear phone + tokens from storage; keep local `device_id`; show enter-number → OTP → PIN flow.
- [ ] **Ahmed submit screen** — screenshot upload + enter `actual_amount_paid` from receipt; call `POST /api/orders/:id/tracking`.
- [ ] **Sara review screen** — compare screenshot total to `actual_amount_paid`; confirm or dispute anytime (no timer).

---

## Later / optional

- [ ] **FCM push** — notify Ahmed on Sara cancel after accept; optional instant kick on new device OTP (`old_device_id`).
- [ ] **Forgot PIN + security questions** — commented out in DB for MVP; OTP-only recovery today.
- [ ] **Biometrics** — deferred for V1.
