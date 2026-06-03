-- bodi_conversations: stores each Bodi chatbot conversation for analytics
CREATE TABLE IF NOT EXISTS bodi_conversations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        text NOT NULL,
  started_at        timestamptz DEFAULT now(),
  ended_at          timestamptz,
  messages          jsonb DEFAULT '[]',
  topic             text,
  sentiment         text CHECK (sentiment IN ('positivo', 'neutro', 'negativo')),
  support_redirected boolean DEFAULT false,
  resolved          boolean,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned'))
);

CREATE INDEX IF NOT EXISTS idx_bodi_conv_status ON bodi_conversations (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_bodi_conv_topic  ON bodi_conversations (topic, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_bodi_conv_date   ON bodi_conversations (started_at DESC);

ALTER TABLE bodi_conversations ENABLE ROW LEVEL SECURITY;

-- anon can insert and update (chatbot users don't log in)
CREATE POLICY "anon_insert" ON bodi_conversations
  FOR INSERT TO anon WITH CHECK (true);

-- anon_update: session_id restriction not possible with anon key (no JWT sub claim available).
-- This is acceptable because the data is analytics-only with no PII account impact.
CREATE POLICY "anon_update" ON bodi_conversations
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- only authenticated (admin) can read
CREATE POLICY "auth_select" ON bodi_conversations
  FOR SELECT TO authenticated USING (true);
