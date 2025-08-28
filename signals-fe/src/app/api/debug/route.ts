import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const sb = supabaseAdmin();
    
    // Get sessions
    const { data: sessions } = await sb.from('sessions').select('*').order('started_at', { ascending: false });
    
    // Get chunks
    const { data: chunks } = await sb.from('chunks').select('*').order('created_at', { ascending: false });
    
    // Get candidates
    const { data: candidates } = await sb.from('topic_candidates').select('*').order('created_at', { ascending: false });
    
    // Get mentions
    const { data: mentions } = await sb.from('mentions').select('*').order('created_at', { ascending: false });
    
    return NextResponse.json({
      sessions: sessions || [],
      chunks: chunks || [],
      candidates: candidates || [],
      mentions: mentions || [],
      counts: {
        sessions: sessions?.length || 0,
        chunks: chunks?.length || 0,
        candidates: candidates?.length || 0,
        mentions: mentions?.length || 0
      }
    });
  } catch (error) {
    console.error('Error in debug:', error);
    return NextResponse.json({ error: 'Failed to get debug info' }, { status: 500 });
  }
}
