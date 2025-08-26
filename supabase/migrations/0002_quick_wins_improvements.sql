-- Quick Wins: Database Constraints & Improvements (Corrected for actual schema)

-- 1. Hard guards against dupes (using proper PostgreSQL syntax)
-- Create unique indexes instead of constraints for function-based uniqueness
create unique index if not exists uq_topics_label on topics (lower(label));
create unique index if not exists uq_topic_aliases on topic_aliases (topic_id, lower(alias));
-- topic_relations already has a primary key constraint, so we're good there

-- 2. Rollup policy on subtopics (already exists as rollup_weight in topic_relations)
-- The column already exists, so no need to add it

-- 3. Better scoring runs & explanations (scoring_runs already exists, just enhance it)
-- Add new columns to existing scoring_runs table
alter table scoring_runs add column if not exists status text default 'queued';
alter table scoring_runs add column if not exists finished_at timestamptz;
alter table scoring_runs add column if not exists error text;

-- Add breakdown column to existing topic_scores table
alter table topic_scores add column if not exists breakdown jsonb;

-- 4. Effective taxonomy view
create or replace view v_topic_graph as
select t.id as topic_id, t.label, ta.alias, tr.parent_id, tr.child_id, tr.rollup_weight
from topics t
left join topic_aliases ta on ta.topic_id = t.id
left join topic_relations tr on tr.child_id = t.id;

-- 5. Settings table (create if it doesn't exist)
create table if not exists scoring_config (
  id integer primary key default 1,
  merge_threshold numeric default 0.65,
  decay_half_life_days numeric default 30,
  auto_chunk_tag_after_approval boolean default false,
  min_relevance_for_mention numeric default 0.35,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Insert default config if it doesn't exist
insert into scoring_config (id, merge_threshold, decay_half_life_days, auto_chunk_tag_after_approval, min_relevance_for_mention)
values (1, 0.65, 30, false, 0.35)
on conflict (id) do nothing;

-- 6. Better event tracking (update events table structure if needed)
-- Add new event types to existing events table
-- The events table already exists with the right structure

-- 7. Topic ID hygiene function
create or replace function slugify(text) returns text as $$
begin
  return lower(regexp_replace(regexp_replace($1, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
end;
$$ language plpgsql;

-- 8. Auto-slugify on topic creation
create or replace function auto_slugify_topic() returns trigger as $$
begin
  if new.topic_id_suggested is null or new.topic_id_suggested = '' then
    new.topic_id_suggested := slugify(new.label);
  end if;
  return new;
end;
$$ language plpgsql;

-- Drop existing trigger if it exists
drop trigger if exists auto_slugify_topic_trigger on topic_candidates;

create trigger auto_slugify_topic_trigger
  before insert on topic_candidates
  for each row
  execute function auto_slugify_topic();

-- 9. Add missing columns to chunks table for better context
alter table chunks add column if not exists speaker_name text;
alter table chunks add column if not exists timestamp timestamptz;

-- 10. Update mentions table to match frontend expectations
-- Add relevance column if it doesn't exist (some frontend code expects 'relevance' not 'relevance_r')
alter table mentions add column if not exists relevance numeric;
-- Update relevance column from relevance_r if it exists
update mentions set relevance = relevance_r where relevance is null and relevance_r is not null;

-- 11. Create a sessions view that matches frontend expectations
create or replace view meeting_sessions as
select 
  session_id as id,
  title,
  started_at,
  ended_at,
  meeting_type,
  created_at
from sessions;

-- 12. Create a topic_core view that matches frontend expectations
create or replace view topic_core as
select 
  id,
  label,
  description,
  status,
  created_at,
  created_by
from topics;
