-- database/testdata.sql
--
-- Three main users, plus seven helper accounts that only send or receive invites for Sara.
-- Safe to run again: it removes these ten phones first, then inserts them.
-- Does not touch any other users.
--
-- Pending invites for Sara (Circle > Pending): from Ayesha Malik 03004444444, Usman Tariq 03009999999,
-- Hamza Sheikh 03006666666, Zainab Qureshi 03007777777 and Omar Farooq 03008888888.
-- Ayesha and Hamza arrived through an invite link (invite_via = link). The others typed a number.
-- Share codes: Sara invitesara01xxxxxxxxxxxxxxxxxxxx, Ahmed inviteahmed02xxxxxxxxxxxxxxxxxxx,
-- Bilal invitebilal03xxxxxxxxxxxxxxxxxxx.
-- Save some of those numbers in the phone's contacts under a name of your choice, then turn on
-- "Check invites against my contacts" to see them land in "In your contacts".
-- Sent by Sara (Circle > Sent): Mariam Siddiqui 03001212121 and Talha Javed 03002323232.
-- The helper accounts have no cards and no orders, so they never appear in the circle carousel.
--
-- Log in with the app's phone screen. Type the local number; the app sends +92.
-- The code is printed by the backend (WhatsApp send is not wired).
--
--   Sara Khan      03001111111
--   Ahmed Ali      03002222222
--   Bilal Hussain  03003333333
--
-- Everyone is in everyone's circle (all three pairs accepted), so every person
-- can request from and hold for both of the others. Remove is blocked on every
-- pair because each pair has a live order.
--   Sara  → Ahmed   accepted
--   Sara  → Bilal   accepted
--   Ahmed → Bilal   accepted
--
-- Cards (shared = visible to the circle, Request card works on it).
-- Bank names match the Peekaboo catalog from load_offers.py (no seed bank/tier rows).
--   Sara   Habib Bank Limited Gold (shared), Allied Bank Platinum (shared), Meezan Bank Classic (off)
--   Ahmed  United Bank Limited (UBL) Platinum (shared), MCB Bank Signature (shared), Bank Alfalah World (off)
--   Bilal  Askari Bank Titanium (shared), Al Baraka Bank Gold (shared), Faysal Bank Classic (off)
-- Every member has two shared cards, so the circle carousel shows "2 cards" for all.
-- Meezan Bank Classic, Bank Alfalah World and Faysal Classic have no paid order, so Manage
-- Cards shows the "No orders yet" stats box for them.
--
-- Live orders, all six directions (the database allows one per pair and direction):
--   Sara  → Ahmed   proof_submitted   Daraz          Sara can accept or reject the proof. Chat is open.
--   Ahmed → Sara    accepted          Khaadi         Sara can send proof or either can cancel. Chat is open.
--   Sara  → Bilal   pending           Foodpanda      Bilal can accept or decline. Address stays hidden. No chat.
--   Bilal → Sara    pending           Junaid Jamshed Sara can accept or decline. Address stays hidden. No chat.
--   Ahmed → Bilal   accepted          Bata           No link and no note. Bilal can send proof. Chat is open.
--   Bilal → Ahmed   proof_submitted   Ideas          Long note and a link. Bilal checks Ahmed's proof. Chat is open.
-- Between them every person is requester and holder on pending, accepted and proof.
--
-- History covers unpaid, paid, cancelled by the requester, and cancelled by the holder.
-- Each person is the requester on some rows and the card holder on others,
-- including every one of those four statuses in both roles.
-- Batik is the holder-side cancel by the requester for Bilal.
-- Paid rows exist in August, September, last month and this month, so all-time totals,
-- "This month" and "Last month" on History all differ. The this-month and last-month
-- rows are placed relative to the day you run this script (Asia/Karachi), so the stats
-- never go stale. Older fixed-date rows count in the lifetime total only once they
-- are more than a month old.
-- Order types covered: zero discount (Gul Ahmed, share 0), a large basket (Khaadi),
-- small baskets, rows with and without a link or a note, and a card that was deleted.
-- One paid row keeps a card id for a card that is no longer in the cards table.
-- Bank, tier, names, and amounts stay on that row, so History and the totals still count it.
-- Cancelled rows have a reason and no receipt, because cancel happens before proof.
-- Rows with a card charge also store holder_share: 20% of the gap, nearest rupee.
-- Chat on a transaction is read-only.
-- The Daraz thread has 33 messages so the chat screen can load an older page.
-- Screenshot and chat image paths are placeholders and will not load.
--
-- Read marks are only on the four live chats. Pending has no chat, so its count is 0.
-- No row means every message from the other person is unread. Own messages never count.
--   Daraz   Sara 4 unread, Ahmed 2 unread
--   Khaadi  Sara 0 unread, Ahmed 2 unread
--   Bata    Ahmed 1 unread, Bilal 3 unread
--   Ideas   Ahmed 1 unread, Bilal 2 unread
-- Unread chat totals: Sara 4, Ahmed 6, Bilal 5.

BEGIN;

-- Start of this Karachi month (m = 0) or last month (m = -1), plus h hours, in ms.
CREATE OR REPLACE FUNCTION pg_temp.seed_ts(m int, h int) RETURNS bigint AS $$
  SELECT (extract(epoch FROM (
    (date_trunc('month', now() AT TIME ZONE 'Asia/Karachi') + make_interval(months => m, hours => h))
    AT TIME ZONE 'Asia/Karachi'
  )) * 1000)::bigint
$$ LANGUAGE sql;

-- Phones and the fixed ids this script always writes. Using both means a second
-- run still finds the helper accounts if a phone was stored in another form.
DROP TABLE IF EXISTS pg_temp.seed_user_ids;
CREATE TEMP TABLE seed_user_ids ON COMMIT DROP AS
SELECT DISTINCT id
FROM users
WHERE phone IN (
  '+923001111111', '+923002222222', '+923003333333',
  '+923004444444', '+923009999999', '+923006666666', '+923007777777', '+923008888888',
  '+923001212121', '+923002323232'
)
OR id IN (
  'aaaaaaaa-0001-4000-8000-000000000001',
  'aaaaaaaa-0002-4000-8000-000000000002',
  'aaaaaaaa-0003-4000-8000-000000000003',
  'aaaaaaaa-0004-4000-8000-000000000004',
  'aaaaaaaa-0005-4000-8000-000000000005',
  'aaaaaaaa-0006-4000-8000-000000000006',
  'aaaaaaaa-0007-4000-8000-000000000007',
  'aaaaaaaa-0008-4000-8000-000000000008',
  'aaaaaaaa-0009-4000-8000-000000000009',
  'aaaaaaaa-0010-4000-8000-000000000010'
);

DELETE FROM chat_messages
WHERE sender_id IN (SELECT id FROM seed_user_ids)
   OR thread_id IN (
        SELECT id FROM requests
        WHERE requester_id IN (SELECT id FROM seed_user_ids)
           OR card_holder_id IN (SELECT id FROM seed_user_ids)
        UNION
        SELECT id FROM transactions
        WHERE requester_id IN (SELECT id FROM seed_user_ids)
           OR card_holder_id IN (SELECT id FROM seed_user_ids)
      );

DELETE FROM sessions
WHERE user_id IN (SELECT id FROM seed_user_ids);

DELETE FROM requests
WHERE requester_id IN (SELECT id FROM seed_user_ids)
   OR card_holder_id IN (SELECT id FROM seed_user_ids);

DELETE FROM transactions
WHERE requester_id IN (SELECT id FROM seed_user_ids)
   OR card_holder_id IN (SELECT id FROM seed_user_ids);

DELETE FROM invite_links
WHERE user_id IN (SELECT id FROM seed_user_ids);

DELETE FROM circle
WHERE user_id IN (SELECT id FROM seed_user_ids)
   OR friend_id IN (SELECT id FROM seed_user_ids);

DELETE FROM cards
WHERE user_id IN (SELECT id FROM seed_user_ids);

DELETE FROM chat_reads
WHERE user_id IN (SELECT id FROM seed_user_ids)
   OR thread_id IN (
        SELECT id FROM requests
        WHERE requester_id IN (SELECT id FROM seed_user_ids)
           OR card_holder_id IN (SELECT id FROM seed_user_ids)
        UNION
        SELECT id FROM transactions
        WHERE requester_id IN (SELECT id FROM seed_user_ids)
           OR card_holder_id IN (SELECT id FROM seed_user_ids)
      );

DELETE FROM otps
WHERE phone IN (
  '+923001111111', '+923002222222', '+923003333333',
  '+923004444444', '+923009999999', '+923006666666', '+923007777777', '+923008888888',
  '+923001212121', '+923002323232'
);

DELETE FROM otp_phone_lockout
WHERE phone IN (
  '+923001111111', '+923002222222', '+923003333333',
  '+923004444444', '+923009999999', '+923006666666', '+923007777777', '+923008888888',
  '+923001212121', '+923002323232'
);

DELETE FROM users
WHERE id IN (SELECT id FROM seed_user_ids);

-- Fixed ids so the rows below can refer to each other.
INSERT INTO users (id, phone, display_name, city, created_at) VALUES
  ('aaaaaaaa-0001-4000-8000-000000000001', '+923001111111', 'Sara Khan',        'Karachi', (extract(epoch FROM timestamptz '2026-09-01 09:00:00+05') * 1000)::bigint),
  ('aaaaaaaa-0002-4000-8000-000000000002', '+923002222222', 'Ahmed Ali',        'Karachi', (extract(epoch FROM timestamptz '2026-09-01 09:05:00+05') * 1000)::bigint),
  ('aaaaaaaa-0003-4000-8000-000000000003', '+923003333333', 'Bilal Hussain',    'Karachi', (extract(epoch FROM timestamptz '2026-09-01 09:10:00+05') * 1000)::bigint),
  -- Helper accounts. They only exist so Sara has pending invites to receive and send.
  ('aaaaaaaa-0004-4000-8000-000000000004', '+923004444444', 'Ayesha Malik',     'Karachi', (extract(epoch FROM timestamptz '2026-09-05 10:00:00+05') * 1000)::bigint),
  ('aaaaaaaa-0005-4000-8000-000000000005', '+923009999999', 'Usman Tariq',      'Karachi', (extract(epoch FROM timestamptz '2026-09-05 10:05:00+05') * 1000)::bigint),
  ('aaaaaaaa-0006-4000-8000-000000000006', '+923006666666', 'Hamza Sheikh',     'Karachi', (extract(epoch FROM timestamptz '2026-09-05 10:10:00+05') * 1000)::bigint),
  ('aaaaaaaa-0007-4000-8000-000000000007', '+923007777777', 'Zainab Qureshi',   'Karachi', (extract(epoch FROM timestamptz '2026-09-05 10:15:00+05') * 1000)::bigint),
  ('aaaaaaaa-0008-4000-8000-000000000008', '+923008888888', 'Omar Farooq',      'Karachi', (extract(epoch FROM timestamptz '2026-09-05 10:20:00+05') * 1000)::bigint),
  ('aaaaaaaa-0009-4000-8000-000000000009', '+923001212121', 'Mariam Siddiqui',  'Karachi', (extract(epoch FROM timestamptz '2026-09-05 10:25:00+05') * 1000)::bigint),
  ('aaaaaaaa-0010-4000-8000-000000000010', '+923002323232', 'Talha Javed',      'Karachi', (extract(epoch FROM timestamptz '2026-09-05 10:30:00+05') * 1000)::bigint);

-- Every tier appears once. Each person has a card that is sharing and a card that is not.
-- bank_name / card_tier must already exist from the Peekaboo catalog load.
INSERT INTO cards (id, user_id, bank_name, card_tier, allow_sharing, created_at) VALUES
  ('cccccccc-0001-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'Habib Bank Limited',          'Gold',      1, (extract(epoch FROM timestamptz '2026-09-02 11:00:00+05') * 1000)::bigint),
  ('cccccccc-0001-4000-8000-000000000002', 'aaaaaaaa-0001-4000-8000-000000000001', 'Meezan Bank',                 'Classic',   0, (extract(epoch FROM timestamptz '2026-09-02 11:05:00+05') * 1000)::bigint),
  ('cccccccc-0002-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000002', 'United Bank Limited (UBL)',   'Platinum',  1, (extract(epoch FROM timestamptz '2026-09-02 12:00:00+05') * 1000)::bigint),
  ('cccccccc-0002-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000002', 'MCB Bank',                    'Signature', 1, (extract(epoch FROM timestamptz '2026-09-02 12:05:00+05') * 1000)::bigint),
  ('cccccccc-0002-4000-8000-000000000003', 'aaaaaaaa-0002-4000-8000-000000000002', 'Bank Alfalah',                'World',     0, (extract(epoch FROM timestamptz '2026-09-02 12:10:00+05') * 1000)::bigint),
  ('cccccccc-0003-4000-8000-000000000001', 'aaaaaaaa-0003-4000-8000-000000000003', 'Askari Bank',                 'Titanium',  1, (extract(epoch FROM timestamptz '2026-09-02 13:00:00+05') * 1000)::bigint),
  ('cccccccc-0003-4000-8000-000000000002', 'aaaaaaaa-0003-4000-8000-000000000003', 'Faysal Bank',                 'Classic',   0, (extract(epoch FROM timestamptz '2026-09-02 13:05:00+05') * 1000)::bigint),
  ('cccccccc-0001-4000-8000-000000000003', 'aaaaaaaa-0001-4000-8000-000000000001', 'Allied Bank',                 'Platinum',  1, (extract(epoch FROM timestamptz '2026-09-04 11:00:00+05') * 1000)::bigint),
  ('cccccccc-0003-4000-8000-000000000003', 'aaaaaaaa-0003-4000-8000-000000000003', 'Al Baraka Bank',              'Gold',      1, (extract(epoch FROM timestamptz '2026-09-04 13:00:00+05') * 1000)::bigint);

INSERT INTO invite_links (user_id, code, created_at) VALUES
  ('aaaaaaaa-0001-4000-8000-000000000001', 'invitesara01xxxxxxxxxxxxxxxxxxxx', (extract(epoch FROM timestamptz '2026-09-01 09:00:00+05') * 1000)::bigint),
  ('aaaaaaaa-0002-4000-8000-000000000002', 'inviteahmed02xxxxxxxxxxxxxxxxxxx', (extract(epoch FROM timestamptz '2026-09-01 09:05:00+05') * 1000)::bigint),
  ('aaaaaaaa-0003-4000-8000-000000000003', 'invitebilal03xxxxxxxxxxxxxxxxxxx', (extract(epoch FROM timestamptz '2026-09-01 09:10:00+05') * 1000)::bigint);

-- user_id sent the invite. friend_id received it.
INSERT INTO circle (user_id, friend_id, c_status, invite_via, created_at) VALUES
  ('aaaaaaaa-0001-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000002', 'accepted', 'app', (extract(epoch FROM timestamptz '2026-09-03 10:00:00+05') * 1000)::bigint),
  ('aaaaaaaa-0001-4000-8000-000000000001', 'aaaaaaaa-0003-4000-8000-000000000003', 'accepted', 'app', (extract(epoch FROM timestamptz '2026-09-03 10:05:00+05') * 1000)::bigint),
  ('aaaaaaaa-0002-4000-8000-000000000002', 'aaaaaaaa-0003-4000-8000-000000000003', 'accepted', 'app', (extract(epoch FROM timestamptz '2026-09-03 10:10:00+05') * 1000)::bigint),
  -- Invites Sara has received and not answered (Pending tab).
  ('aaaaaaaa-0004-4000-8000-000000000004', 'aaaaaaaa-0001-4000-8000-000000000001', 'pending', 'link', (extract(epoch FROM timestamptz '2026-10-20 10:00:00+05') * 1000)::bigint),
  ('aaaaaaaa-0005-4000-8000-000000000005', 'aaaaaaaa-0001-4000-8000-000000000001', 'pending', 'app', (extract(epoch FROM timestamptz '2026-10-20 11:00:00+05') * 1000)::bigint),
  ('aaaaaaaa-0006-4000-8000-000000000006', 'aaaaaaaa-0001-4000-8000-000000000001', 'pending', 'link', (extract(epoch FROM timestamptz '2026-10-21 10:00:00+05') * 1000)::bigint),
  ('aaaaaaaa-0007-4000-8000-000000000007', 'aaaaaaaa-0001-4000-8000-000000000001', 'pending', 'app', (extract(epoch FROM timestamptz '2026-10-21 11:00:00+05') * 1000)::bigint),
  ('aaaaaaaa-0008-4000-8000-000000000008', 'aaaaaaaa-0001-4000-8000-000000000001', 'pending', 'app', (extract(epoch FROM timestamptz '2026-10-22 10:00:00+05') * 1000)::bigint),
  -- Invites Sara has sent and nobody has answered (Sent tab).
  ('aaaaaaaa-0001-4000-8000-000000000001', 'aaaaaaaa-0009-4000-8000-000000000009', 'pending', 'app', (extract(epoch FROM timestamptz '2026-10-19 10:00:00+05') * 1000)::bigint),
  ('aaaaaaaa-0001-4000-8000-000000000001', 'aaaaaaaa-0010-4000-8000-000000000010', 'pending', 'app', (extract(epoch FROM timestamptz '2026-10-19 11:00:00+05') * 1000)::bigint);

INSERT INTO requests (
  id, order_group_id, requester_id, card_holder_id, card_id, merchant, product_url,
  delivery_address, order_amount, actual_amount_paid, note, screenshot_url,
  rq_status, created_at, updated_at
) VALUES
  (
    'rrrrrrrr-0001-4000-8000-000000000001',
    'rrrrrrrr-0001-4000-8000-000000000001',
    'aaaaaaaa-0001-4000-8000-000000000001',
    'aaaaaaaa-0002-4000-8000-000000000002',
    'cccccccc-0002-4000-8000-000000000001',
    'Daraz',
    'https://www.daraz.pk/products/seed-headphones',
    'House 12, Street 4, DHA Phase 5, Lahore',
    8500,
    7200,
    'Black, not the grey one.',
    'seed/daraz-receipt.jpg',
    'proof_submitted',
    (extract(epoch FROM timestamptz '2026-10-10 15:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-10-12 19:30:00+05') * 1000)::bigint
  ),
  (
    'rrrrrrrr-0002-4000-8000-000000000002',
    'rrrrrrrr-0002-4000-8000-000000000002',
    'aaaaaaaa-0002-4000-8000-000000000002',
    'aaaaaaaa-0001-4000-8000-000000000001',
    'cccccccc-0001-4000-8000-000000000001',
    'Khaadi',
    'https://www.khaadi.com/products/seed-kurta',
    'Flat 8, Askari 11, Lahore',
    4200,
    NULL,
    'Size medium. Leave with the guard if I am out.',
    NULL,
    'accepted',
    (extract(epoch FROM timestamptz '2026-10-13 12:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-10-13 16:00:00+05') * 1000)::bigint
  ),
  (
    'rrrrrrrr-0003-4000-8000-000000000003',
    'rrrrrrrr-0003-4000-8000-000000000003',
    'aaaaaaaa-0001-4000-8000-000000000001',
    'aaaaaaaa-0003-4000-8000-000000000003',
    'cccccccc-0003-4000-8000-000000000001',
    'Foodpanda',
    'https://www.foodpanda.pk/restaurant/seed-lahore',
    'House 12, Street 4, DHA Phase 5, Lahore',
    1800,
    NULL,
    'Leave it at the gate.',
    NULL,
    'pending',
    (extract(epoch FROM timestamptz '2026-10-15 09:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-10-15 09:00:00+05') * 1000)::bigint
  ),
  (
    'rrrrrrrr-0004-4000-8000-000000000004',
    'rrrrrrrr-0004-4000-8000-000000000004',
    'aaaaaaaa-0003-4000-8000-000000000003',
    'aaaaaaaa-0001-4000-8000-000000000001',
    'cccccccc-0001-4000-8000-000000000001',
    'Junaid Jamshed',
    'https://www.junaidjamshed.com/products/seed-kurta',
    'Plot 19, Johar Town, Lahore',
    2500,
    NULL,
    'The navy one, large.',
    NULL,
    'pending',
    (extract(epoch FROM timestamptz '2026-10-15 11:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-10-15 11:00:00+05') * 1000)::bigint
  ),
  (
    'rrrrrrrr-0005-4000-8000-000000000005',
    'rrrrrrrr-0005-4000-8000-000000000005',
    'aaaaaaaa-0002-4000-8000-000000000002',
    'aaaaaaaa-0003-4000-8000-000000000003',
    'cccccccc-0003-4000-8000-000000000001',
    'Bata',
    NULL,
    'Flat 8, Askari 11, Lahore',
    3800,
    NULL,
    NULL,
    NULL,
    'accepted',
    (extract(epoch FROM timestamptz '2026-10-14 09:30:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-10-14 10:00:00+05') * 1000)::bigint
  ),
  (
    'rrrrrrrr-0006-4000-8000-000000000006',
    'rrrrrrrr-0006-4000-8000-000000000006',
    'aaaaaaaa-0003-4000-8000-000000000003',
    'aaaaaaaa-0002-4000-8000-000000000002',
    'cccccccc-0002-4000-8000-000000000001',
    'Ideas',
    'https://www.ideas.com.pk/products/seed-lawn-3-piece',
    'Plot 19, Johar Town, Lahore',
    6000,
    5100,
    'Unstitched 3 piece, the blue print with the white dupatta. If the blue is sold out, the green is fine, but please do not take the red. Delivery before the weekend if possible.',
    'seed/ideas-receipt.jpg',
    'proof_submitted',
    (extract(epoch FROM timestamptz '2026-10-14 14:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-10-14 15:30:00+05') * 1000)::bigint
  );

-- Peekaboo store id when the catalog load has foodpanda (id 200). No-op otherwise.
UPDATE requests r
SET store_id = s.id
FROM stores s
WHERE r.id = 'rrrrrrrr-0003-4000-8000-000000000003'
  AND s.id = 200;

INSERT INTO transactions (
  id, requester_id, requester_name, card_holder_id, card_holder_name, merchant, delivery_address, order_amount,
  card_id, bank_name, card_tier, actual_amount_paid, holder_share, screenshot_url, txn_status,
  cancel_reason, created_at, updated_at
) VALUES
  (
    'tttttttt-0001-4000-8000-000000000001',
    'aaaaaaaa-0001-4000-8000-000000000001',
    'Sara Khan',
    'aaaaaaaa-0002-4000-8000-000000000002',
    'Ahmed Ali',
    'Sapphire',
    'House 12, Street 4, DHA Phase 5, Lahore',
    5600,
    'cccccccc-0002-4000-8000-000000000001',
    'United Bank Limited (UBL)', 'Platinum',
    4900, 140, 'seed/sapphire-receipt.jpg',
    'unpaid', NULL,
    (extract(epoch FROM timestamptz '2026-10-08 14:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-10-08 18:00:00+05') * 1000)::bigint
  ),
  (
    'tttttttt-0002-4000-8000-000000000002',
    'aaaaaaaa-0001-4000-8000-000000000001',
    'Sara Khan',
    'aaaaaaaa-0002-4000-8000-000000000002',
    'Ahmed Ali',
    'Naheed',
    'House 12, Street 4, DHA Phase 5, Lahore',
    3200,
    'cccccccc-0002-4000-8000-000000000002',
    'MCB Bank', 'Signature',
    2800, 80, 'seed/naheed-receipt.jpg',
    'paid', NULL,
    (extract(epoch FROM timestamptz '2026-09-20 11:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-09-21 10:00:00+05') * 1000)::bigint
  ),
  (
    'tttttttt-0003-4000-8000-000000000003',
    'aaaaaaaa-0001-4000-8000-000000000001',
    'Sara Khan',
    'aaaaaaaa-0002-4000-8000-000000000002',
    'Ahmed Ali',
    'Breakout',
    'House 12, Street 4, DHA Phase 5, Lahore',
    6100,
    'cccccccc-0002-4000-8000-000000000001',
    'United Bank Limited (UBL)', 'Platinum',
    NULL, NULL, NULL,
    'cancelled_by_requester', 'Wrong size. I will reorder.',
    (extract(epoch FROM timestamptz '2026-09-25 13:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-09-25 17:00:00+05') * 1000)::bigint
  ),
  (
    'tttttttt-0004-4000-8000-000000000004',
    'aaaaaaaa-0002-4000-8000-000000000002',
    'Ahmed Ali',
    'aaaaaaaa-0001-4000-8000-000000000001',
    'Sara Khan',
    'Outfitters',
    'Flat 8, Askari 11, Lahore',
    4500,
    'cccccccc-0001-4000-8000-000000000001',
    'Habib Bank Limited', 'Gold',
    NULL, NULL, NULL,
    'cancelled_by_holder', 'The store was out of stock.',
    (extract(epoch FROM timestamptz '2026-09-28 15:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-09-28 19:00:00+05') * 1000)::bigint
  ),
  (
    'tttttttt-0005-4000-8000-000000000005',
    'aaaaaaaa-0003-4000-8000-000000000003',
    'Bilal Hussain',
    'aaaaaaaa-0001-4000-8000-000000000001',
    'Sara Khan',
    'Imtiaz',
    'Plot 19, Johar Town, Lahore',
    2700,
    'cccccccc-0001-4000-8000-000000000001',
    'Habib Bank Limited', 'Gold',
    2400, 60, 'seed/imtiaz-receipt.jpg',
    'paid', NULL,
    (extract(epoch FROM timestamptz '2026-09-18 12:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-09-19 09:30:00+05') * 1000)::bigint
  ),
  (
    'tttttttt-0006-4000-8000-000000000006',
    'aaaaaaaa-0002-4000-8000-000000000002',
    'Ahmed Ali',
    'aaaaaaaa-0001-4000-8000-000000000001',
    'Sara Khan',
    'Bonanza',
    'Flat 8, Askari 11, Lahore',
    5100,
    'cccccccc-0001-4000-8000-000000000001',
    'Habib Bank Limited', 'Gold',
    4300, 160, 'seed/bonanza-receipt.jpg',
    'paid', NULL,
    (extract(epoch FROM timestamptz '2026-10-04 12:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-10-05 10:00:00+05') * 1000)::bigint
  ),
  (
    'tttttttt-0007-4000-8000-000000000007',
    'aaaaaaaa-0001-4000-8000-000000000001',
    'Sara Khan',
    'aaaaaaaa-0003-4000-8000-000000000003',
    'Bilal Hussain',
    'Al-Fatah',
    'House 12, Street 4, DHA Phase 5, Lahore',
    3900,
    'cccccccc-0003-4000-8000-000000000001',
    'Askari Bank', 'Titanium',
    3100, 160, 'seed/alfatah-receipt.jpg',
    'paid', NULL,
    (extract(epoch FROM timestamptz '2026-10-05 13:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-10-06 11:00:00+05') * 1000)::bigint
  ),
  (
    'tttttttt-0008-4000-8000-000000000008',
    'aaaaaaaa-0003-4000-8000-000000000003',
    'Bilal Hussain',
    'aaaaaaaa-0001-4000-8000-000000000001',
    'Sara Khan',
    'Bareeze',
    'Plot 19, Johar Town, Lahore',
    2200,
    'cccccccc-0001-4000-8000-000000000001',
    'Habib Bank Limited', 'Gold',
    1900, 60, 'seed/bareeze-receipt.jpg',
    'unpaid', NULL,
    (extract(epoch FROM timestamptz '2026-10-11 15:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-10-11 18:00:00+05') * 1000)::bigint
  ),
  (
    'tttttttt-0009-4000-8000-000000000009',
    'aaaaaaaa-0002-4000-8000-000000000002',
    'Ahmed Ali',
    'aaaaaaaa-0001-4000-8000-000000000001',
    'Sara Khan',
    'Engine',
    'Flat 8, Askari 11, Lahore',
    3600,
    'cccccccc-0001-4000-8000-000000000001',
    'Habib Bank Limited', 'Gold',
    NULL, NULL, NULL,
    'cancelled_by_requester', 'Changed my mind about the shoes.',
    (extract(epoch FROM timestamptz '2026-10-02 14:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-10-02 16:30:00+05') * 1000)::bigint
  ),
  (
    'tttttttt-0010-4000-8000-000000000010',
    'aaaaaaaa-0001-4000-8000-000000000001',
    'Sara Khan',
    'aaaaaaaa-0003-4000-8000-000000000003',
    'Bilal Hussain',
    'Metro',
    'House 12, Street 4, DHA Phase 5, Lahore',
    4800,
    'cccccccc-0003-4000-8000-000000000001',
    'Askari Bank', 'Titanium',
    NULL, NULL, NULL,
    'cancelled_by_holder', 'Card limit was already used.',
    (extract(epoch FROM timestamptz '2026-10-03 12:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-10-03 15:00:00+05') * 1000)::bigint
  ),
  (
    'tttttttt-0011-4000-8000-000000000011',
    'aaaaaaaa-0003-4000-8000-000000000003',
    'Bilal Hussain',
    'aaaaaaaa-0002-4000-8000-000000000002',
    'Ahmed Ali',
    'Carrefour',
    'Plot 19, Johar Town, Lahore',
    6400,
    'cccccccc-0002-4000-8000-000000000002',
    'MCB Bank', 'Signature',
    5800, 120, 'seed/carrefour-receipt.jpg',
    'paid', NULL,
    (extract(epoch FROM timestamptz '2026-10-06 17:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-10-07 09:30:00+05') * 1000)::bigint
  ),
  (
    'tttttttt-0012-4000-8000-000000000012',
    'aaaaaaaa-0001-4000-8000-000000000001',
    'Sara Khan',
    'aaaaaaaa-0002-4000-8000-000000000002',
    'Ahmed Ali',
    'Miniso',
    'House 12, Street 4, DHA Phase 5, Lahore',
    1800,
    'cccccccc-0002-4000-8000-000000000001',
    'United Bank Limited (UBL)', 'Platinum',
    1500, 60, 'seed/miniso-receipt.jpg',
    'paid', NULL,
    (extract(epoch FROM timestamptz '2026-10-08 11:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-10-09 10:00:00+05') * 1000)::bigint
  ),
  (
    'tttttttt-0013-4000-8000-000000000013',
    'aaaaaaaa-0002-4000-8000-000000000002',
    'Ahmed Ali',
    'aaaaaaaa-0003-4000-8000-000000000003',
    'Bilal Hussain',
    'Daraz Mart',
    'Flat 8, Askari 11, Lahore',
    4100,
    'cccccccc-0003-4000-8000-000000000001',
    'Askari Bank', 'Titanium',
    3600, 100, 'seed/darazmart-receipt.jpg',
    'unpaid', NULL,
    (extract(epoch FROM timestamptz '2026-10-10 13:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-10-10 17:00:00+05') * 1000)::bigint
  ),
  (
    'tttttttt-0014-4000-8000-000000000014',
    'aaaaaaaa-0003-4000-8000-000000000003',
    'Bilal Hussain',
    'aaaaaaaa-0002-4000-8000-000000000002',
    'Ahmed Ali',
    'Sana Safinaz',
    'Plot 19, Johar Town, Lahore',
    7700,
    'cccccccc-0002-4000-8000-000000000001',
    'United Bank Limited (UBL)', 'Platinum',
    NULL, NULL, NULL,
    'cancelled_by_holder', 'The shop declined the card.',
    (extract(epoch FROM timestamptz '2026-09-30 14:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-09-30 18:00:00+05') * 1000)::bigint
  ),
  (
    'tttttttt-0015-4000-8000-000000000015',
    'aaaaaaaa-0001-4000-8000-000000000001',
    'Sara Khan',
    'aaaaaaaa-0002-4000-8000-000000000002',
    'Ahmed Ali',
    'Liberty Books',
    'House 12, Street 4, DHA Phase 5, Lahore',
    900,
    'cccccccc-0099-4000-8000-000000000001',
    'Habib Metro', 'Gold',
    800, 20, 'seed/liberty-receipt.jpg',
    'paid', NULL,
    (extract(epoch FROM timestamptz '2026-08-12 11:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-08-12 16:00:00+05') * 1000)::bigint
  ),
  (
    'tttttttt-0016-4000-8000-000000000016',
    'aaaaaaaa-0003-4000-8000-000000000003',
    'Bilal Hussain',
    'aaaaaaaa-0001-4000-8000-000000000001',
    'Sara Khan',
    'Chenone',
    'Plot 19, Johar Town, Lahore',
    5300,
    'cccccccc-0001-4000-8000-000000000002',
    'Meezan Bank', 'Classic',
    NULL, NULL, NULL,
    'cancelled_by_requester', 'Found it cheaper in store.',
    (extract(epoch FROM timestamptz '2026-10-01 12:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-10-01 15:40:00+05') * 1000)::bigint
  ),
  (
    'tttttttt-0017-4000-8000-000000000017',
    'aaaaaaaa-0001-4000-8000-000000000001',
    'Sara Khan',
    'aaaaaaaa-0003-4000-8000-000000000003',
    'Bilal Hussain',
    'Hyperstar',
    'House 12, Street 4, DHA Phase 5, Lahore',
    2600,
    'cccccccc-0003-4000-8000-000000000001',
    'Askari Bank', 'Titanium',
    2100, 100, 'seed/hyperstar-receipt.jpg',
    'paid', NULL,
    (extract(epoch FROM timestamptz '2026-09-12 13:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-09-13 10:00:00+05') * 1000)::bigint
  ),
  (
    'tttttttt-0018-4000-8000-000000000018',
    'aaaaaaaa-0002-4000-8000-000000000002',
    'Ahmed Ali',
    'aaaaaaaa-0003-4000-8000-000000000003',
    'Bilal Hussain',
    'Batik',
    'Flat 8, Askari 11, Lahore',
    3400,
    'cccccccc-0003-4000-8000-000000000001',
    'Askari Bank', 'Titanium',
    NULL, NULL, NULL,
    'cancelled_by_requester', 'Ordered the wrong colour.',
    (extract(epoch FROM timestamptz '2026-10-09 14:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-10-09 16:00:00+05') * 1000)::bigint
  ),
  -- Zero discount: the card charge equals the price, so the share is 0. This month.
  (
    'tttttttt-0019-4000-8000-000000000019',
    'aaaaaaaa-0002-4000-8000-000000000002', 'Ahmed Ali',
    'aaaaaaaa-0003-4000-8000-000000000003', 'Bilal Hussain',
    'Gul Ahmed', 'Flat 8, Askari 11, Lahore', 2000,
    'cccccccc-0003-4000-8000-000000000001', 'Askari Bank', 'Titanium',
    2000, 0, 'seed/gulahmed-receipt.jpg', 'paid', NULL,
    pg_temp.seed_ts(0, 1), pg_temp.seed_ts(0, 2)
  ),
  -- Last month, Bilal requests from Sara.
  (
    'tttttttt-0020-4000-8000-000000000020',
    'aaaaaaaa-0003-4000-8000-000000000003', 'Bilal Hussain',
    'aaaaaaaa-0001-4000-8000-000000000001', 'Sara Khan',
    'Alkaram Studio', 'Plot 19, Johar Town, Lahore', 8200,
    'cccccccc-0001-4000-8000-000000000001', 'Habib Bank Limited', 'Gold',
    6500, 340, 'seed/alkaram-receipt.jpg', 'paid', NULL,
    pg_temp.seed_ts(-1, 140), pg_temp.seed_ts(-1, 150)
  ),
  -- Cancelled by the requester this month.
  (
    'tttttttt-0021-4000-8000-000000000021',
    'aaaaaaaa-0001-4000-8000-000000000001', 'Sara Khan',
    'aaaaaaaa-0003-4000-8000-000000000003', 'Bilal Hussain',
    'Ideas', 'House 12, Street 4, DHA Phase 5, Lahore', 3000,
    'cccccccc-0003-4000-8000-000000000002', 'Faysal Bank', 'Classic',
    NULL, NULL, NULL, 'cancelled_by_requester', 'Decided I do not need it any more.',
    pg_temp.seed_ts(0, 1), pg_temp.seed_ts(0, 3)
  ),
  -- Large basket, this month.
  (
    'tttttttt-0022-4000-8000-000000000022',
    'aaaaaaaa-0001-4000-8000-000000000001', 'Sara Khan',
    'aaaaaaaa-0002-4000-8000-000000000002', 'Ahmed Ali',
    'Khaadi', 'House 12, Street 4, DHA Phase 5, Lahore', 12000,
    'cccccccc-0002-4000-8000-000000000002', 'MCB Bank', 'Signature',
    9800, 440, 'seed/khaadi-big-receipt.jpg', 'paid', NULL,
    pg_temp.seed_ts(0, 2), pg_temp.seed_ts(0, 4)
  ),
  -- Cancelled by the holder last month.
  (
    'tttttttt-0023-4000-8000-000000000023',
    'aaaaaaaa-0003-4000-8000-000000000003', 'Bilal Hussain',
    'aaaaaaaa-0002-4000-8000-000000000002', 'Ahmed Ali',
    'Limelight', 'Plot 19, Johar Town, Lahore', 5400,
    'cccccccc-0002-4000-8000-000000000002', 'MCB Bank', 'Signature',
    NULL, NULL, NULL, 'cancelled_by_holder', 'My card was blocked for the day.',
    pg_temp.seed_ts(-1, 200), pg_temp.seed_ts(-1, 203)
  ),
  -- Oldest paid row, August.
  (
    'tttttttt-0024-4000-8000-000000000024',
    'aaaaaaaa-0002-4000-8000-000000000002', 'Ahmed Ali',
    'aaaaaaaa-0003-4000-8000-000000000003', 'Bilal Hussain',
    'Outfitters', 'Flat 8, Askari 11, Lahore', 3000,
    'cccccccc-0003-4000-8000-000000000001', 'Askari Bank', 'Titanium',
    2700, 60, 'seed/outfitters-receipt.jpg', 'paid', NULL,
    (extract(epoch FROM timestamptz '2026-08-20 12:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-08-21 10:00:00+05') * 1000)::bigint
  ),
  -- Bilal's Al Baraka Gold card earns, this month.
  (
    'tttttttt-0025-4000-8000-000000000025',
    'aaaaaaaa-0001-4000-8000-000000000001', 'Sara Khan',
    'aaaaaaaa-0003-4000-8000-000000000003', 'Bilal Hussain',
    'Sapphire', 'House 12, Street 4, DHA Phase 5, Lahore', 7000,
    'cccccccc-0003-4000-8000-000000000003', 'Al Baraka Bank', 'Gold',
    6000, 200, 'seed/sapphire-js-receipt.jpg', 'paid', NULL,
    pg_temp.seed_ts(0, 3), pg_temp.seed_ts(0, 5)
  ),
  -- Unpaid this month: Ahmed holds, Bilal pays.
  (
    'tttttttt-0026-4000-8000-000000000026',
    'aaaaaaaa-0003-4000-8000-000000000003', 'Bilal Hussain',
    'aaaaaaaa-0002-4000-8000-000000000002', 'Ahmed Ali',
    'Breeze', 'Plot 19, Johar Town, Lahore', 4400,
    'cccccccc-0002-4000-8000-000000000001', 'United Bank Limited (UBL)', 'Platinum',
    3900, 100, 'seed/breeze-receipt.jpg', 'unpaid', NULL,
    pg_temp.seed_ts(0, 2), pg_temp.seed_ts(0, 6)
  ),
  -- Paid this month on Sara's Allied Bank Platinum card, Ahmed requests.
  (
    'tttttttt-0027-4000-8000-000000000027',
    'aaaaaaaa-0002-4000-8000-000000000002', 'Ahmed Ali',
    'aaaaaaaa-0001-4000-8000-000000000001', 'Sara Khan',
    'Nishat Linen', 'Flat 8, Askari 11, Lahore', 5500,
    'cccccccc-0001-4000-8000-000000000003', 'Allied Bank', 'Platinum',
    4500, 200, 'seed/nishat-receipt.jpg', 'paid', NULL,
    pg_temp.seed_ts(0, 4), pg_temp.seed_ts(0, 7)
  );

-- Two short messages on each new closed order. The holder speaks first, except where
-- the requester cancelled. Ids are built from the order id so they stay unique.
INSERT INTO chat_messages (id, thread_id, sender_id, chat_message, attachment_path, created_at)
SELECT
  'nnnnnnnn-' || substr(t.id, 10, 4) || '-4000-8000-00000000000' || m.k,
  t.id,
  CASE
    WHEN (m.k = 1) = (t.txn_status <> 'cancelled_by_requester') THEN t.card_holder_id
    ELSE t.requester_id
  END,
  CASE
    WHEN m.k = 1 AND t.txn_status IN ('paid', 'unpaid')
      THEN 'The card was charged PKR ' || t.actual_amount_paid || '. Receipt is on the order.'
    WHEN m.k = 1 THEN 'Cancelling this one. ' || t.cancel_reason
    WHEN t.txn_status = 'paid' THEN 'Received. Thank you.'
    WHEN t.txn_status = 'unpaid' THEN 'I will send it soon.'
    ELSE 'No problem.'
  END,
  NULL,
  t.updated_at - 600000 + (m.k * 60000)
FROM transactions t
CROSS JOIN (VALUES (1), (2)) AS m(k)
WHERE t.id IN (
  'tttttttt-0019-4000-8000-000000000019', 'tttttttt-0020-4000-8000-000000000020',
  'tttttttt-0021-4000-8000-000000000021', 'tttttttt-0022-4000-8000-000000000022',
  'tttttttt-0023-4000-8000-000000000023', 'tttttttt-0024-4000-8000-000000000024',
  'tttttttt-0025-4000-8000-000000000025', 'tttttttt-0026-4000-8000-000000000026',
  'tttttttt-0027-4000-8000-000000000027'
);

-- Daraz proof thread: 33 messages, newest at the end. One of them is a photo.
INSERT INTO chat_messages (id, thread_id, sender_id, chat_message, attachment_path, created_at)
SELECT
  'mmmmmmmm-00d1-4000-8000-' || lpad(n::text, 12, '0'),
  'rrrrrrrr-0001-4000-8000-000000000001',
  CASE WHEN n % 2 = 1
    THEN 'aaaaaaaa-0002-4000-8000-000000000002'
    ELSE 'aaaaaaaa-0001-4000-8000-000000000001'
  END,
  (ARRAY[
    'I can shop this after 4.',
    'Please do. Link is the black pair.',
    'Seen. Checking stock on Daraz.',
    'If black is gone, skip the grey.',
    'Black is in stock.',
    'Good. Order amount is 8500.',
    'I will try the usual discount.',
    'Anything under 8500 is fine.',
    'Adding it to the cart now.',
    'Use the UBL platinum card.',
    'That is the one I have open.',
    'Delivery is DHA Phase 5.',
    'House 12, Street 4. Got it.',
    'Gate code is 2145.',
    'Saved.',
    'Checkout is asking for OTP.',
    'I will read it out if it comes.',
    'No OTP yet.',
    'Came through. Entering it.',
    'Photo of the cart before I pay.',
    'That is the right item.',
    'Paying now.',
    'Payment went through.',
    'What was the final amount?',
    '7200.',
    'That is a good saving.',
    'Uploading the receipt.',
    'I can see the proof on the order.',
    'I will send you 7200 tonight.',
    'JazzCash or cash?',
    'JazzCash on this number.',
    'I will send it after I check the receipt.',
    'Receipt is in. I paid 7200.'
  ])[n],
  CASE WHEN n = 20 THEN 'seed/daraz-chat.jpg' ELSE NULL END,
  (extract(epoch FROM timestamptz '2026-10-12 10:00:00+05') * 1000)::bigint + (n * 60000)
FROM generate_series(1, 33) AS n;

INSERT INTO chat_messages (id, thread_id, sender_id, chat_message, attachment_path, created_at) VALUES
  ('mmmmmmmm-0002-4000-8000-000000000001', 'rrrrrrrr-0002-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000002', 'Please use the HBL gold card.', NULL, (extract(epoch FROM timestamptz '2026-10-13 16:10:00+05') * 1000)::bigint),
  ('mmmmmmmm-0002-4000-8000-000000000002', 'rrrrrrrr-0002-4000-8000-000000000002', 'aaaaaaaa-0001-4000-8000-000000000001', 'I will shop this evening.', NULL, (extract(epoch FROM timestamptz '2026-10-13 16:25:00+05') * 1000)::bigint),
  ('mmmmmmmm-0002-4000-8000-000000000003', 'rrrrrrrr-0002-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000002', 'Size medium, and the receipt when you are done.', NULL, (extract(epoch FROM timestamptz '2026-10-13 16:40:00+05') * 1000)::bigint),
  ('mmmmmmmm-0002-4000-8000-000000000004', 'rrrrrrrr-0002-4000-8000-000000000002', 'aaaaaaaa-0001-4000-8000-000000000001', 'Noted.', NULL, (extract(epoch FROM timestamptz '2026-10-13 16:55:00+05') * 1000)::bigint),

  ('mmmmmmmm-0021-4000-8000-000000000001', 'rrrrrrrr-0005-4000-8000-000000000005', 'aaaaaaaa-0002-4000-8000-000000000002', 'Hi Bilal, can you get this on your Askari card?', NULL, (extract(epoch FROM timestamptz '2026-10-14 10:01:00+05') * 1000)::bigint),
  ('mmmmmmmm-0021-4000-8000-000000000002', 'rrrrrrrr-0005-4000-8000-000000000005', 'aaaaaaaa-0003-4000-8000-000000000003', 'Yes, I will do it tomorrow.', NULL, (extract(epoch FROM timestamptz '2026-10-14 10:10:00+05') * 1000)::bigint),
  ('mmmmmmmm-0021-4000-8000-000000000003', 'rrrrrrrr-0005-4000-8000-000000000005', 'aaaaaaaa-0002-4000-8000-000000000002', 'Great. Size 42 please.', NULL, (extract(epoch FROM timestamptz '2026-10-14 10:20:00+05') * 1000)::bigint),
  ('mmmmmmmm-0021-4000-8000-000000000004', 'rrrrrrrr-0005-4000-8000-000000000005', 'aaaaaaaa-0002-4000-8000-000000000002', 'And keep the receipt.', NULL, (extract(epoch FROM timestamptz '2026-10-14 10:21:00+05') * 1000)::bigint),

  ('mmmmmmmm-0022-4000-8000-000000000001', 'rrrrrrrr-0006-4000-8000-000000000006', 'aaaaaaaa-0003-4000-8000-000000000003', 'Please use the UBL platinum card for this.', NULL, (extract(epoch FROM timestamptz '2026-10-14 14:10:00+05') * 1000)::bigint),
  ('mmmmmmmm-0022-4000-8000-000000000002', 'rrrrrrrr-0006-4000-8000-000000000006', 'aaaaaaaa-0002-4000-8000-000000000002', 'Done. Paid 5100.', NULL, (extract(epoch FROM timestamptz '2026-10-14 15:20:00+05') * 1000)::bigint),
  ('mmmmmmmm-0022-4000-8000-000000000003', 'rrrrrrrr-0006-4000-8000-000000000006', 'aaaaaaaa-0002-4000-8000-000000000002', 'Uploaded the receipt, please check.', NULL, (extract(epoch FROM timestamptz '2026-10-14 15:30:00+05') * 1000)::bigint),
  ('mmmmmmmm-0022-4000-8000-000000000004', 'rrrrrrrr-0006-4000-8000-000000000006', 'aaaaaaaa-0003-4000-8000-000000000003', 'Checking now.', NULL, (extract(epoch FROM timestamptz '2026-10-14 15:40:00+05') * 1000)::bigint),

  ('mmmmmmmm-0001-4000-8000-000000000001', 'tttttttt-0001-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000002', 'Paid 4900 at Sapphire. Send me that when you can.', NULL, (extract(epoch FROM timestamptz '2026-10-08 18:05:00+05') * 1000)::bigint),
  ('mmmmmmmm-0001-4000-8000-000000000002', 'tttttttt-0001-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'I will send 4900 tomorrow morning.', NULL, (extract(epoch FROM timestamptz '2026-10-08 18:20:00+05') * 1000)::bigint),

  ('mmmmmmmm-0004-4000-8000-000000000001', 'tttttttt-0002-4000-8000-000000000002', 'aaaaaaaa-0001-4000-8000-000000000001', 'Sent the 2800.', NULL, (extract(epoch FROM timestamptz '2026-09-21 09:00:00+05') * 1000)::bigint),
  ('mmmmmmmm-0004-4000-8000-000000000002', 'tttttttt-0002-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000002', 'Received. Marked paid.', NULL, (extract(epoch FROM timestamptz '2026-09-21 10:05:00+05') * 1000)::bigint),

  ('mmmmmmmm-0005-4000-8000-000000000001', 'tttttttt-0003-4000-8000-000000000003', 'aaaaaaaa-0001-4000-8000-000000000001', 'Cancelling this one. Wrong size.', NULL, (extract(epoch FROM timestamptz '2026-09-25 17:05:00+05') * 1000)::bigint),
  ('mmmmmmmm-0005-4000-8000-000000000002', 'tttttttt-0003-4000-8000-000000000003', 'aaaaaaaa-0002-4000-8000-000000000002', 'All right. I had not checked out yet.', NULL, (extract(epoch FROM timestamptz '2026-09-25 17:12:00+05') * 1000)::bigint),

  ('mmmmmmmm-0006-4000-8000-000000000001', 'tttttttt-0004-4000-8000-000000000004', 'aaaaaaaa-0001-4000-8000-000000000001', 'They do not have it in stock.', NULL, (extract(epoch FROM timestamptz '2026-09-28 19:05:00+05') * 1000)::bigint),
  ('mmmmmmmm-0006-4000-8000-000000000002', 'tttttttt-0004-4000-8000-000000000004', 'aaaaaaaa-0002-4000-8000-000000000002', 'Thanks for checking. We can leave it.', NULL, (extract(epoch FROM timestamptz '2026-09-28 19:15:00+05') * 1000)::bigint),

  ('mmmmmmmm-0007-4000-8000-000000000001', 'tttttttt-0005-4000-8000-000000000005', 'aaaaaaaa-0003-4000-8000-000000000003', 'Paid you for the Imtiaz run.', NULL, (extract(epoch FROM timestamptz '2026-09-19 09:00:00+05') * 1000)::bigint),
  ('mmmmmmmm-0007-4000-8000-000000000002', 'tttttttt-0005-4000-8000-000000000005', 'aaaaaaaa-0001-4000-8000-000000000001', 'Got it. Marked paid.', NULL, (extract(epoch FROM timestamptz '2026-09-19 09:35:00+05') * 1000)::bigint),

  ('mmmmmmmm-0008-4000-8000-000000000001', 'tttttttt-0006-4000-8000-000000000006', 'aaaaaaaa-0001-4000-8000-000000000001', 'Bonanza came to 4300.', NULL, (extract(epoch FROM timestamptz '2026-10-05 09:10:00+05') * 1000)::bigint),
  ('mmmmmmmm-0008-4000-8000-000000000002', 'tttttttt-0006-4000-8000-000000000006', 'aaaaaaaa-0002-4000-8000-000000000002', 'Sent. You can mark it paid.', NULL, (extract(epoch FROM timestamptz '2026-10-05 09:50:00+05') * 1000)::bigint),

  ('mmmmmmmm-0009-4000-8000-000000000001', 'tttttttt-0007-4000-8000-000000000007', 'aaaaaaaa-0003-4000-8000-000000000003', 'Al-Fatah was 3100. Receipt is on the order.', NULL, (extract(epoch FROM timestamptz '2026-10-06 10:10:00+05') * 1000)::bigint),
  ('mmmmmmmm-0009-4000-8000-000000000002', 'tttttttt-0007-4000-8000-000000000007', 'aaaaaaaa-0001-4000-8000-000000000001', 'Transferred 3100.', NULL, (extract(epoch FROM timestamptz '2026-10-06 10:40:00+05') * 1000)::bigint),

  ('mmmmmmmm-0010-4000-8000-000000000001', 'tttttttt-0008-4000-8000-000000000008', 'aaaaaaaa-0001-4000-8000-000000000001', 'Bareeze was 1900. Still waiting on the transfer.', NULL, (extract(epoch FROM timestamptz '2026-10-11 18:10:00+05') * 1000)::bigint),
  ('mmmmmmmm-0010-4000-8000-000000000002', 'tttttttt-0008-4000-8000-000000000008', 'aaaaaaaa-0003-4000-8000-000000000003', 'I will send it tonight.', NULL, (extract(epoch FROM timestamptz '2026-10-11 18:25:00+05') * 1000)::bigint),

  ('mmmmmmmm-0011-4000-8000-000000000001', 'tttttttt-0009-4000-8000-000000000009', 'aaaaaaaa-0002-4000-8000-000000000002', 'Please cancel Engine. I changed my mind.', NULL, (extract(epoch FROM timestamptz '2026-10-02 16:35:00+05') * 1000)::bigint),
  ('mmmmmmmm-0011-4000-8000-000000000002', 'tttttttt-0009-4000-8000-000000000009', 'aaaaaaaa-0001-4000-8000-000000000001', 'Cancelled. Nothing was charged.', NULL, (extract(epoch FROM timestamptz '2026-10-02 16:45:00+05') * 1000)::bigint),

  ('mmmmmmmm-0012-4000-8000-000000000001', 'tttttttt-0010-4000-8000-000000000010', 'aaaaaaaa-0003-4000-8000-000000000003', 'I have to cancel Metro. The card limit is used.', NULL, (extract(epoch FROM timestamptz '2026-10-03 15:05:00+05') * 1000)::bigint),
  ('mmmmmmmm-0012-4000-8000-000000000002', 'tttttttt-0010-4000-8000-000000000010', 'aaaaaaaa-0001-4000-8000-000000000001', 'No problem. We can try next week.', NULL, (extract(epoch FROM timestamptz '2026-10-03 15:20:00+05') * 1000)::bigint),

  ('mmmmmmmm-0013-4000-8000-000000000001', 'tttttttt-0011-4000-8000-000000000011', 'aaaaaaaa-0002-4000-8000-000000000002', 'Carrefour came to 5800 on the MCB card.', NULL, (extract(epoch FROM timestamptz '2026-10-07 09:00:00+05') * 1000)::bigint),
  ('mmmmmmmm-0013-4000-8000-000000000002', 'tttttttt-0011-4000-8000-000000000011', 'aaaaaaaa-0003-4000-8000-000000000003', 'Sent 5800. Thanks.', NULL, (extract(epoch FROM timestamptz '2026-10-07 09:20:00+05') * 1000)::bigint),

  ('mmmmmmmm-0014-4000-8000-000000000001', 'tttttttt-0012-4000-8000-000000000012', 'aaaaaaaa-0002-4000-8000-000000000002', 'Miniso was 1500.', NULL, (extract(epoch FROM timestamptz '2026-10-09 09:15:00+05') * 1000)::bigint),
  ('mmmmmmmm-0014-4000-8000-000000000002', 'tttttttt-0012-4000-8000-000000000012', 'aaaaaaaa-0001-4000-8000-000000000001', 'Paid you back.', NULL, (extract(epoch FROM timestamptz '2026-10-09 09:45:00+05') * 1000)::bigint),

  ('mmmmmmmm-0015-4000-8000-000000000001', 'tttttttt-0013-4000-8000-000000000013', 'aaaaaaaa-0003-4000-8000-000000000003', 'Daraz Mart was 3600. Receipt is attached on the order.', NULL, (extract(epoch FROM timestamptz '2026-10-10 17:10:00+05') * 1000)::bigint),
  ('mmmmmmmm-0015-4000-8000-000000000002', 'tttttttt-0013-4000-8000-000000000013', 'aaaaaaaa-0002-4000-8000-000000000002', 'I will transfer 3600 after work.', NULL, (extract(epoch FROM timestamptz '2026-10-10 17:30:00+05') * 1000)::bigint),

  ('mmmmmmmm-0016-4000-8000-000000000001', 'tttttttt-0014-4000-8000-000000000014', 'aaaaaaaa-0002-4000-8000-000000000002', 'Sana Safinaz would not take the card. I cancelled.', NULL, (extract(epoch FROM timestamptz '2026-09-30 18:05:00+05') * 1000)::bigint),
  ('mmmmmmmm-0016-4000-8000-000000000002', 'tttttttt-0014-4000-8000-000000000014', 'aaaaaaaa-0003-4000-8000-000000000003', 'Thanks for trying.', NULL, (extract(epoch FROM timestamptz '2026-09-30 18:20:00+05') * 1000)::bigint),

  ('mmmmmmmm-0017-4000-8000-000000000001', 'tttttttt-0015-4000-8000-000000000015', 'aaaaaaaa-0002-4000-8000-000000000002', 'Liberty Books was 800. That card is gone now, but the order stands.', NULL, (extract(epoch FROM timestamptz '2026-08-12 16:10:00+05') * 1000)::bigint),
  ('mmmmmmmm-0017-4000-8000-000000000002', 'tttttttt-0015-4000-8000-000000000015', 'aaaaaaaa-0001-4000-8000-000000000001', 'Sent 800.', NULL, (extract(epoch FROM timestamptz '2026-08-12 17:00:00+05') * 1000)::bigint),

  ('mmmmmmmm-0018-4000-8000-000000000001', 'tttttttt-0016-4000-8000-000000000016', 'aaaaaaaa-0003-4000-8000-000000000003', 'Cancelling Chenone. I found it cheaper.', NULL, (extract(epoch FROM timestamptz '2026-10-01 15:45:00+05') * 1000)::bigint),
  ('mmmmmmmm-0018-4000-8000-000000000002', 'tttttttt-0016-4000-8000-000000000016', 'aaaaaaaa-0001-4000-8000-000000000001', 'Cancelled before checkout.', NULL, (extract(epoch FROM timestamptz '2026-10-01 15:55:00+05') * 1000)::bigint),

  ('mmmmmmmm-0019-4000-8000-000000000001', 'tttttttt-0017-4000-8000-000000000017', 'aaaaaaaa-0003-4000-8000-000000000003', 'Hyperstar was 2100.', NULL, (extract(epoch FROM timestamptz '2026-09-13 09:20:00+05') * 1000)::bigint),
  ('mmmmmmmm-0019-4000-8000-000000000002', 'tttttttt-0017-4000-8000-000000000017', 'aaaaaaaa-0001-4000-8000-000000000001', 'Sent. Mark it paid when you see it.', NULL, (extract(epoch FROM timestamptz '2026-09-13 09:50:00+05') * 1000)::bigint),

  ('mmmmmmmm-0020-4000-8000-000000000001', 'tttttttt-0018-4000-8000-000000000018', 'aaaaaaaa-0002-4000-8000-000000000002', 'Please cancel Batik. I ordered the wrong colour.', NULL, (extract(epoch FROM timestamptz '2026-10-09 16:05:00+05') * 1000)::bigint),
  ('mmmmmmmm-0020-4000-8000-000000000002', 'tttttttt-0018-4000-8000-000000000018', 'aaaaaaaa-0003-4000-8000-000000000003', 'Cancelled. The card was not charged.', NULL, (extract(epoch FROM timestamptz '2026-10-09 16:20:00+05') * 1000)::bigint);

-- Daraz: Sara has read through message 26, so Ahmed's 27, 29, 31, and 33 are still unread.
-- Ahmed has read through message 29, so Sara's 30 and 32 are still unread.
-- Khaadi: Sara has read the newest message. Ahmed has no row, so both of Sara's messages are unread.
INSERT INTO chat_reads (user_id, thread_id, last_read_at) VALUES
  (
    'aaaaaaaa-0001-4000-8000-000000000001',
    'rrrrrrrr-0001-4000-8000-000000000001',
    (extract(epoch FROM timestamptz '2026-10-12 10:00:00+05') * 1000)::bigint + (26 * 60000)
  ),
  (
    'aaaaaaaa-0002-4000-8000-000000000002',
    'rrrrrrrr-0001-4000-8000-000000000001',
    (extract(epoch FROM timestamptz '2026-10-12 10:00:00+05') * 1000)::bigint + (29 * 60000)
  ),
  (
    'aaaaaaaa-0001-4000-8000-000000000001',
    'rrrrrrrr-0002-4000-8000-000000000002',
    (extract(epoch FROM timestamptz '2026-10-13 16:55:00+05') * 1000)::bigint
  ),
  -- Bata: Ahmed has read Bilal's reply only up to message 1, so Bilal's message 2 is unread (1).
  -- Bilal has no row, so Ahmed's messages 1, 3 and 4 are unread (3).
  (
    'aaaaaaaa-0002-4000-8000-000000000002',
    'rrrrrrrr-0005-4000-8000-000000000005',
    (extract(epoch FROM timestamptz '2026-10-14 10:01:00+05') * 1000)::bigint
  ),
  -- Ideas: Ahmed has read up to his own message 3, so Bilal's message 4 is unread (1).
  -- Bilal has no row, so Ahmed's messages 2 and 3 are unread (2).
  (
    'aaaaaaaa-0002-4000-8000-000000000002',
    'rrrrrrrr-0006-4000-8000-000000000006',
    (extract(epoch FROM timestamptz '2026-10-14 15:30:00+05') * 1000)::bigint
  );

DROP FUNCTION pg_temp.seed_ts(int, int);

COMMIT;
