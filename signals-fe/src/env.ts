export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnon: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
  supabaseService: process.env.SUPABASE_SECRET_KEY || '',
};

if (!env.supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
if (!env.supabaseAnon) throw new Error('Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
