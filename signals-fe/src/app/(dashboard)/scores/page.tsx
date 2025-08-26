'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { 
  TrendingUp, 
  Play, 
  BarChart3, 
  Calendar,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle
} from 'lucide-react';

type TopicScore = {
  topic_id: string;
  topic_label: string;
  total_score: number;
  direct_score: number;
  rollup_score: number;
  num_mentions: number;
  last_mention_at: string | null;
  breakdown: any;
};

export default function ScoresPage() {
  const sb = supabaseBrowser();
  const [scores, setScores] = useState<TopicScore[]>([]);
  const [latestRunId, setLatestRunId] = useState<string | null>(null);
  const [expandedBreakdown, setExpandedBreakdown] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTriggering, setIsTriggering] = useState(false);

  async function load() {
    try {
      setIsLoading(true);
      // Get the latest scoring run
      const { data: latestRun } = await sb
        .from('scoring_runs')
        .select('run_id')
        .order('run_at', { ascending: false })
        .limit(1)
        .single();

      if (latestRun) {
        setLatestRunId(latestRun.run_id);
        
        // Get scores for the latest run
        const { data: scoresData } = await sb
          .from('topic_scores')
          .select(`
            *,
            topics!inner(label)
          `)
          .eq('run_id', latestRun.run_id)
          .order('total_score', { ascending: false });

        const scoresWithLabels = (scoresData ?? []).map(score => ({
          topic_id: score.topic_id,
          topic_label: score.topics.label,
          total_score: score.total_score,
          direct_score: score.direct_score,
          rollup_score: score.rollup_score,
          num_mentions: score.num_mentions,
          last_mention_at: score.last_mention_at,
          breakdown: score.breakdown
        }));

        setScores(scoresWithLabels);
      }
    } catch (error) {
      console.error('Failed to load scores:', error);
    } finally {
      setIsLoading(false);
    }
  }
  
  useEffect(() => { load(); }, []);

  async function triggerNewRun() {
    try {
      setIsTriggering(true);
      const { data, error } = await sb
        .from('scoring_runs')
        .insert({
          run_type: 'manual',
          notes: 'Triggered from UI'
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('New scoring run triggered');
      await load();
    } catch (error) {
      toast.error('Failed to trigger scoring run');
      console.error(error);
    } finally {
      setIsTriggering(false);
    }
  }

  const toggleBreakdown = (topicId: string) => {
    setExpandedBreakdown(expandedBreakdown === topicId ? null : topicId);
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Topic Scores</h1>
            <p className="text-muted-foreground mt-1">Performance metrics and scoring analysis</p>
          </div>
          <div className="skeleton h-10 w-32"></div>
        </div>
        
        <div className="skeleton h-4 w-64"></div>

        {/* Scores List */}
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card">
              <div className="skeleton h-6 w-48 mb-2"></div>
              <div className="skeleton h-4 w-32 mb-4"></div>
              <div className="skeleton h-8 w-16"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Topic Scores</h1>
          <p className="text-muted-foreground mt-1">Performance metrics and scoring analysis</p>
        </div>
        <Button 
          onClick={triggerNewRun} 
          disabled={isTriggering}
          className="btn btn-primary"
        >
          {isTriggering ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Triggering...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Play className="w-4 h-4" />
              Trigger New Run
            </span>
          )}
        </Button>
      </div>
      
      {latestRunId && (
        <div className="text-sm text-muted-foreground">
          Latest run: <span className="font-mono text-foreground">{latestRunId}</span>
        </div>
      )}

      {/* Scores List */}
      <div className="space-y-4">
        {scores.map(score => (
          <div key={score.topic_id} className="card">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  <h3 className="font-semibold text-foreground">{score.topic_label}</h3>
                </div>
                
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <BarChart3 className="w-3 h-3" />
                    <span>Score: {score.total_score.toFixed(3)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    <span>{score.num_mentions} mentions</span>
                  </div>
                  {score.last_mention_at && (
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>Last: {new Date(score.last_mention_at).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
                
                <div className="text-xs text-muted-foreground mt-2">
                  Direct: {score.direct_score.toFixed(3)} • Rollup: {score.rollup_score.toFixed(3)}
                </div>
              </div>
              
              <div className="text-right ml-4">
                <div className="text-2xl font-bold text-foreground">
                  {Math.round(score.total_score * 100)}
                </div>
                <div className="text-xs text-muted-foreground">points</div>
              </div>
            </div>
            
            {score.breakdown && (
              <div className="mt-4 pt-4 border-t border-border">
                <button
                  onClick={() => toggleBreakdown(score.topic_id)}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
                >
                  {expandedBreakdown === score.topic_id ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  Show breakdown
                </button>
                
                {expandedBreakdown === score.topic_id && (
                  <div className="mt-3 p-3 bg-muted rounded-lg">
                    <pre className="text-xs text-muted-foreground overflow-auto">
                      {JSON.stringify(score.breakdown, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        
        {scores.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <TrendingUp className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No scores found</h3>
            <p className="text-muted-foreground mb-6">
              Trigger a scoring run to see results.
            </p>
            <Button 
              onClick={triggerNewRun} 
              disabled={isTriggering}
              className="btn btn-primary"
            >
              {isTriggering ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Triggering...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Play className="w-4 h-4" />
                  Trigger New Run
                </span>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
