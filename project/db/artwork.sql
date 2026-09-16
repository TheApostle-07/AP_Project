CREATE TABLE IF NOT EXISTS artwork_purchases (
  id uuid PRIMARY KEY,
  reference text NOT NULL UNIQUE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  artwork_id text NOT NULL,
  title_snapshot text NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency = 'INR'),
  payment_mode text NOT NULL CHECK (payment_mode IN ('test', 'live')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'REFUNDED', 'REVIEW')),
  provider_payment_id text UNIQUE,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artwork_payment_attempts (
  id uuid PRIMARY KEY,
  purchase_id uuid NOT NULL REFERENCES artwork_purchases(id),
  receipt text NOT NULL UNIQUE,
  provider_order_id text UNIQUE,
  status text NOT NULL CHECK (status IN ('CREATING', 'PENDING', 'FAILED', 'PAID', 'REFUNDED', 'REVIEW')),
  lease_id uuid,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS artwork_one_open_attempt
  ON artwork_payment_attempts (purchase_id) WHERE status IN ('CREATING', 'PENDING');
CREATE INDEX IF NOT EXISTS artwork_attempt_purchase ON artwork_payment_attempts (purchase_id, created_at DESC);
