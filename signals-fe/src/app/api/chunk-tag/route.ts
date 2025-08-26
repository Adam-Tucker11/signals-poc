import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();
    const sb = supabaseAdmin();

    // Log the chunk+tag request
    await sb.from('events').insert({
      actor: 'ui',
      event_type: 'chunk_tag_requested',
      session_id: sessionId,
      payload_json: { triggered_at: new Date().toISOString() }
    });

    // In a real implementation, this would trigger your Python pipeline
    // For now, just log the event and return success
    console.log(`Chunk+tag requested for session: ${sessionId}`);

    return NextResponse.json({ 
      success: true, 
      message: 'Chunk+tag pipeline triggered (dev mode)' 
    });
  } catch (error) {
    console.error('Error in chunk-tag:', error);
    return NextResponse.json({ error: 'Failed to trigger chunk+tag' }, { status: 500 });
  }
}
