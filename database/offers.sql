-- Peekaboo offer catalog.
-- Banks and tiers are rows, not CHECKs. New names from parse are inserted by load_offers.py.
-- Safe to run again.

CREATE TABLE IF NOT EXISTS banks (
  name VARCHAR(100) PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS card_tiers (
  name VARCHAR(50) PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS stores (
  id         INT PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  slug       VARCHAR(200),
  city       VARCHAR(100) NOT NULL DEFAULT 'Karachi',
  updated_at BIGINT NOT NULL
);

ALTER TABLE stores ADD COLUMN IF NOT EXISTS city VARCHAR(100);
UPDATE stores SET city = 'Karachi' WHERE city IS NULL OR btrim(city) = '';
ALTER TABLE stores ALTER COLUMN city SET DEFAULT 'Karachi';
ALTER TABLE stores ALTER COLUMN city SET NOT NULL;

CREATE TABLE IF NOT EXISTS card_offers (
  id                 VARCHAR(36) PRIMARY KEY,
  store_id           INT NOT NULL REFERENCES stores(id),
  bank_name          VARCHAR(100) NOT NULL REFERENCES banks(name),
  card_tier          VARCHAR(50) NOT NULL REFERENCES card_tiers(name),
  discount_percent   INT,
  discount_flat_pkr  INT,
  cap_pkr            INT,
  min_order_pkr      INT,
  promo_code         VARCHAR(100),
  first_order_only   INT NOT NULL DEFAULT 0 CHECK (first_order_only IN (0, 1)),
  voucher_required   INT NOT NULL DEFAULT 0 CHECK (voucher_required IN (0, 1)),
  title              VARCHAR(300),
  start_date         BIGINT,
  end_date           BIGINT,
  source_url         TEXT,
  peekaboo_deal_ids  TEXT,
  valid_days         TEXT,
  updated_at         BIGINT NOT NULL,
  UNIQUE (store_id, bank_name, card_tier, first_order_only)
);

CREATE INDEX IF NOT EXISTS idx_card_offers_store ON card_offers(store_id);
CREATE INDEX IF NOT EXISTS idx_card_offers_bank_tier ON card_offers(bank_name, card_tier);

-- Existing cards tables used CHECK lists. Drop those so Peekaboo names can be stored.
DO $$
DECLARE r RECORD;
BEGIN
  IF to_regclass('public.cards') IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.cards'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%bank_name%'
  LOOP
    EXECUTE format('ALTER TABLE cards DROP CONSTRAINT %I', r.conname);
  END LOOP;

  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.cards'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%card_tier%'
  LOOP
    EXECUTE format('ALTER TABLE cards DROP CONSTRAINT %I', r.conname);
  END LOOP;

  INSERT INTO banks (name)
  SELECT DISTINCT bank_name FROM cards
  ON CONFLICT DO NOTHING;

  INSERT INTO card_tiers (name)
  SELECT DISTINCT card_tier FROM cards
  ON CONFLICT DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cards_bank_name_fkey'
  ) THEN
    ALTER TABLE cards
      ADD CONSTRAINT cards_bank_name_fkey
      FOREIGN KEY (bank_name) REFERENCES banks(name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cards_card_tier_fkey'
  ) THEN
    ALTER TABLE cards
      ADD CONSTRAINT cards_card_tier_fkey
      FOREIGN KEY (card_tier) REFERENCES card_tiers(name);
  END IF;
END $$;


CREATE OR REPLACE FUNCTION list_banks()
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(name ORDER BY name), '[]'::json)
    FROM banks
  );
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION list_card_tiers()
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(name ORDER BY name), '[]'::json)
    FROM card_tiers
  );
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION offer_save_pkr(
  p_percent   INT,
  p_flat      INT,
  p_cap       INT,
  p_order_pkr INT
) RETURNS INT AS $$
DECLARE
  v_raw BIGINT;
BEGIN
  IF p_percent IS NOT NULL THEN
    v_raw := (p_percent::bigint * GREATEST(p_order_pkr, 0)) / 100;
  ELSE
    v_raw := COALESCE(p_flat, 0);
  END IF;
  IF p_cap IS NOT NULL THEN
    v_raw := LEAST(v_raw, p_cap);
  END IF;
  RETURN v_raw::int;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- valid_days is a JSON array of weekday tokens (mon..sun). Empty / null means every day.
CREATE OR REPLACE FUNCTION offer_day_ok(p_valid_days TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_day TEXT;
BEGIN
  IF p_valid_days IS NULL OR btrim(p_valid_days) = '' OR p_valid_days = 'null' THEN
    RETURN TRUE;
  END IF;
  v_day := CASE EXTRACT(ISODOW FROM (now() AT TIME ZONE 'Asia/Karachi'))::int
    WHEN 1 THEN 'mon'
    WHEN 2 THEN 'tue'
    WHEN 3 THEN 'wed'
    WHEN 4 THEN 'thu'
    WHEN 5 THEN 'fri'
    WHEN 6 THEN 'sat'
    WHEN 7 THEN 'sun'
  END;
  BEGIN
    RETURN (p_valid_days::jsonb) ? v_day;
  EXCEPTION WHEN others THEN
    RETURN TRUE;
  END;
END;
$$ LANGUAGE plpgsql STABLE;


DROP FUNCTION IF EXISTS list_stores();
DROP FUNCTION IF EXISTS list_stores(TEXT);
DROP FUNCTION IF EXISTS search_stores(TEXT);
DROP FUNCTION IF EXISTS search_stores(TEXT, TEXT);
DROP FUNCTION IF EXISTS apply_store(VARCHAR, INT, INT);
DROP FUNCTION IF EXISTS apply_store(VARCHAR, INT, INT, VARCHAR);
DROP FUNCTION IF EXISTS list_store_offers(INT, INT);
DROP FUNCTION IF EXISTS list_store_offers(INT, INT, VARCHAR);
DROP FUNCTION IF EXISTS list_card_earn_preview(VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS list_card_earn_preview(VARCHAR, VARCHAR, VARCHAR);

-- Stores that currently have at least one card offer in this city.
-- Empty query returns all of them for that city. Current dump is Karachi.
CREATE OR REPLACE FUNCTION search_stores(
  p_query TEXT DEFAULT NULL,
  p_city  TEXT DEFAULT 'Karachi'
)
RETURNS JSON AS $$
DECLARE
  v_q TEXT := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_city TEXT := LOWER(btrim(COALESCE(NULLIF(btrim(COALESCE(p_city, '')), ''), 'Karachi')));
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(s ORDER BY s.name), '[]'::json)
    FROM (
      SELECT DISTINCT st.id, st.name, st.slug, st.city
      FROM stores st
      JOIN card_offers o ON o.store_id = st.id
      WHERE LOWER(btrim(st.city)) = v_city
        AND (
          v_q IS NULL
          OR st.name ILIKE '%' || v_q || '%'
          OR COALESCE(st.slug, '') ILIKE '%' || v_q || '%'
        )
    ) s
  );
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION list_stores(p_city TEXT DEFAULT 'Karachi')
RETURNS JSON AS $$
BEGIN
  RETURN search_stores(NULL, p_city);
END;
$$ LANGUAGE plpgsql;


DROP FUNCTION IF EXISTS match_circle_offers(VARCHAR, INT, INT);


-- Home Apply: catalog hit, ranked circle matches, and blocked (below min / wrong day).
CREATE OR REPLACE FUNCTION apply_store(
  p_user_id   VARCHAR(36),
  p_store_id  INT,
  p_order_pkr INT DEFAULT 10000,
  p_city      TEXT DEFAULT 'Karachi'
)
RETURNS JSON AS $$
DECLARE
  v_store JSON;
  v_has_catalog BOOLEAN;
  v_miss TEXT;
  v_city TEXT := LOWER(btrim(COALESCE(NULLIF(btrim(COALESCE(p_city, '')), ''), 'Karachi')));
BEGIN
  SELECT json_build_object('id', st.id, 'name', st.name, 'slug', st.slug, 'city', st.city)
  INTO v_store
  FROM stores st
  WHERE st.id = p_store_id
    AND LOWER(btrim(st.city)) = v_city;

  v_has_catalog := EXISTS (
    SELECT 1 FROM card_offers o WHERE o.store_id = p_store_id
  );

  IF v_store IS NULL OR NOT v_has_catalog THEN
    v_miss := 'no_store';
  END IF;

  RETURN (
    WITH friends AS (
      SELECT friend_id AS person_id, sender_contact_name AS contact_name
      FROM circle
      WHERE user_id = p_user_id AND c_status = 'accepted'
      UNION
      SELECT user_id AS person_id, friend_contact_name AS contact_name
      FROM circle
      WHERE friend_id = p_user_id AND c_status = 'accepted'
    ),
    hits AS (
      SELECT DISTINCT ON (u.id, o.bank_name, o.card_tier, o.first_order_only)
        u.id AS holder_id,
        u.display_name,
        u.phone,
        f.contact_name,
        c.id AS card_id,
        o.bank_name,
        o.card_tier,
        o.title,
        o.discount_percent,
        o.discount_flat_pkr,
        o.cap_pkr,
        o.min_order_pkr,
        o.promo_code,
        o.first_order_only,
        o.voucher_required,
        o.source_url,
        offer_save_pkr(o.discount_percent, o.discount_flat_pkr, o.cap_pkr, p_order_pkr) AS save_pkr,
        CASE
          WHEN COALESCE(o.min_order_pkr, 0) > p_order_pkr THEN 'below_min'
          WHEN NOT offer_day_ok(o.valid_days) THEN 'wrong_day'
          ELSE NULL
        END AS block_reason,
        EXISTS (
          SELECT 1 FROM requests r
          WHERE r.requester_id = p_user_id
            AND r.card_holder_id = u.id
        ) AS has_live_order
      FROM friends f
      JOIN users u ON u.id = f.person_id
      JOIN cards c ON c.user_id = u.id AND c.allow_sharing = 1
      JOIN card_offers o
        ON o.store_id = p_store_id
        AND o.bank_name = c.bank_name
        AND o.card_tier = c.card_tier
      ORDER BY u.id, o.bank_name, o.card_tier, o.first_order_only, c.created_at DESC
    ),
    working AS (
      SELECT DISTINCT ON (holder_id) *
      FROM hits
      WHERE block_reason IS NULL
      ORDER BY holder_id, save_pkr DESC, card_id
    ),
    blocked AS (
      SELECT DISTINCT ON (holder_id) *
      FROM hits
      WHERE block_reason IS NOT NULL
        AND holder_id NOT IN (SELECT holder_id FROM working)
      ORDER BY holder_id, save_pkr DESC, card_id
    )
    SELECT json_build_object(
      'store', v_store,
      'has_catalog', v_has_catalog,
      'miss', CASE
        WHEN v_miss IS NOT NULL THEN v_miss
        WHEN NOT EXISTS (SELECT 1 FROM working) AND NOT EXISTS (SELECT 1 FROM blocked)
          THEN 'no_circle_card'
        ELSE NULL
      END,
      'people', (
        SELECT COALESCE(json_agg(row_to_json(p) ORDER BY p.save_pkr DESC, p.display_name), '[]'::json)
        FROM working p
      ),
      'blocked', (
        SELECT COALESCE(json_agg(row_to_json(b) ORDER BY b.display_name), '[]'::json)
        FROM blocked b
      )
    )
  );
END;
$$ LANGUAGE plpgsql;


-- Catalog cards for a store, ranked by saving at p_order_pkr (onboarding Check discounts).
CREATE OR REPLACE FUNCTION list_store_offers(
  p_store_id  INT,
  p_order_pkr INT DEFAULT 5000,
  p_city      TEXT DEFAULT 'Karachi'
)
RETURNS JSON AS $$
DECLARE
  v_city TEXT := LOWER(btrim(COALESCE(NULLIF(btrim(COALESCE(p_city, '')), ''), 'Karachi')));
BEGIN
  RETURN (
    SELECT json_build_object(
      'store', (
        SELECT json_build_object('id', st.id, 'name', st.name, 'slug', st.slug, 'city', st.city)
        FROM stores st
        WHERE st.id = p_store_id
          AND LOWER(btrim(st.city)) = v_city
      ),
      'amount', p_order_pkr,
      'offers', (
        SELECT COALESCE(json_agg(row_to_json(x) ORDER BY x.save_pkr DESC, x.bank_name), '[]'::json)
        FROM (
          SELECT
            o.bank_name,
            o.card_tier,
            o.discount_percent,
            o.discount_flat_pkr,
            o.cap_pkr,
            o.min_order_pkr,
            o.title,
            o.promo_code,
            o.first_order_only,
            CASE
              WHEN COALESCE(o.min_order_pkr, 0) > p_order_pkr THEN 0
              ELSE offer_save_pkr(o.discount_percent, o.discount_flat_pkr, o.cap_pkr, p_order_pkr)
            END AS save_pkr
          FROM card_offers o
          JOIN stores st ON st.id = o.store_id
          WHERE o.store_id = p_store_id
            AND LOWER(btrim(st.city)) = v_city
        ) x
      )
    )
  );
END;
$$ LANGUAGE plpgsql;


-- Best Peekaboo offer per store for a bank + tier (onboarding earn preview).
-- Sample order is at least the min, or 5,000 PKR.
CREATE OR REPLACE FUNCTION list_card_earn_preview(
  p_bank_name VARCHAR,
  p_card_tier VARCHAR,
  p_city      TEXT DEFAULT 'Karachi'
)
RETURNS JSON AS $$
DECLARE
  v_city TEXT := LOWER(btrim(COALESCE(NULLIF(btrim(COALESCE(p_city, '')), ''), 'Karachi')));
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(row_to_json(x) ORDER BY x.save_pkr DESC, x.store_name), '[]'::json)
    FROM (
      SELECT DISTINCT ON (st.id)
        st.id AS store_id,
        st.name AS store_name,
        st.slug AS store_slug,
        GREATEST(COALESCE(o.min_order_pkr, 0), 5000) AS sample_amount,
        offer_save_pkr(
          o.discount_percent,
          o.discount_flat_pkr,
          o.cap_pkr,
          GREATEST(COALESCE(o.min_order_pkr, 0), 5000)
        ) AS save_pkr,
        (
          offer_save_pkr(
            o.discount_percent,
            o.discount_flat_pkr,
            o.cap_pkr,
            GREATEST(COALESCE(o.min_order_pkr, 0), 5000)
          ) * 20
        ) / 100 AS earn_pkr,
        o.discount_percent,
        o.discount_flat_pkr,
        o.cap_pkr,
        o.min_order_pkr
      FROM card_offers o
      JOIN stores st ON st.id = o.store_id
      WHERE o.bank_name = p_bank_name
        AND o.card_tier = p_card_tier
        AND LOWER(btrim(st.city)) = v_city
      ORDER BY st.id, offer_save_pkr(
        o.discount_percent,
        o.discount_flat_pkr,
        o.cap_pkr,
        GREATEST(COALESCE(o.min_order_pkr, 0), 5000)
      ) DESC
    ) x
  );
END;
$$ LANGUAGE plpgsql;
