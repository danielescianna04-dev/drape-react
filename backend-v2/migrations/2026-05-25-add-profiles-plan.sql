-- Adds the `plan` column to profiles so the quota service can grant Plus
-- tier limits (5M tokens / 5h) to paying users.
--
-- HOW TO APPLY:
--   1. Supabase Dashboard → SQL Editor
--   2. Paste this file's contents
--   3. Run
--
-- Until applied, getUserTier() falls back to 'free' for every user, which
-- is the safe default — nobody accidentally gets unlimited usage.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free';

-- Allow only known tiers. Adjust when we add 'go' / annual tiers.
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_plan_check CHECK (plan IN ('free', 'plus'));

-- Optional: index for any dashboard that lists paying users.
CREATE INDEX IF NOT EXISTS idx_profiles_plan ON profiles (plan)
  WHERE plan <> 'free';
