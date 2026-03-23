create table if not exists conversation_sessions (
  session_id text primary key,
  latest_topic text,
  latest_query text,
  visitor_name text,
  visitor_email text,
  visitor_phone text,
  negotiation_detected boolean default false,
  last_user_message_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_conversation_sessions_updated_at
  on conversation_sessions(updated_at desc);

create or replace trigger update_conversation_sessions_updated_at
  before update on conversation_sessions
  for each row execute function update_updated_at();
