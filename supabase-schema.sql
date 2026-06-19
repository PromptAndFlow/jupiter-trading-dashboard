-- Jupiter Perps Journal — Supabase Schema
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Create the trades table
CREATE TABLE IF NOT EXISTS trades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date_str TEXT NOT NULL,
  pnl DOUBLE PRECISION NOT NULL DEFAULT 0,
  market TEXT DEFAULT 'SOL-PERP',
  side TEXT DEFAULT 'Long',
  size DOUBLE PRECISION,
  entry_price DOUBLE PRECISION,
  exit_price DOUBLE PRECISION,
  fees DOUBLE PRECISION DEFAULT 0,
  leverage TEXT,
  collateral DOUBLE PRECISION,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create the user_settings table (for goals, theme, etc.)
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  goals JSONB DEFAULT '{}',
  theme JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Enable Row Level Security
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies — users can only access their own data
CREATE POLICY "Users can view own trades" ON trades
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trades" ON trades
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trades" ON trades
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trades" ON trades
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own settings" ON user_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings" ON user_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" ON user_settings
  FOR UPDATE USING (auth.uid() = user_id);

-- 5. Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_date ON trades(user_id, date_str);
CREATE INDEX IF NOT EXISTS idx_settings_user ON user_settings(user_id);
