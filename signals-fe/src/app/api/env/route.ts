export function GET() {
  return Response.json({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    anon: !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    service: !!process.env.SUPABASE_SECRET_KEY,
  });
}
