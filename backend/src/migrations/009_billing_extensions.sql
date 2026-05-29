-- ─────────────────────────────────────────────────────────────────────────────
-- 009_billing_extensions.sql
--
-- Billing extensions for the subscription experience:
--   1. crypto_payment_invoices  — ISOLATED crypto billing (XLM / USDC) verified
--                                 read-only on Stellar Mainnet via Horizon.
--                                 Does NOT touch custody / settlement / managed
--                                 wallets. Payment is sent from ANY external
--                                 wallet to the EnergyPay treasury address.
--   2. user_payment_cards       — Tokenised cards (max 5/user). NEVER stores PAN
--                                 or CVV — only the gateway token + masked meta.
--   3. company_tax_profile      — Platform fiscal identity (singleton). Future
--                                 NF-e/NFS-e issuance prerequisite.
--   4. digital_certificate_status — Tracks the digital-certificate lifecycle.
--                                 The certificate file / password are NEVER kept
--                                 here (backend-encrypted storage, future work).
--   5. fiscal_documents         — Receipts now, official fiscal invoices later.
--
-- All statements are idempotent (IF NOT EXISTS / ON CONFLICT).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Crypto payment invoices (isolated billing flow) ─────────────────────────
CREATE TABLE IF NOT EXISTS crypto_payment_invoices (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id      UUID          REFERENCES user_subscriptions(id),
  plan_id              TEXT          NOT NULL REFERENCES subscription_plans(id),

  -- What the payer must send
  asset                TEXT          NOT NULL CHECK (asset IN ('XLM','USDC')),
  asset_code           TEXT          NOT NULL,            -- 'XLM' (native) or 'USDC'
  asset_issuer         TEXT,                              -- NULL for native XLM
  expected_amount      NUMERIC(20,7) NOT NULL,            -- Stellar = 7 decimals
  amount_brl           NUMERIC(10,2) NOT NULL,            -- plan price at issue time
  exchange_rate        NUMERIC(20,7),                     -- BRL per 1 unit of asset (snapshot)
  rate_source          TEXT,                              -- e.g. 'coingecko'

  -- Where it must go + how we match it
  treasury_public_key  TEXT          NOT NULL,            -- ENERGY_PAY_TREASURY_PUBLIC_KEY
  payment_reference    TEXT          NOT NULL UNIQUE,     -- unique memo for matching

  status               TEXT          NOT NULL DEFAULT 'PENDING_PAYMENT'
                                     CHECK (status IN ('PENDING_PAYMENT','PAID','EXPIRED','FAILED')),

  -- Confirmation evidence (filled on read-only Horizon verification)
  tx_hash              TEXT,
  ledger               BIGINT,
  source_account       TEXT,
  destination_account  TEXT,
  amount_received      NUMERIC(20,7),
  memo                 TEXT,
  confirmed_at         TIMESTAMPTZ,
  explorer_url         TEXT,                              -- stellar.expert public/mainnet

  expires_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crypto_invoices_user   ON crypto_payment_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_invoices_status ON crypto_payment_invoices(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crypto_invoices_reference
  ON crypto_payment_invoices(payment_reference);

-- 2. User payment cards (tokenised — NO PAN / NO CVV ever) ────────────────────
CREATE TABLE IF NOT EXISTS user_payment_cards (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gateway             TEXT        NOT NULL DEFAULT 'asaas'
                                  CHECK (gateway IN ('asaas','mercadopago','stripe')),
  gateway_token       TEXT        NOT NULL,               -- Asaas creditCardToken
  gateway_customer_id TEXT,
  brand               TEXT,                               -- VISA / MASTERCARD / ELO …
  last4               TEXT,                               -- masked metadata only
  holder_name         TEXT,
  exp_month           TEXT,
  exp_year            TEXT,
  is_default          BOOLEAN     NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_cards_user ON user_payment_cards(user_id);

-- At most one default card per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_cards_one_default
  ON user_payment_cards(user_id)
  WHERE is_default = true;

-- 3. Company tax profile (platform singleton) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS company_tax_profile (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name             TEXT,
  trade_name             TEXT,
  cnpj                   TEXT,
  municipal_registration TEXT,
  state_registration     TEXT,
  tax_regime             TEXT,
  city_code              TEXT,
  city_name              TEXT,
  state                  TEXT,
  address                TEXT,
  status                 TEXT        NOT NULL DEFAULT 'INCOMPLETE'
                                     CHECK (status IN ('INCOMPLETE','PENDING_REVIEW','ACTIVE')),
  is_active              BOOLEAN     NOT NULL DEFAULT true, -- the live singleton row
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the singleton INCOMPLETE profile if none exists
INSERT INTO company_tax_profile (status, is_active)
SELECT 'INCOMPLETE', true
WHERE NOT EXISTS (SELECT 1 FROM company_tax_profile);

-- 4. Digital certificate status (platform singleton) ──────────────────────────
--    NOTE: the certificate file and its password are NEVER stored in this table.
--    This only tracks lifecycle status for the UI / issuance gating.
CREATE TABLE IF NOT EXISTS digital_certificate_status (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  status           TEXT        NOT NULL DEFAULT 'NOT_CONFIGURED'
                               CHECK (status IN ('NOT_CONFIGURED','UPLOADED','VALID','EXPIRED','REVOKED','ERROR')),
  certificate_type TEXT        CHECK (certificate_type IN ('A1','A3')),
  subject_name     TEXT,
  expires_at       TIMESTAMPTZ,
  uploaded_at      TIMESTAMPTZ,
  error_message    TEXT,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO digital_certificate_status (status, is_active)
SELECT 'NOT_CONFIGURED', true
WHERE NOT EXISTS (SELECT 1 FROM digital_certificate_status);

-- 5. Fiscal documents (receipts now, NF-e / NFS-e later) ──────────────────────
CREATE TABLE IF NOT EXISTS fiscal_documents (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- The underlying payment may live in either billing table — disambiguate.
  payment_id       UUID        NOT NULL,
  payment_source   TEXT        NOT NULL
                               CHECK (payment_source IN ('subscription_payment','crypto_invoice')),

  type             TEXT        NOT NULL DEFAULT 'RECEIPT'
                               CHECK (type IN ('RECEIPT','NFE','NFSE')),
  status           TEXT        NOT NULL DEFAULT 'RECEIPT_AVAILABLE'
                               CHECK (status IN (
                                 'RECEIPT_AVAILABLE','PENDING_COMPANY_TAX_PROFILE',
                                 'PENDING_DIGITAL_CERTIFICATE','READY_TO_ISSUE',
                                 'ISSUING','SIGNED','ISSUED','FAILED','CANCELLED'
                               )),
  provider         TEXT        NOT NULL DEFAULT 'NONE'
                               CHECK (provider IN ('NONE','ASAAS','PLUG_NOTAS','FOCUS_NFE','CUSTOM')),
  document_number  TEXT,
  verification_code TEXT,
  access_key       TEXT,
  xml_url          TEXT,
  pdf_url          TEXT,
  signed_xml_url   TEXT,
  issued_at        TIMESTAMPTZ,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_documents_user    ON fiscal_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_payment ON fiscal_documents(payment_source, payment_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscal_documents_unique
  ON fiscal_documents(payment_source, payment_id, type);
