# Signals Frontend

A modern Next.js frontend for the Signals POC, providing a clean interface for managing topic detection, approvals, and scoring.

## Features

- **Session Management**: Upload and ingest meeting transcripts
- **Candidate Review**: Approve, reject, or merge new topic candidates
- **Taxonomy Management**: View and manage topics, aliases, and relationships
- **Mentions Browser**: Explore topic mentions within sessions
- **Scoring Dashboard**: View and trigger topic scoring runs
- **Settings**: Configure merge thresholds and scoring parameters

## Tech Stack

- **Next.js 15** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **shadcn/ui** for components
- **Supabase** for backend (PostgreSQL + real-time)
- **React Hook Form** + **Zod** for form validation
- **Sonner** for toast notifications

## Quick Start

### 1. Setup Environment

Copy the example environment file and configure your Supabase credentials:

```bash
cp env.local.example .env.local
```

Edit `.env.local` with your Supabase project details:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SECRET_KEY=sb_secret_xxx
```

### 2. Setup Database

Run the schema in your Supabase SQL Editor:

```sql
-- Copy and paste the contents of supabase-schema.sql
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the application.

## Application Structure

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── sessions/page.tsx           # Session management
│   │   ├── candidates/[sessionId]/     # Candidate approvals
│   │   ├── taxonomy/page.tsx           # Topic management
│   │   ├── mentions/[sessionId]/       # Mentions browser
│   │   ├── scores/page.tsx             # Scoring dashboard
│   │   └── settings/page.tsx           # Configuration
│   ├── api/
│   │   ├── ingest/route.ts             # Session ingestion
│   │   ├── approvals/commit/route.ts   # Candidate decisions
│   │   └── chunk-tag/route.ts          # Pipeline triggers
│   ├── layout.tsx                      # Main layout
│   └── page.tsx                        # Home redirect
├── components/ui/                      # shadcn/ui components
└── lib/supabase/
    ├── browser.ts                      # Client-side Supabase
    └── server.ts                       # Server-side Supabase
```

## Pages Overview

### Sessions (`/sessions`)
- Upload meeting transcripts (dev mode)
- Browse existing sessions
- Navigate to candidates and mentions

### Candidates (`/candidates/[sessionId]`)
- Review pending topic candidates
- Approve, reject, or merge candidates
- Set up topic relationships (aliases/subtopics)

### Taxonomy (`/taxonomy`)
- View all topics and their relationships
- Search and filter topics
- See aliases and parent/child relationships

### Mentions (`/mentions/[sessionId]`)
- Browse topic mentions within a session
- Filter by topic or search terms
- View mention evidence and context

### Scores (`/scores`)
- View latest topic scores
- Trigger manual scoring runs
- Monitor scoring performance

### Settings (`/settings`)
- Configure merge threshold
- Set scoring parameters
- Manage system configuration

## API Routes

### `/api/ingest`
- **POST**: Create new session and chunks from raw text
- Used for development/testing

### `/api/approvals/commit`
- **POST**: Apply candidate decisions to taxonomy
- Creates topics, aliases, and relationships

### `/api/chunk-tag`
- **POST**: Trigger chunk+tag pipeline
- Creates events for background processing

## Database Schema

The frontend uses a simplified schema focused on:

- **topic_core**: Canonical topic definitions
- **topic_alias**: Alternative names for topics
- **topic_edge**: Parent-child relationships
- **topic_candidates**: New topic proposals
- **mentions**: Topic mentions in chunks
- **scoring_config**: System configuration
- **scoring_runs** & **topic_scores**: Scoring results

## Development Workflow

1. **Ingest**: Upload meeting data via Sessions page
2. **Detect**: Run topic detection (Python pipeline)
3. **Review**: Approve/reject candidates via Candidates page
4. **Tag**: Run chunk+tag to create mentions
5. **Score**: Trigger scoring runs and view results

## Integration with Python Pipeline

The frontend integrates with your existing Python pipeline through:

1. **Event-driven triggers**: API routes create events that your Python workers can poll
2. **Shared database**: Both frontend and Python write to the same Supabase tables
3. **Configuration sync**: Settings page updates config that Python pipeline reads

## Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push

### Other Platforms

The app can be deployed to any platform that supports Next.js:
- Netlify
- Railway
- DigitalOcean App Platform
- AWS Amplify

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Client-side API key | Yes |
| `SUPABASE_SECRET_KEY` | Server-side API key | Yes |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is part of the Signals POC and follows the same license terms.
