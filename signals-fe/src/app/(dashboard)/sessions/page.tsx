'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import Link from 'next/link';
import { 
  BarChart3, 
  Plus, 
  Clock, 
  CheckCircle, 
  XCircle,
  FileText,
  Activity,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { Label } from '@/components/ui/label';

type Session = {
  session_id: string;
  title: string;
  started_at: string;
  candidate_stats?: {
    pending: number;
    approved: number;
    rejected: number;
  };
};

export default function SessionsPage() {
  const sb = supabaseBrowser();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [title, setTitle] = useState('');
  const [raw, setRaw] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    try {
      setIsLoading(true);
      const { data: sessionsData } = await sb.from('sessions').select('*').order('started_at', { ascending: false });
      
      // Get candidate stats for each session
      const sessionsWithStats = await Promise.all(
        (sessionsData ?? []).map(async (session) => {
          const { data: candidates } = await sb
            .from('topic_candidates')
            .select('status')
            .eq('session_id', session.session_id);
          
          const stats = {
            pending: candidates?.filter(c => c.status === 'pending').length || 0,
            approved: candidates?.filter(c => c.status === 'approved').length || 0,
            rejected: candidates?.filter(c => c.status === 'rejected').length || 0,
          };
          
          return { ...session, candidate_stats: stats };
        })
      );
      
      setSessions(sessionsWithStats);
    } catch (error) {
      toast.error('Failed to load sessions');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }
  
  useEffect(() => { load(); }, []);

  async function createFromRaw() {
    if (!title.trim() || !raw.trim()) {
      toast.error('Please fill in both title and content');
      return;
    }

    setIsCreating(true);
    try {
      // For dev: send raw transcript JSON to API -> split into chunks + insert rows
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), raw: raw.trim() }),
      });
      
      if (!res.ok) {
        throw new Error('Ingest failed');
      }
      
      toast.success('Session ingested successfully');
      await load();
      setTitle('');
      setRaw('');
    } catch (error) {
      toast.error('Failed to ingest session');
      console.error(error);
    } finally {
      setIsCreating(false);
    }
  }

  const totalSessions = sessions.length;
  const totalTopics = sessions.reduce((acc, s) => acc + (s.candidate_stats?.approved || 0), 0);
  const pendingReview = sessions.reduce((acc, s) => acc + (s.candidate_stats?.pending || 0), 0);

  if (isLoading) {
    return (
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Sessions Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage and analyze your intelligence sessions</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card">
              <div className="skeleton h-4 w-24 mb-2"></div>
              <div className="skeleton h-8 w-16 mb-4"></div>
              <div className="skeleton h-10 w-10 rounded-lg"></div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="card">
            <div className="skeleton h-6 w-32 mb-2"></div>
            <div className="skeleton h-4 w-48 mb-6"></div>
            <div className="space-y-4">
              <div className="skeleton h-4 w-24"></div>
              <div className="skeleton h-10 w-full"></div>
              <div className="skeleton h-4 w-32"></div>
              <div className="skeleton h-32 w-full"></div>
              <div className="skeleton h-10 w-full"></div>
            </div>
          </div>
          
          <div className="card">
            <div className="skeleton h-6 w-32 mb-2"></div>
            <div className="skeleton h-4 w-48 mb-6"></div>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-20 w-full"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Sessions Dashboard</h1>
        <p className="text-muted-foreground mt-1">Manage and analyze your intelligence sessions</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Sessions</p>
              <p className="text-2xl font-semibold text-foreground">{totalSessions}</p>
            </div>
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>
        
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Topics Identified</p>
              <p className="text-2xl font-semibold text-foreground">{totalTopics}</p>
            </div>
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>
        
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Pending Review</p>
              <p className="text-2xl font-semibold text-foreground">{pendingReview}</p>
            </div>
            <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Create Session Card */}
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
              <Plus className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Create New Session</h2>
              <p className="text-sm text-muted-foreground">Ingest and analyze new content</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="form-group">
              <Label className="form-label">Session Title</Label>
              <Input 
                placeholder="Enter session title..." 
                value={title} 
                onChange={e => setTitle(e.target.value)}
                className="input"
                disabled={isCreating}
              />
            </div>
            
            <div className="form-group">
              <Label className="form-label">Content</Label>
              <Textarea 
                rows={8} 
                placeholder='Paste transcript or JSON content...' 
                value={raw} 
                onChange={e => setRaw(e.target.value)}
                className="input resize-none"
                disabled={isCreating}
              />
            </div>
            
            <Button 
              onClick={createFromRaw} 
              disabled={!title.trim() || !raw.trim() || isCreating}
              className="btn btn-primary w-full"
            >
              {isCreating ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Ingesting...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Ingest Session
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* Recent Sessions */}
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-gray-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Recent Sessions</h2>
              <p className="text-sm text-muted-foreground">View and manage your sessions</p>
            </div>
          </div>
          
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {sessions.map(s => {
              const hasPending = s.candidate_stats?.pending && s.candidate_stats.pending > 0;
              const hasApproved = s.candidate_stats?.approved && s.candidate_stats.approved > 0;
              
              return (
                <div 
                  key={s.session_id} 
                  className="p-4 border border-border rounded-lg hover:border-border/60 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-foreground">
                        {s.title || s.session_id}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(s.started_at).toLocaleString()}
                      </p>
                      
                      {s.candidate_stats && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {s.candidate_stats.pending > 0 && (
                            <Badge className="badge badge-amber">
                              <Clock className="w-3 h-3" />
                              {s.candidate_stats.pending} pending
                            </Badge>
                          )}
                          {s.candidate_stats.approved > 0 && (
                            <Badge className="badge badge-green">
                              <CheckCircle className="w-3 h-3" />
                              {s.candidate_stats.approved} approved
                            </Badge>
                          )}
                          {s.candidate_stats.rejected > 0 && (
                            <Badge className="badge badge-gray">
                              <XCircle className="w-3 h-3" />
                              {s.candidate_stats.rejected} rejected
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex flex-col gap-2 ml-4">
                      <Link 
                        href={`/candidates/${s.session_id}`}
                        className={`btn btn-sm text-center
                          ${hasPending 
                            ? 'btn-primary' 
                            : 'btn-secondary'}`}
                      >
                        Candidates
                        {hasPending && ` (${s.candidate_stats?.pending})`}
                      </Link>
                      
                      <Link 
                        href={`/mentions/${s.session_id}`}
                        className={`btn btn-sm text-center
                          ${!hasApproved 
                            ? 'btn-ghost opacity-50 cursor-not-allowed' 
                            : 'btn-secondary'}`}
                        title={!hasApproved ? 'Approve candidates first' : ''}
                      >
                        Mentions
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
            
            {sessions.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <Activity className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Ready to get started?</h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  Create your first intelligence session to begin analyzing topics and extracting insights from your data.
                </p>
                <Button className="btn btn-primary">
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Session
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}