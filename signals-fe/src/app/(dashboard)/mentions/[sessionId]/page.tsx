'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

type Mention = {
  mention_id: string;
  topic_id: string;
  topic_label: string;
  evidence: string;
  surface_term: string;
  relevance: number;
  relevance_r: number;
  chunk_id: string;
  chunk_text?: string;
  speaker_name?: string;
  timestamp?: string;
};

export default function MentionsPage({ params }: { params: { sessionId: string } }) {
  const sb = supabaseBrowser();
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [topics, setTopics] = useState<{id: string, label: string}[]>([]);
  const [selectedMention, setSelectedMention] = useState<Mention | null>(null);

  async function load() {
    const [{ data: m }, { data: t }] = await Promise.all([
      sb.from('mentions').select(`
        *,
        topics!inner(label)
      `).eq('session_id', params.sessionId).order('relevance', { ascending: false }),
      sb.from('topics').select('id,label').order('label')
    ]);
    
    // Get chunk context for each mention
    const mentionsWithContext = await Promise.all(
      (m ?? []).map(async (mention) => {
        const { data: chunk } = await sb
          .from('chunks')
          .select('text, speaker_name, timestamp')
          .eq('chunk_id', mention.chunk_id)
          .single();
        
        // Use relevance column if available, otherwise fall back to relevance_r
        const relevance = mention.relevance ?? mention.relevance_r ?? 0;
        
        return {
          ...mention,
          topic_label: mention.topics.label,
          relevance,
          chunk_text: chunk?.text,
          speaker_name: chunk?.speaker_name,
          timestamp: chunk?.timestamp,
        };
      })
    );
    
    setMentions(mentionsWithContext);
    setTopics(t ?? []);
  }
  
  useEffect(() => { load(); }, []);

  const filteredMentions = mentions.filter(m => {
    const matchesSearch = !searchTerm || 
      m.topic_label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.evidence.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.surface_term.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTopic = !selectedTopic || m.topic_id === selectedTopic;
    return matchesSearch && matchesTopic;
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Topic Mentions</h1>
      
      <div className="flex gap-4">
        <Input 
          placeholder="Search mentions..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
        <select 
          value={selectedTopic} 
          onChange={e => setSelectedTopic(e.target.value)}
          className="px-3 py-2 border rounded-md"
        >
          <option value="">All topics</option>
          {topics.map(t => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {filteredMentions.map(m => (
          <div key={m.mention_id} className="rounded border bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium">{m.topic_label}</span>
                  <Badge variant="outline" className="text-xs">
                    {Math.round(m.relevance * 100)}% relevant
                  </Badge>
                  <span className="text-sm text-gray-500">"{m.surface_term}"</span>
                </div>
                <div className="text-sm text-gray-600 mb-2">"{m.evidence}"</div>
                {m.speaker_name && (
                  <div className="text-xs text-gray-500">
                    — {m.speaker_name}
                    {m.timestamp && ` at ${new Date(m.timestamp).toLocaleTimeString()}`}
                  </div>
                )}
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedMention(m)}
                  >
                    View Context
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Context for "{m.surface_term}"</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">Topic</h4>
                      <p className="text-sm bg-gray-50 p-2 rounded">{m.topic_label}</p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Evidence</h4>
                      <p className="text-sm bg-blue-50 p-2 rounded border-l-4 border-blue-200">
                        "{m.evidence}"
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Full Context</h4>
                      <p className="text-sm bg-gray-50 p-2 rounded whitespace-pre-wrap">
                        {m.chunk_text || 'Context not available'}
                      </p>
                    </div>
                    <div className="text-xs text-gray-500">
                      Speaker: {m.speaker_name || 'Unknown'} • 
                      Relevance: {Math.round(m.relevance * 100)}% • 
                      {m.timestamp && ` Time: ${new Date(m.timestamp).toLocaleString()}`}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        ))}
        {filteredMentions.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            No mentions found
          </div>
        )}
      </div>
    </div>
  );
}
