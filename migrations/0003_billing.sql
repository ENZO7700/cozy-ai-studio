-- Stripe billing: customer + subscription mapped to plan_tier per user

create table if not exists billing_customers (
  user_id text primary key references "user" ("id") on delete cascade,
  stripe_customer_id text not null unique,
  email text,
  created_at timestamptz not null default CURRENT_TIMESTAMP,
  updated_at timestamptz not null default CURRENT_TIMESTAMP
);

create table if not exists subscriptions (
  user_id text primary key references "user" ("id") on delete cascade,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan_tier text not null default 'FREE',
  status text not null default 'inactive',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default CURRENT_TIMESTAMP,
  updated_at timestamptz not null default CURRENT_TIMESTAMP
);

create index if not exists subscriptions_plan_tier_idx on subscriptions (plan_tier);
create index if not exists subscriptions_status_idx on subscriptions (status);
