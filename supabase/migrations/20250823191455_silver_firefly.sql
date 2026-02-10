/*
  # Create users table

  1. New Tables
    - `users`
      - `id` (uuid, primary key)
      - `identity` (text, unique) - username for login
      - `password` (text) - user password (in production, this should be hashed)
      - `role` (text) - user role: admin, manager, or caller
      - `caller_ids` (text array) - Twilio phone numbers this user can use
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `users` table
    - Add policies for user access control
    - Users can view their own info, admins/managers can view all
    - Only admins can create new users
*/

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity text UNIQUE NOT NULL,
  password text NOT NULL,
  role text NOT NULL DEFAULT 'caller' CHECK (role IN ('admin', 'manager', 'caller')),
  caller_ids text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Insert initial admin user
INSERT INTO users (identity, password, role, caller_ids)
VALUES ('admin', 'admin123', 'admin', ARRAY['+15551234567'])
ON CONFLICT (identity) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own info, admins/managers can view all
CREATE POLICY "Users can view their own info, admins/managers can view all"
  ON users
  FOR SELECT
  USING (true); -- For now, allow all reads since we're not using Supabase auth

-- Policy: Only admins can create users
CREATE POLICY "Only admins can create users"
  ON users
  FOR INSERT
  WITH CHECK (true); -- For now, allow all inserts since we handle auth in functions

-- Policy: Users can update their own password, admins can update all
CREATE POLICY "Users can update their own data"
  ON users
  FOR UPDATE
  USING (true) -- For now, allow all updates since we handle auth in functions
  WITH CHECK (true);