-- Enable pgvector now or later if you want embeddings in-db
-- create extension if not exists vector;

-- speakers
create table if not exists speakers (
  speaker_id       uuid primary key default gen_random_uuid(),
  display_name     text not null,
  email            text,
  is_internal      boolean not null default false,
  org              text,
  meta_json        jsonb,
  created_at       timestamptz not null default now()
);

-- sessions (meetings)
create table if not exists sessions (
  session_id       uuid primary key default gen_random_uuid(),
  title            text,
  meeting_type     text,
  started_at       timestamptz,
  ended_at         timestamptz,
  timezone         text,
  meta_json        jsonb,
  created_at       timestamptz not null default now()
);

-- session_attendees
create table if not exists session_attendees (
  session_id       uuid not null references sessions(session_id) on delete cascade,
  speaker_id       uuid not null references speakers(speaker_id) on delete cascade,
  role_in_session  text,
  primary key (session_id, speaker_id)
);

-- utterances (speaker turns)
create table if not exists utterances (
  utterance_id     uuid primary key default gen_random_uuid(),
  session_id       uuid not null references sessions(session_id) on delete cascade,
  speaker_id       uuid not null references speakers(speaker_id) on delete cascade,
  start_sec        double precision not null,
  end_sec          double precision,
  text             text not null,
  created_at       timestamptz not null default now()
);

-- chunks (optional; keep if you re-chunk)
create table if not exists chunks (
  chunk_id         uuid primary key default gen_random_uuid(),
  session_id       uuid not null references sessions(session_id) on delete cascade,
  source_utterance uuid references utterances(utterance_id) on delete set null,
  speaker_id       uuid references speakers(speaker_id) on delete set null,
  start_sec        double precision,
  end_sec          double precision,
  text             text not null,
  created_at       timestamptz not null default now()
);
create index if not exists idx_chunks_session on chunks(session_id);

-- topics (canonical)
create table if not exists topics (
  id               text primary key,              -- slug or UUID as text
  label            text not null,
  description      text,
  status           text not null default 'active',
  created_at       timestamptz not null default now(),
  created_by       text
  -- , embedding vector(1536)  -- uncomment if pgvector enabled
);

-- aliases
create table if not exists topic_aliases (
  alias_id         uuid primary key default gen_random_uuid(),
  alias            text unique not null,
  topic_id         text not null references topics(id) on delete cascade,
  created_at       timestamptz not null default now()
);

-- parent/child
create table if not exists topic_relations (
  parent_id        text not null references topics(id) on delete cascade,
  child_id         text not null references topics(id) on delete cascade,
  relation_type    text not null default 'parent_child',
  rollup_weight    double precision,
  primary key (parent_id, child_id, relation_type)
);

-- candidates (from detect-new-topics)
create table if not exists topic_candidates (
  candidate_id       uuid primary key default gen_random_uuid(),
  session_id         uuid not null references sessions(session_id) on delete cascade,
  topic_id_suggested text,      -- proposed slug
  label              text not null,
  evidence           text not null,
  why_new            text,
  status             text not null default 'pending', -- pending|approved|rejected|merged
  merged_into_topic  text references topics(id),
  approver_id        text,
  created_at         timestamptz not null default now(),
  decided_at         timestamptz
);
create index if not exists idx_topic_candidates_status on topic_candidates(status);

-- mentions
create table if not exists mentions (
  mention_id       uuid primary key default gen_random_uuid(),
  session_id       uuid not null references sessions(session_id) on delete cascade,
  chunk_id         uuid not null references chunks(chunk_id) on delete cascade,
  topic_id         text not null references topics(id) on delete cascade,
  evidence         text not null,
  surface_term     text,
  is_alias         boolean not null default false,
  relevance_r      double precision,
  importance_i     double precision,
  specificity_s    double precision,
  sentiment_tag    text,
  created_at       timestamptz not null,     -- time of the meeting mention
  recorded_at      timestamptz not null default now()
);
create index if not exists idx_mentions_topic on mentions(topic_id);
create index if not exists idx_mentions_session on mentions(session_id);
create index if not exists idx_mentions_created_at on mentions(created_at);

-- scoring runs
create table if not exists scoring_runs (
  run_id            uuid primary key default gen_random_uuid(),
  run_type          text not null, -- interactive|nightly|backfill
  run_at            timestamptz not null default now(),
  half_life_days    double precision not null default 21.0,
  default_rollup_alpha double precision not null default 0.40,
  min_relevance     double precision not null default 0.35,
  include_sentiment boolean not null default true,
  include_action    boolean not null default false,
  speaker_weight_map  jsonb,
  meeting_weight_map  jsonb,
  notes             text
);

-- topic scores per run
create table if not exists topic_scores (
  run_id           uuid not null references scoring_runs(run_id) on delete cascade,
  topic_id         text not null references topics(id) on delete cascade,
  direct_score     double precision not null,
  rollup_score     double precision not null,
  total_score      double precision not null,
  num_mentions     integer not null,
  last_mention_at  timestamptz,
  primary key (run_id, topic_id)
);
create index if not exists idx_topic_scores_total on topic_scores(run_id, total_score desc);

-- audit events
create table if not exists events (
  event_id         uuid primary key default gen_random_uuid(),
  occurred_at      timestamptz not null default now(),
  actor            text not null,    -- 'system' or user id/email
  event_type       text not null,    -- topic_approved, mentions_created, scoring_run_completed, ...
  session_id       uuid,
  topic_id         text,
  candidate_id     uuid,
  run_id           uuid,
  payload_json     jsonb
);
