# Supabase Migration Guide

This guide walks you through migrating your Signals POC from local JSON files to a Supabase (PostgreSQL) backend.

## Overview

The migration adds:
- **Persistent storage** in PostgreSQL via Supabase
- **Real-time data** across multiple users/sessions
- **Structured queries** and relationships
- **Audit trail** for all operations
- **Scalable architecture** for production use

## Quick Start

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and API keys from Settings → API
3. Copy the keys to your `.env` file:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SECRET_KEY=sb_secret_xxx
```

### 2. Apply Database Schema

Run the migration to create all tables:

```bash
# If you have Supabase CLI installed:
supabase db push

# Or manually run the SQL in supabase/migrations/0001_init.sql
# via the Supabase Dashboard → SQL Editor
```

### 3. Setup Python Environment

```bash
# Install Supabase client
pip install supabase

# Run setup script
python scripts/setup_supabase.py
```

### 4. Migrate Existing Data

```bash
# Backfill from existing runs
python scripts/backfill_from_runs.py
```

### 5. Start the New UI

```bash
# Use the Supabase-backed viewer
streamlit run app/viewer_supabase.py
```

## Database Schema

### Core Tables

- **`sessions`** - Meeting metadata and timing
- **`speakers`** - Participant information
- **`utterances`** - Individual speaker turns
- **`chunks`** - Text chunks for analysis
- **`topics`** - Canonical topic definitions
- **`topic_aliases`** - Alternative names for topics
- **`topic_relations`** - Parent-child topic relationships
- **`topic_candidates`** - New topics detected from meetings
- **`mentions`** - Topic mentions in chunks
- **`scoring_runs`** - Configuration for scoring runs
- **`topic_scores`** - Computed scores per topic per run
- **`events`** - Audit trail for all operations

### Key Relationships

```
sessions → utterances → chunks → mentions → topics
sessions → topic_candidates → topics
topics → topic_aliases
topics → topic_relations (parent/child)
scoring_runs → topic_scores → topics
```

## API Usage

### Basic Operations

```python
from pipeline.db import *

# Topics
upsert_topic("product_dev", "Product Development", "Feature planning and development")
add_alias("product dev", "product_dev")

# Candidates
candidates = get_pending_candidates()
approve_candidate(candidate_id, "new_topic", "New Topic Label")

# Mentions
mentions = get_mentions(session_id="123", topic_id="product_dev")
insert_mentions([{...}])

# Scoring
run_id = start_scoring_run({"half_life_days": 21.0, ...})
write_topic_scores(run_id, [{...}])
```

### Data Flow

1. **Ingest**: Meeting JSON → sessions + speakers + utterances
2. **Process**: Run pipeline → chunks + candidates + mentions
3. **Review**: Approve/reject/merge candidates → topics + aliases
4. **Score**: Compute topic scores → scoring_runs + topic_scores

## UI Features

### Pipeline Tab
- Upload meeting transcripts
- Run the full pipeline
- Automatically persist results to Supabase

### New Topics Tab
- Review pending candidates
- Approve, reject, or merge candidates
- Create new topics or aliases

### Taxonomy Tab
- View all topics, aliases, and relations
- Manage topic hierarchy
- Add new topics manually

### Mentions Tab
- Browse all topic mentions
- Filter by session or topic
- View mention metadata

### Scores Tab
- Configure scoring parameters
- Run scoring algorithms
- View latest topic scores

## Migration Strategy

### Phase 1: Setup (Complete)
- ✅ Database schema
- ✅ Python client layer
- ✅ Basic UI integration

### Phase 2: Data Migration
- ✅ Backfill script
- ✅ Sample data creation
- ⏳ Migrate existing runs

### Phase 3: Full Integration
- ⏳ Update pipeline to write directly to DB
- ⏳ Real-time scoring integration
- ⏳ Advanced UI features

### Phase 4: Production
- ⏳ Authentication & RLS
- ⏳ Performance optimization
- ⏳ Monitoring & alerts

## Configuration

### Environment Variables

```bash
# Required
SUPABASE_URL=https://your-project-ref.supabase.co

# Use one of these (secret key recommended for server-side)
SUPABASE_SECRET_KEY=sb_secret_xxx
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx

# Optional (for legacy compatibility)
SUPABASE_SERVICE_ROLE_KEY=sb_service_role_xxx
SUPABASE_ANON_KEY=sb_anon_xxx
```

### Row Level Security (RLS)

For development, RLS is disabled by default. For production:

```sql
-- Enable RLS on all tables
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentions ENABLE ROW LEVEL SECURITY;
-- ... etc

-- Add policies
CREATE POLICY "Allow authenticated read" ON topics
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow service role write" ON topics
  FOR ALL TO service_role USING (true);
```

## Troubleshooting

### Common Issues

1. **Connection failed**: Check your API keys and URL
2. **Table not found**: Run the migration SQL
3. **Permission denied**: Check RLS policies
4. **Import errors**: Verify environment variables

### Debug Commands

```bash
# Test connection
python -c "from pipeline.db import supa; print(supa().table('topics').select('count').execute())"

# Check environment
python scripts/setup_supabase.py

# View data
python -c "from pipeline.db import get_topics; print(get_topics())"
```

## Performance Considerations

### Indexes
- Primary keys are automatically indexed
- Foreign keys have indexes for joins
- Mention queries are indexed by topic and session
- Score queries are indexed by run and total score

### Query Optimization
- Use specific filters (session_id, topic_id)
- Limit result sets for large tables
- Consider pagination for mentions and scores

### Scaling
- Supabase handles connection pooling
- Consider read replicas for heavy analytics
- Use pgvector for embedding similarity (future)

## Next Steps

1. **Test the migration** with your existing data
2. **Customize the UI** for your specific needs
3. **Add authentication** for multi-user access
4. **Integrate scoring** with your existing algorithms
5. **Set up monitoring** and alerts

## Support

- Check the [Supabase documentation](https://supabase.com/docs)
- Review the database schema in `supabase/migrations/0001_init.sql`
- Test with the setup script: `python scripts/setup_supabase.py`
- Use the backfill script for data migration: `python scripts/backfill_from_runs.py`
