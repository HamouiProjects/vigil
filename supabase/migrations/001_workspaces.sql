CREATE TABLE workspaces (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        REFERENCES auth.users(id),
  name        text        DEFAULT 'Workspace 1',
  layout_json jsonb,
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own workspaces"
  ON workspaces FOR ALL
  USING (auth.uid() = user_id);
