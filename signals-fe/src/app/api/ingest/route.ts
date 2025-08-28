import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

// Helper function to parse meeting content
function parseMeetingContent(raw: string): any {
  try {
    const parsed = JSON.parse(raw);
    
    // If it's already a meeting object with transcript, return as-is
    if (parsed.transcript || parsed.meeting_type) {
      return parsed;
    }
    
    // If it's a list of utterances/speakers, wrap in meeting format
    if (Array.isArray(parsed)) {
      return {
        transcript: parsed,
        meeting_type: 'dev_ingest',
        start_time: new Date().toISOString()
      };
    }
    
    // If it's a string, treat as single transcript
    if (typeof parsed === 'string') {
      return {
        transcript: parsed,
        meeting_type: 'dev_ingest',
        start_time: new Date().toISOString()
      };
    }
    
    // Fallback: treat raw as string
    return {
      transcript: raw,
      meeting_type: 'dev_ingest',
      start_time: new Date().toISOString()
    };
  } catch (error) {
    // If JSON parsing fails, treat as plain text
    return {
      transcript: raw,
      meeting_type: 'dev_ingest',
      start_time: new Date().toISOString()
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { title, raw } = await request.json();
    const sb = supabaseAdmin();

    // Parse the meeting content
    const meeting = parseMeetingContent(raw);
    
    // Create a new session
    const { data: session, error: sessionError } = await sb
      .from('sessions')
      .insert({
        title,
        started_at: new Date().toISOString(),
        meeting_type: meeting.meeting_type || 'dev_ingest'
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    // Create temporary files for the Python pipeline
    const tempDir = join(tmpdir(), `signals-ingest-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    
    const meetingPath = join(tempDir, 'meeting.json');
    const taxonomyPath = join(tempDir, 'taxonomy.json');
    const outputDir = join(tempDir, 'output');
    
    // Prepare meeting data with meeting_id
    const meetingWithId = {
      meeting_id: session.session_id,
      meeting_title: title,
      transcript: meeting.transcript,
      started_at: meeting.start_time || new Date().toISOString(),
      meeting_type: meeting.meeting_type || 'dev_ingest'
    };
    
    // Write meeting data
    writeFileSync(meetingPath, JSON.stringify(meetingWithId, null, 2));
    
    // Create a basic taxonomy in the correct format
    const basicTaxonomy = [
      { id: "general", score: 0.0 },
      { id: "product", score: 0.0 },
      { id: "feedback", score: 0.0 }
    ];
    writeFileSync(taxonomyPath, JSON.stringify(basicTaxonomy, null, 2));

    try {
      // Run the Python pipeline for topic detection
      console.log('Running topic detection pipeline...');
      const { stdout: detectStdout, stderr: detectStderr } = await execAsync(
        `cd /Users/adamtucker/code/signals-poc && source venv/bin/activate && OPENAI_API_KEY=${process.env.OPENAI_API_KEY} python run.py detect-new-topics --meeting "${meetingPath}" --taxonomy "${taxonomyPath}" --out "${outputDir}"`,
        { timeout: 30000 } // 30 second timeout
      );
      
      console.log('Topic detection output:', detectStdout);
      if (detectStderr) console.log('Topic detection errors:', detectStderr);

      // Run the Python pipeline for chunking and tagging
      console.log('Running chunk and tag pipeline...');
      const { stdout: chunkStdout, stderr: chunkStderr } = await execAsync(
        `cd /Users/adamtucker/code/signals-poc && source venv/bin/activate && OPENAI_API_KEY=${process.env.OPENAI_API_KEY} python run.py chunk-tag --meeting "${meetingPath}" --taxonomy "${taxonomyPath}" --out "${outputDir}"`,
        { timeout: 30000 } // 30 second timeout
      );
      
      console.log('Chunk and tag output:', chunkStdout);
      if (chunkStderr) console.log('Chunk and tag errors:', chunkStderr);

      // Read the pipeline results
      const fs = require('fs');
      const path = require('path');
      
      let chunksCreated = 0;
      let candidatesCreated = 0;
      let mentionsCreated = 0;

      // Insert chunks if they exist
      const chunksFile = path.join(outputDir, 'chunks.json');
      if (fs.existsSync(chunksFile)) {
        const chunksData = JSON.parse(fs.readFileSync(chunksFile, 'utf8'));
        const chunks = Array.isArray(chunksData) ? chunksData : [];
        
        if (chunks.length > 0) {
          const chunkInserts = chunks.map((chunk: any) => {
            // Convert timestamp to seconds if it's in HH:MM:SS format
            let startSec = 0;
            if (chunk.start_time) {
              const timeMatch = chunk.start_time.match(/^(\d{2}):(\d{2}):(\d{2})$/);
              if (timeMatch) {
                const [, hours, minutes, seconds] = timeMatch;
                startSec = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
              }
            }
            
            return {
              session_id: session.session_id,
              start_sec: startSec,
              end_sec: null,
              // Store speaker info in text if speaker_id column doesn't exist
              // Format: "Speaker: Text" if we have speaker info
              text: chunk.speaker && chunk.speaker !== 'unknown' ? 
                `${chunk.speaker}: ${chunk.text || chunk.content || ''}` : 
                chunk.text || chunk.content || ''
            };
          });

          const { error: chunkError } = await sb
            .from('chunks')
            .insert(chunkInserts);

          if (chunkError) {
            console.error('Error inserting chunks:', chunkError);
          } else {
            chunksCreated = chunks.length;
          }
        }
      }

      // Insert candidates if they exist
      const candidatesFile = path.join(outputDir, 'new_topics.json');
      if (fs.existsSync(candidatesFile)) {
        const candidatesData = JSON.parse(fs.readFileSync(candidatesFile, 'utf8'));
        const candidates = candidatesData.new_topics || [];
        
        if (candidates.length > 0) {
          const candidateInserts = candidates.map((candidate: any) => ({
            session_id: session.session_id,
            topic_id_suggested: candidate.topic_id || null,
            label: candidate.label || 'Unknown Topic',
            evidence: candidate.evidence || '',
            why_new: candidate.why_new || 'Detected by pipeline',
            status: 'pending'
          }));

          const { error: candidateError } = await sb
            .from('topic_candidates')
            .insert(candidateInserts);

          if (candidateError) {
            console.error('Error inserting candidates:', candidateError);
          } else {
            candidatesCreated = candidates.length;
          }
        }
      }

      // Insert mentions if they exist
      const mentionsFile = path.join(outputDir, 'mentions.json');
      if (fs.existsSync(mentionsFile)) {
        const mentionsData = JSON.parse(fs.readFileSync(mentionsFile, 'utf8'));
        const mentions = mentionsData.mentions || [];
        
        if (mentions.length > 0) {
          // Get chunk mapping for mentions
          const { data: chunks } = await sb
            .from('chunks')
            .select('chunk_id, text')
            .eq('session_id', session.session_id);

          const chunkMap = new Map();
          chunks?.forEach((chunk: any) => {
            // Create a simple hash of the text to match mentions
            const textHash = chunk.text.substring(0, 50).toLowerCase().replace(/\s+/g, ' ');
            chunkMap.set(textHash, chunk.chunk_id);
          });

                     const mentionInserts = mentions
             .map((mention: any) => {
               // Try to find matching chunk
               const chunkText = mention.evidence?.substring(0, 50).toLowerCase().replace(/\s+/g, ' ') || '';
               const chunkId = chunkMap.get(chunkText);
               
               if (chunkId) {
                 return {
                   session_id: session.session_id,
                   chunk_id: chunkId,
                   topic_id: mention.topic_id || mention.topic_label,
                   evidence: mention.evidence || '',
                   relevance_r: mention.relevance || 0.5,
                   created_at: new Date().toISOString()
                 };
               }
               return null;
             })
             .filter(Boolean);

           if (mentionInserts.length > 0) {
             const { error: mentionError } = await sb
               .from('mentions')
               .insert(mentionInserts);

            if (mentionError) {
              console.error('Error inserting mentions:', mentionError);
            } else {
              mentionsCreated = mentionInserts.length;
            }
          }
        }
      }

      // Log the ingestion event
      await sb.from('events').insert({
        actor: 'ui',
        event_type: 'session_ingested',
        session_id: session.session_id,
        payload_json: { 
          title, 
          raw_length: raw.length,
          chunks_created: chunksCreated,
          candidates_created: candidatesCreated,
          mentions_created: mentionsCreated,
          pipeline_success: true
        }
      });

      return NextResponse.json({ 
        success: true, 
        session_id: session.session_id,
        chunks_created: chunksCreated,
        candidates_created: candidatesCreated,
        mentions_created: mentionsCreated,
        pipeline_success: true
      });

        } catch (pipelineError) {
      console.error('Pipeline execution failed:', pipelineError);
      
      // Fallback: create multiple chunks from the content
      const sentences = raw.split(/[.!?]+/).filter(s => s.trim().length > 10);
      const chunkSize = 2; // sentences per chunk
      const basicChunks = [];
      
      for (let i = 0; i < sentences.length; i += chunkSize) {
        const chunkText = sentences.slice(i, i + chunkSize).join('. ').trim();
        if (chunkText.length > 20) {
          basicChunks.push({
            session_id: session.session_id,
            text: chunkText,
            start_sec: i * 10, // approximate timing
            end_sec: (i + chunkSize) * 10
          });
        }
      }
      
      // If no chunks created, create one with the full text
      if (basicChunks.length === 0) {
        basicChunks.push({
          session_id: session.session_id,
          text: raw.substring(0, 2000),
          start_sec: 0,
          end_sec: null
        });
      }

      const { error: chunkError } = await sb
        .from('chunks')
        .insert(basicChunks);

      // Create multiple candidates based on content analysis
      const basicCandidates = [];
      
      // Look for common topics in the text
      const text = raw.toLowerCase();
      if (text.includes('product') || text.includes('development') || text.includes('feature')) {
        basicCandidates.push({
          session_id: session.session_id,
          topic_id_suggested: null,
          label: "Product Development",
          evidence: raw.substring(0, 150),
          why_new: "Contains product development discussion",
          status: 'pending'
        });
      }
      
      if (text.includes('user') || text.includes('feedback') || text.includes('customer')) {
        basicCandidates.push({
          session_id: session.session_id,
          topic_id_suggested: null,
          label: "User Feedback",
          evidence: raw.substring(0, 150),
          why_new: "Contains user feedback discussion",
          status: 'pending'
        });
      }
      
      if (text.includes('timeline') || text.includes('priority') || text.includes('plan')) {
        basicCandidates.push({
          session_id: session.session_id,
          topic_id_suggested: null,
          label: "Planning & Timeline",
          evidence: raw.substring(0, 150),
          why_new: "Contains planning and timeline discussion",
          status: 'pending'
        });
      }
      
      // If no specific topics found, create a general one
      if (basicCandidates.length === 0) {
        basicCandidates.push({
          session_id: session.session_id,
          topic_id_suggested: null,
          label: "General Discussion",
          evidence: raw.substring(0, 100),
          why_new: "Basic topic detection (pipeline failed)",
          status: 'pending'
        });
      }

      const { error: candidateError } = await sb
        .from('topic_candidates')
        .insert(basicCandidates);

      // Log the fallback ingestion
      await sb.from('events').insert({
        actor: 'ui',
        event_type: 'session_ingested',
        session_id: session.session_id,
        payload_json: { 
          title, 
          raw_length: raw.length,
          chunks_created: 1,
          candidates_created: 1,
          mentions_created: 0,
          pipeline_success: false,
          pipeline_error: pipelineError instanceof Error ? pipelineError.message : 'Unknown error'
        }
      });

      return NextResponse.json({ 
        success: true, 
        session_id: session.session_id,
        chunks_created: 1,
        candidates_created: 1,
        mentions_created: 0,
        pipeline_success: false,
        warning: 'Pipeline failed, using basic processing'
      });
    }

  } catch (error) {
    console.error('Error in ingest:', error);
    return NextResponse.json({ 
      error: 'Failed to ingest session',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
