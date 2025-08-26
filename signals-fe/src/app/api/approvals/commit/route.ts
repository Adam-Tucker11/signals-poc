import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { decisions } = await request.json();
    const sb = supabaseAdmin();

    // Get settings to check if auto-chunk-tag is enabled
    const { data: config } = await sb
      .from('scoring_config')
      .select('auto_chunk_tag_after_approval')
      .eq('id', 1)
      .single();

    const autoChunkTag = config?.auto_chunk_tag_after_approval || false;

    for (const decision of decisions) {
      const { id, status, action, targetCoreId, sessionId } = decision;

      // Update candidate status
      await sb
        .from('topic_candidates')
        .update({ 
          status,
          decided_at: new Date().toISOString(),
          approver_id: 'ui'
        })
        .eq('candidate_id', id);

      if (status === 'approved') {
        // Get the candidate details
        const { data: candidate } = await sb
          .from('topic_candidates')
          .select('label, topic_id_suggested')
          .eq('candidate_id', id)
          .single();

        if (action === 'alias' && targetCoreId) {
          // Add as alias to existing topic
          await sb.from('topic_aliases').upsert({
            topic_id: targetCoreId,
            alias: candidate?.label || 'unknown'
          });
        } else if (action === 'subtopic' && targetCoreId) {
          // Add as subtopic
          await sb.from('topic_relations').upsert({
            parent_id: targetCoreId,
            child_id: candidate?.topic_id_suggested || 'unknown',
            relation_type: 'parent_child',
            rollup_weight: 1.0
          });
        } else {
          // Create new core topic
          await sb.from('topics').upsert({
            id: candidate?.topic_id_suggested || 'unknown',
            label: candidate?.label || 'unknown',
            created_by: 'ui'
          });
        }
      }

      // Log the decision
      await sb.from('events').insert({
        actor: 'ui',
        event_type: 'candidate_status_changed',
        candidate_id: id,
        session_id: sessionId,
        payload_json: { to: status, action, targetCoreId }
      });
    }

    // Log taxonomy application
    if (decisions.length > 0) {
      await sb.from('events').insert({
        actor: 'ui',
        event_type: 'taxonomy_applied',
        session_id: decisions[0].sessionId,
        payload_json: { count: decisions.length }
      });
    }

    // Auto-trigger chunk+tag if enabled
    if (autoChunkTag && decisions.length > 0) {
      const sessionId = decisions[0].sessionId;
      try {
        await sb.from('events').insert({
          actor: 'ui',
          event_type: 'chunk_tag_requested',
          session_id: sessionId,
          payload_json: { auto_triggered: true }
        });
      } catch (error) {
        console.error('Failed to auto-trigger chunk+tag:', error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in approvals commit:', error);
    return NextResponse.json({ error: 'Failed to commit approvals' }, { status: 500 });
  }
}
