import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!file.name.endsWith('.csv')) {
      return NextResponse.json({ error: 'File must be a CSV' }, { status: 400 });
    }

    const csvText = await file.text();
    const lines = csvText.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV must have at least a header and one data row' }, { status: 400 });
    }

    // Parse CSV header
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const requiredColumns = ['title', 'content'];
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));
    
    if (missingColumns.length > 0) {
      return NextResponse.json({ 
        error: `Missing required columns: ${missingColumns.join(', ')}. Required: ${requiredColumns.join(', ')}` 
      }, { status: 400 });
    }

    const titleIndex = headers.indexOf('title');
    const contentIndex = headers.indexOf('content');
    const dateIndex = headers.indexOf('date'); // Optional date column
    
    // Parse data rows
    const sessions = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const values = line.split(',').map(v => v.trim());
      
      if (values.length >= Math.max(titleIndex, contentIndex) + 1) {
        const title = values[titleIndex] || `Session ${i}`;
        const content = values[contentIndex] || '';
        
        if (content.trim()) {
          // Parse date if provided, otherwise use current time
          let startedAt = new Date().toISOString();
          if (dateIndex >= 0 && values[dateIndex] && values[dateIndex].length > 0) {
            try {
              const dateValue = values[dateIndex];
              
              // Skip if the date value looks like it might be content (too long or contains HTML)
              if (dateValue.length > 50 || dateValue.includes('<') || dateValue.includes('>')) {
                console.warn(`Skipping date parsing for session "${title}": value looks like content, not a date. Using current time.`);
              } else {
                // Try multiple date formats
                let parsedDate: Date;
                
                // ISO format (2024-01-15T10:30:00Z)
                if (dateValue.includes('T') || dateValue.includes('Z')) {
                  parsedDate = new Date(dateValue);
                }
                // Date only format (2024-01-15)
                else if (dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
                  parsedDate = new Date(dateValue + 'T00:00:00Z');
                }
                // US format (01/15/2024)
                else if (dateValue.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
                  const [month, day, year] = dateValue.split('/');
                  parsedDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
                }
                // UK format (15/01/2024)
                else if (dateValue.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
                  const [day, month, year] = dateValue.split('/');
                  parsedDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
                }
                else {
                  // Try generic date parsing
                  parsedDate = new Date(dateValue);
                }
                
                // Validate the parsed date
                if (!isNaN(parsedDate.getTime())) {
                  startedAt = parsedDate.toISOString();
                } else {
                  console.warn(`Invalid date format for session "${title}": ${dateValue}. Using current time.`);
                }
              }
            } catch (error) {
              console.warn(`Failed to parse date for session "${title}": ${values[dateIndex]}. Using current time.`);
            }
          }
          
          sessions.push({ title, content, startedAt });
        }
      }
    }

    if (sessions.length === 0) {
      return NextResponse.json({ error: 'No valid sessions found in CSV' }, { status: 400 });
    }

    const sb = supabaseAdmin();
    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Process each session
    for (const session of sessions) {
      try {
        // Create session with the parsed date
        const { data: sessionData, error: sessionError } = await sb
          .from('sessions')
          .insert({
            title: session.title,
            started_at: session.startedAt,
            meeting_type: 'csv_import'
          })
          .select()
          .single();

        if (sessionError) {
          results.push({
            title: session.title,
            success: false,
            error: sessionError.message
          });
          errorCount++;
          continue;
        }

        // Try to use the Python pipeline for proper chunking and topic detection
        let chunksCreated = 0;
        let candidatesCreated = 0;
        let pipelineSuccess = false;

        try {
          // Create temporary files for the pipeline
          const tempDir = join(tmpdir(), `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
          mkdirSync(tempDir, { recursive: true });
          
          const meetingPath = join(tempDir, 'meeting.json');
          const taxonomyPath = join(tempDir, 'taxonomy.json');
          const outputDir = join(tempDir, 'output');
          mkdirSync(outputDir, { recursive: true });

          // Prepare meeting data for pipeline - include meeting_id
          const meeting = {
            meeting_id: sessionData.session_id,
            meeting_title: session.title,
            transcript: session.content,
            started_at: session.startedAt,
            meeting_type: 'csv_import'
          };

          // Create a basic taxonomy in the correct format
          const basicTaxonomy = [
            { id: "general", score: 0.0 },
            { id: "product", score: 0.0 },
            { id: "feedback", score: 0.0 }
          ];

          // Write files for pipeline
          writeFileSync(meetingPath, JSON.stringify(meeting, null, 2));
          writeFileSync(taxonomyPath, JSON.stringify(basicTaxonomy, null, 2));

          // Run the Python pipeline for topic detection
          console.log(`Running topic detection pipeline for session: ${session.title}`);
          console.log(`Meeting file: ${meetingPath}`);
          console.log(`Taxonomy file: ${taxonomyPath}`);
          console.log(`Output dir: ${outputDir}`);
          console.log(`OPENAI_API_KEY available: ${!!process.env.OPENAI_API_KEY}`);
          
          const { stdout: detectStdout, stderr: detectStderr } = await execAsync(
            `cd /Users/adamtucker/code/signals-poc && source venv/bin/activate && OPENAI_API_KEY=${process.env.OPENAI_API_KEY} python run.py detect-new-topics --meeting "${meetingPath}" --taxonomy "${taxonomyPath}" --out "${outputDir}"`,
            { timeout: 30000 } // 30 second timeout
          );
          
          console.log('Topic detection output:', detectStdout);
          if (detectStderr) console.log('Topic detection errors:', detectStderr);

          // Run the Python pipeline for chunking and tagging
          console.log(`Running chunk and tag pipeline for session: ${session.title}`);
          const { stdout: chunkStdout, stderr: chunkStderr } = await execAsync(
            `cd /Users/adamtucker/code/signals-poc && source venv/bin/activate && OPENAI_API_KEY=${process.env.OPENAI_API_KEY} python run.py chunk-tag --meeting "${meetingPath}" --taxonomy "${taxonomyPath}" --out "${outputDir}"`,
            { timeout: 30000 } // 30 second timeout
          );
          
          console.log('Chunk and tag output:', chunkStdout);
          if (chunkStderr) console.log('Chunk and tag errors:', chunkStderr);

          // Read the pipeline results
          const fs = require('fs');
          const path = require('path');

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
                  session_id: sessionData.session_id,
                  start_sec: startSec,
                  end_sec: null,
                  // Store speaker info in text if speaker_id column doesn't exist
                  // Format: "Speaker: Text" if we have speaker info
                  text: chunk.speaker && chunk.speaker !== 'unknown' ? 
                    `${chunk.speaker}: ${chunk.text || chunk.content || ''}` : 
                    chunk.text || chunk.content || ''
                };
              });

              console.log(`Inserting ${chunkInserts.length} chunks for session "${session.title}":`, chunkInserts.map(c => ({ text: c.text.substring(0, 50) + '...', start_sec: c.start_sec })));
              
              const { error: chunkError } = await sb
                .from('chunks')
                .insert(chunkInserts);

              if (chunkError) {
                console.error('Error inserting chunks:', chunkError);
              } else {
                chunksCreated = chunks.length;
                pipelineSuccess = true;
                console.log(`Successfully inserted ${chunks.length} chunks for session "${session.title}"`);
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
                session_id: sessionData.session_id,
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

        } catch (pipelineError) {
          console.error(`Pipeline failed for session "${session.title}":`, pipelineError);
          console.error('Pipeline error details:', {
            message: pipelineError instanceof Error ? pipelineError.message : 'Unknown error',
            stack: pipelineError instanceof Error ? pipelineError.stack : undefined,
            sessionTitle: session.title,
            contentLength: session.content.length
          });
          console.warn(`Using fallback logic for session "${session.title}"`);
          
          // Fallback to simple chunking if pipeline fails
          const chunkSentences = session.content.split(/[.!?]+/).filter(s => s.trim().length > 10);
          const chunkSize = 2;
          const chunks = [];
          
          for (let i = 0; i < chunkSentences.length; i += chunkSize) {
            const chunkText = chunkSentences.slice(i, i + chunkSize).join('. ').trim();
            if (chunkText.length > 20) {
              chunks.push({
                session_id: sessionData.session_id,
                text: chunkText,
                start_sec: i * 10,
                end_sec: (i + chunkSize) * 10
              });
            }
          }
          
          if (chunks.length === 0) {
            chunks.push({
              session_id: sessionData.session_id,
              text: session.content.substring(0, 2000),
              start_sec: 0,
              end_sec: null
            });
          }

          // Insert fallback chunks
          const { error: chunkError } = await sb.from('chunks').insert(chunks);
          if (!chunkError) {
            chunksCreated = chunks.length;
          }
          
          // Create fallback candidates based on actual content analysis
          const text = session.content.toLowerCase();
          const candidates = [];
          
          // Extract meaningful phrases from the content
          const sentences = session.content.split(/[.!?]+/).filter(s => s.trim().length > 20);
          const meaningfulSentences = sentences.slice(0, 3); // Take first 3 meaningful sentences
          
          // Look for specific topics in the content
          const topics = [];
          
          if (text.includes('product') || text.includes('development') || text.includes('feature') || text.includes('roadmap')) {
            topics.push({
              label: "Product Development",
              evidence: meaningfulSentences.find(s => s.toLowerCase().includes('product') || s.toLowerCase().includes('development') || s.toLowerCase().includes('feature')) || meaningfulSentences[0],
              why_new: "Contains product development discussion"
            });
          }
          
          if (text.includes('user') || text.includes('feedback') || text.includes('customer') || text.includes('training')) {
            topics.push({
              label: "User Experience",
              evidence: meaningfulSentences.find(s => s.toLowerCase().includes('user') || s.toLowerCase().includes('feedback') || s.toLowerCase().includes('customer') || s.toLowerCase().includes('training')) || meaningfulSentences[0],
              why_new: "Contains user experience discussion"
            });
          }
          
          if (text.includes('timeline') || text.includes('priority') || text.includes('plan') || text.includes('schedule')) {
            topics.push({
              label: "Planning & Timeline",
              evidence: meaningfulSentences.find(s => s.toLowerCase().includes('timeline') || s.toLowerCase().includes('priority') || s.toLowerCase().includes('plan') || s.toLowerCase().includes('schedule')) || meaningfulSentences[0],
              why_new: "Contains planning and timeline discussion"
            });
          }
          
          if (text.includes('data') || text.includes('migration') || text.includes('import') || text.includes('csv')) {
            topics.push({
              label: "Data Management",
              evidence: meaningfulSentences.find(s => s.toLowerCase().includes('data') || s.toLowerCase().includes('migration') || s.toLowerCase().includes('import') || s.toLowerCase().includes('csv')) || meaningfulSentences[0],
              why_new: "Contains data management discussion"
            });
          }
          
          if (text.includes('team') || text.includes('collaboration') || text.includes('meeting') || text.includes('standup')) {
            topics.push({
              label: "Team Collaboration",
              evidence: meaningfulSentences.find(s => s.toLowerCase().includes('team') || s.toLowerCase().includes('collaboration') || s.toLowerCase().includes('meeting') || s.toLowerCase().includes('standup')) || meaningfulSentences[0],
              why_new: "Contains team collaboration discussion"
            });
          }
          
          // Create candidates from detected topics
          topics.forEach(topic => {
            candidates.push({
              session_id: sessionData.session_id,
              topic_id_suggested: null,
              label: topic.label,
              evidence: topic.evidence,
              why_new: topic.why_new,
              status: 'pending'
            });
          });
          
          // If no specific topics found, create a general candidate based on actual content
          if (candidates.length === 0) {
            const firstSentence = meaningfulSentences[0] || session.content.substring(0, 200);
            const words = firstSentence.toLowerCase().split(/\s+/).filter(word => word.length > 3);
            const commonWords = words.filter(word => 
              !['this', 'that', 'with', 'from', 'they', 'have', 'been', 'will', 'were', 'said', 'time', 'like', 'just', 'know', 'take', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us'].includes(word)
            );
            
            const topicLabel = commonWords.length > 0 ? 
              commonWords[0].charAt(0).toUpperCase() + commonWords[0].slice(1) + ' Discussion' : 
              'General Discussion';
            
            candidates.push({
              session_id: sessionData.session_id,
              topic_id_suggested: null,
              label: topicLabel,
              evidence: firstSentence,
              why_new: `Based on content analysis of "${session.title}"`,
              status: 'pending'
            });
          }

          // Insert fallback candidates
          const { error: candidateError } = await sb.from('topic_candidates').insert(candidates);
          if (!candidateError) {
            candidatesCreated = candidates.length;
          }
        }

        // Log the import event
        await sb.from('events').insert({
          actor: 'ui',
          event_type: 'session_imported_csv',
          session_id: sessionData.session_id,
          payload_json: { 
            title: session.title,
            content_length: session.content.length,
            chunks_created: chunksCreated,
            candidates_created: candidatesCreated,
            import_method: 'csv',
            original_date: session.startedAt,
            pipeline_success: pipelineSuccess
          }
        });

        results.push({
          title: session.title,
          success: true,
          session_id: sessionData.session_id,
          chunks_created: chunksCreated,
          candidates_created: candidatesCreated,
          started_at: session.startedAt,
          pipeline_success: pipelineSuccess
        });
        successCount++;

      } catch (error) {
        results.push({
          title: session.title,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        errorCount++;
      }
    }

    return NextResponse.json({
      success: true,
      total_processed: sessions.length,
      success_count: successCount,
      error_count: errorCount,
      results,
      date_column_used: dateIndex >= 0
    });

  } catch (error) {
    console.error('Error in batch ingest:', error);
    return NextResponse.json({ 
      error: 'Failed to process CSV file',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
