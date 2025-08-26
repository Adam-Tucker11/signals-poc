# Quick Setup Guide

## 1. Navigate to Frontend Directory

```bash
cd signals-fe
```

## 2. Install Dependencies

```bash
npm install
```

## 3. Setup Environment

Copy the example environment file:

```bash
cp env.local.example .env.local
```

Edit `.env.local` with your Supabase credentials:

```bash
# Supabase Configuration (required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SECRET_KEY=sb_secret_xxx

# OpenAI Configuration (optional - only if calling Python pipeline from API routes)
# OPENAI_API_KEY=your_openai_api_key_here
# OPENAI_MODEL=gpt-4o-mini
```

**Important Notes:**
- The `NEXT_PUBLIC_` prefix is required for client-side access
- Replace the placeholder values with your actual Supabase project URL and API keys
- The `SUPABASE_SECRET_KEY` is used server-side only (no `NEXT_PUBLIC_` prefix)
- OpenAI keys should be kept server-side only (no `NEXT_PUBLIC_` prefix)

## 4. Setup Database

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run the initial schema: `supabase/migrations/0001_init.sql`
4. Apply improvements: `supabase/migrations/0002_quick_wins_improvements.sql`

## 5. Start Development Server

```bash
npm run dev
```

The app will be available at: http://localhost:3000

## 6. Verify Environment Variables

Visit [http://localhost:3000/api/env](http://localhost:3000/api/env) to verify your environment variables are loaded correctly. You should see:

```json
{
  "url": "https://your-project-ref.supabase.co",
  "anon": true,
  "service": true
}
```

## 7. Test the Workflow

1. **Sessions**: Upload some test text to create a session
2. **Candidates**: Manually insert some test candidates in Supabase
3. **Review**: Use the Candidates page to approve/reject/merge
4. **Taxonomy**: View the updated topics in the Taxonomy page

## Troubleshooting

### "supabaseUrl is required" Error

If you get this error, follow these steps:

1. **Verify file location and content**:
   - File must be at: `signals-fe/.env.local`
   - No quotes, no trailing spaces
   - Variable names must match exactly

2. **Clean and restart**:
   ```bash
   pkill -f "next dev" || true
   rm -rf .next
   npm run dev
   ```

3. **Check the debug route**: Visit `/api/env` to verify variables are loaded

4. **Common issues**:
   - Running `npm run dev` from wrong directory
   - Missing `NEXT_PUBLIC_` prefix
   - Trailing spaces in environment file
   - Root `.env` file overriding values

### Supabase connection errors
- Check your environment variables in `.env.local`
- Verify your Supabase project URL and API keys
- Make sure you've run the database schema

### Missing dependencies
Run `npm install` to install all required packages.

## Environment Variable Summary

| Variable | Purpose | Where Used | Required |
|----------|---------|------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Client-side (browser) | Yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public API key | Client-side (browser) | Yes |
| `SUPABASE_SECRET_KEY` | Private API key | Server-side (API routes) | Yes |
| `OPENAI_API_KEY` | OpenAI API key | Server-side (API routes) | Optional |
| `OPENAI_MODEL` | OpenAI model | Server-side (API routes) | Optional |

## Next Steps

Once the frontend is running, you can:

1. **Integrate with Python pipeline**: Update your Python code to write to the new Supabase tables
2. **Add authentication**: Enable Supabase Auth for user management
3. **Deploy**: Deploy to Vercel or another platform
4. **Customize**: Modify the UI and add new features
