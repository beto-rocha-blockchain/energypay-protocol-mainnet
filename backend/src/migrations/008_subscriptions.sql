-- ─────────────────────────────────────────────────────────────────────────────
-- 008_subscriptions.sql
--
-- Platform subscription & billing tables.
-- Supports PIX and credit card via configurable payment gateway (Asaas / Mercado Pago / Stripe).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Subscription plans (static master data)
CREATE TABLE IF NOT EXISTS subscription_plans (
  id                TEXT        PRIMARY KEY,   -- 'free', 'operator', 'enterprise'
  name              TEXT        NOT NULL,
  price_brl         NUMERIC(10,2) NOT NULL DEFAULT 0,
  interval          TEXT        NOT NULL DEFAULT 'monthly'
                                CHECK (interval IN ('monthly','annual')),
  settlements_limit INTEGER,                   -- NULL = unlimited
  features          JSONB       NOT NULL DEFAULT '[]',
  active            BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed plans (idempotent)
INSERT INTO subscription_plans (id, name, price_brl, settlements_limit, features) VALUES
  ('free',       'Free',       0.00,   5,    '["5 liquidações/mês","Dashboard básico","Acesso ao grid de mercado","Suporte via comunidade"]'),
  ('operator',   'Operator',   297.00, NULL, '["Liquidações ilimitadas","Analytics completo","Custody wallet ativa","Métricas de risco","Suporte prioritário"]'),
  ('enterprise', 'Enterprise', 997.00, NULL, '["Tudo do Operator","API x402 (50k calls/mês)","Multi-conta","Scoring de risco IA","Previsibilidade de mercado","SLA 99.9%","Suporte dedicado"]')
ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  price_brl   = EXCLUDED.price_brl,
  features    = EXCLUDED.features,
  active      = EXCLUDED.active;

-- 2. User subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id                TEXT        NOT NULL REFERENCES subscription_plans(id),
  status                 TEXT        NOT NULL DEFAULT 'active'
                                     CHECK (status IN ('active','trialing','past_due','cancelled','expired')),
  current_period_start   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end     TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN     NOT NULL DEFAULT false,
  settlements_used       INTEGER     NOT NULL DEFAULT 0,
  -- Payment gateway references (populated once the gateway is configured)
  gateway                TEXT        CHECK (gateway IN ('asaas','mercadopago','stripe')),
  gateway_customer_id    TEXT,
  gateway_subscription_id TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active subscription per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subscriptions_active
  ON user_subscriptions(user_id)
  WHERE status IN ('active','trialing','past_due');

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user   ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);

-- 3. Payment transactions
CREATE TABLE IF NOT EXISTS subscription_payments (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id     UUID        NOT NULL REFERENCES user_subscriptions(id),
  user_id             UUID        NOT NULL REFERENCES users(id),
  plan_id             TEXT        NOT NULL REFERENCES subscription_plans(id),
  amount_brl          NUMERIC(10,2) NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','paid','failed','refunded')),
  payment_method      TEXT        CHECK (payment_method IN ('pix','credit_card','boleto')),
  -- PIX-specific
  pix_qr_code         TEXT,       -- base64 image
  pix_qr_code_text    TEXT,       -- "copia e cola" text
  pix_expires_at      TIMESTAMPTZ,
  -- Gateway references
  gateway             TEXT,
  gateway_payment_id  TEXT,
  gateway_invoice_url TEXT,
  -- Timestamps
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_sub  ON subscription_payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_user ON subscription_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_status ON subscription_payments(status);

-- 4. Seed: all existing users without a subscription record → FREE plan
INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_start, settlements_used)
SELECT
  u.id,
  'free',
  'active',
  NOW(),
  0
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_subscriptions us WHERE us.user_id = u.id
);
