import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { title, raw } = await request.json();
    const sb = supabaseAdmin();

    // Create a new session
    const { data: session, error: sessionError } = await sb
      .from('sessions')
      .insert({
        title,
        started_at: new Date().toISOString(),
        meeting_type: 'dev_ingest'
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    // For now, just create a simple chunk from the raw text
    // In a real implementation, you'd parse the JSON and create proper chunks
    const { error: chunkError } = await sb
      .from('chunks')
      .insert({
        session_id: session.session_id,
        text: raw.substring(0, 1000), // Limit to first 1000 chars for demo
        speaker_name: 'System',
        timestamp: new Date().toISOString()
      });

    if (chunkError) throw chunkError;

    // Log the ingestion event
    await sb.from('events').insert({
      actor: 'ui',
      event_type: 'session_ingested',
      session_id: session.session_id,
      payload_json: { title, raw_length: raw.length }
    });

    return NextResponse.json({ 
      success: true, 
      session_id: session.session_id 
    });
  } catch (error) {
    console.error('Error in ingest:', error);
    return NextResponse.json({ error: 'Failed to ingest session' }, { status: 500 });
  }
}
