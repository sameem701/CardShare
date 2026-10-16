-- database/testdata.sql
--
-- Three users. Safe to run again: it removes these three phones first, then inserts them.
-- Does not touch any other users.
--
-- Log in with the app's phone screen. Type the local number; the app sends +92.
-- The code is printed by the backend (WhatsApp send is not wired).
--
--   Sara Khan      03001111111
--   Ahmed Ali      03002222222
--   Bilal Hussain  03003333333
--
-- Circle has one row per pair, so three people only have three relationships.
-- Declined is not stored: that slot is Ahmed's pending invite to Bilal,
-- which is the invite Bilal can still accept or decline.
--   Sara  → Ahmed   accepted
--   Sara  → Bilal   accepted
--   Ahmed → Bilal   pending
-- Remove stays blocked on the two accepted pairs because both still have a live order.
--
-- Live orders, one per direction (the database allows only one):
--   Sara  → Ahmed   proof_submitted   Daraz          Sara can accept or reject the proof. Chat is open.
--   Ahmed → Sara    accepted          Khaadi         Sara can submit proof or either can cancel. Chat is open.
--   Sara  → Bilal   pending           Foodpanda      Bilal can accept or decline. Address stays hidden. No chat.
--   Bilal → Sara    pending           Junaid Jamshed Sara can accept or decline. Address stays hidden. No chat.
--
-- History covers unpaid, paid, cancelled by the requester, and cancelled by the holder.
-- Each person is the requester on some rows and the card holder on others.
-- Paid rows exist in August, September, and October so all-time totals and this month differ.
-- October paid rows are what the home totals use (updated_at in October 2026).
-- One paid row keeps a card id for a card that is no longer in the cards table.
-- Bank, tier, names, and amounts stay on that row, so History and the totals still count it.
-- Cancelled rows have a reason and no receipt, because cancel happens before proof.
-- Rows with a card charge also store holder_share: 20% of the gap, nearest rupee.
-- Chat on a transaction is read-only.
-- The Daraz thread has 33 messages so the chat screen can load an older page.
-- Screenshot and chat image paths are placeholders and will not load.

BEGIN;

CREATE TEMP TABLE seed_user_ids ON COMMIT DROP AS
SELECT id
FROM users
WHERE phone IN ('+923001111111', '+923002222222', '+923003333333');

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

DELETE FROM circle
WHERE user_id IN (SELECT id FROM seed_user_ids)
   OR friend_id IN (SELECT id FROM seed_user_ids);

DELETE FROM cards
WHERE user_id IN (SELECT id FROM seed_user_ids);

DELETE FROM otps
WHERE phone IN ('+923001111111', '+923002222222', '+923003333333');

DELETE FROM otp_phone_lockout
WHERE phone IN ('+923001111111', '+923002222222', '+923003333333');

DELETE FROM users
WHERE id IN (SELECT id FROM seed_user_ids);

-- Fixed ids so the rows below can refer to each other.
INSERT INTO users (id, phone, display_name, created_at) VALUES
  ('aaaaaaaa-0001-4000-8000-000000000001', '+923001111111', 'Sara Khan',     (extract(epoch FROM timestamptz '2026-09-01 09:00:00+05') * 1000)::bigint),
  ('aaaaaaaa-0002-4000-8000-000000000002', '+923002222222', 'Ahmed Ali',     (extract(epoch FROM timestamptz '2026-09-01 09:05:00+05') * 1000)::bigint),
  ('aaaaaaaa-0003-4000-8000-000000000003', '+923003333333', 'Bilal Hussain', (extract(epoch FROM timestamptz '2026-09-01 09:10:00+05') * 1000)::bigint);

-- Every tier appears once. Each person has a card that is sharing and a card that is not.
INSERT INTO cards (id, user_id, bank_name, card_tier, allow_sharing, created_at) VALUES
  ('cccccccc-0001-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'HBL',          'Gold',      1, (extract(epoch FROM timestamptz '2026-09-02 11:00:00+05') * 1000)::bigint),
  ('cccccccc-0001-4000-8000-000000000002', 'aaaaaaaa-0001-4000-8000-000000000001', 'Meezan',       'Classic',   0, (extract(epoch FROM timestamptz '2026-09-02 11:05:00+05') * 1000)::bigint),
  ('cccccccc-0002-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000002', 'UBL',          'Platinum',  1, (extract(epoch FROM timestamptz '2026-09-02 12:00:00+05') * 1000)::bigint),
  ('cccccccc-0002-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000002', 'MCB',          'Signature', 1, (extract(epoch FROM timestamptz '2026-09-02 12:05:00+05') * 1000)::bigint),
  ('cccccccc-0002-4000-8000-000000000003', 'aaaaaaaa-0002-4000-8000-000000000002', 'Bank Alfalah', 'World',     0, (extract(epoch FROM timestamptz '2026-09-02 12:10:00+05') * 1000)::bigint),
  ('cccccccc-0003-4000-8000-000000000001', 'aaaaaaaa-0003-4000-8000-000000000003', 'Askari',       'Titanium',  1, (extract(epoch FROM timestamptz '2026-09-02 13:00:00+05') * 1000)::bigint),
  ('cccccccc-0003-4000-8000-000000000002', 'aaaaaaaa-0003-4000-8000-000000000003', 'Faysal Bank',  'Classic',   0, (extract(epoch FROM timestamptz '2026-09-02 13:05:00+05') * 1000)::bigint);

-- user_id sent the invite. friend_id received it.
INSERT INTO circle (user_id, friend_id, c_status, created_at) VALUES
  ('aaaaaaaa-0001-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000002', 'accepted', (extract(epoch FROM timestamptz '2026-09-03 10:00:00+05') * 1000)::bigint),
  ('aaaaaaaa-0001-4000-8000-000000000001', 'aaaaaaaa-0003-4000-8000-000000000003', 'accepted', (extract(epoch FROM timestamptz '2026-09-03 10:05:00+05') * 1000)::bigint),
  ('aaaaaaaa-0002-4000-8000-000000000002', 'aaaaaaaa-0003-4000-8000-000000000003', 'pending',  (extract(epoch FROM timestamptz '2026-10-14 18:00:00+05') * 1000)::bigint);

INSERT INTO requests (
  id, requester_id, card_holder_id, card_id, merchant, product_url,
  delivery_address, order_amount, actual_amount_paid, note, screenshot_url,
  rq_status, created_at, updated_at
) VALUES
  (
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
  );

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
    'UBL', 'Platinum',
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
    'MCB', 'Signature',
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
    'UBL', 'Platinum',
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
    'HBL', 'Gold',
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
    'HBL', 'Gold',
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
    'HBL', 'Gold',
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
    'Askari', 'Titanium',
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
    'HBL', 'Gold',
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
    'HBL', 'Gold',
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
    'Askari', 'Titanium',
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
    'MCB', 'Signature',
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
    'UBL', 'Platinum',
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
    'Askari', 'Titanium',
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
    'UBL', 'Platinum',
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
    'Meezan', 'Classic',
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
    'Askari', 'Titanium',
    2100, 100, 'seed/hyperstar-receipt.jpg',
    'paid', NULL,
    (extract(epoch FROM timestamptz '2026-09-12 13:00:00+05') * 1000)::bigint,
    (extract(epoch FROM timestamptz '2026-09-13 10:00:00+05') * 1000)::bigint
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
  ('mmmmmmmm-0019-4000-8000-000000000002', 'tttttttt-0017-4000-8000-000000000017', 'aaaaaaaa-0001-4000-8000-000000000001', 'Sent. Mark it paid when you see it.', NULL, (extract(epoch FROM timestamptz '2026-09-13 09:50:00+05') * 1000)::bigint);

COMMIT;
