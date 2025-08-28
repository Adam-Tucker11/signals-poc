'use client';

import { useEffect, useState, useRef } from 'react';
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
  AlertCircle,
  Upload,
  Download
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

type BatchResult = {
  title: string;
  success: boolean;
  session_id?: string;
  chunks_created?: number;
  candidates_created?: number;
  error?: string;
  started_at?: string;
  pipeline_success?: boolean;
};

export default function SessionsPage() {
  const sb = supabaseBrowser();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [title, setTitle] = useState('');
  const [raw, setRaw] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    total: number;
    processed: number;
    success: number;
    errors: number;
  } | null>(null);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('Please select a CSV file');
      return;
    }

    setIsUploading(true);
    setUploadProgress({ total: 0, processed: 0, success: 0, errors: 0 });
    setBatchResults([]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/ingest/batch', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      setBatchResults(result.results);
      setUploadProgress({
        total: result.total_processed,
        processed: result.total_processed,
        success: result.success_count,
        errors: result.error_count
      });

      if (result.success_count > 0) {
        toast.success(`Successfully processed ${result.success_count} sessions`);
        await load(); // Refresh the sessions list
      }

      if (result.error_count > 0) {
        toast.error(`${result.error_count} sessions failed to process`);
      }

    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
      console.error(error);
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function downloadSampleCSV() {
    const csvContent = `title,content,date
"Product Review Meeting","This is a sample meeting about product development and user feedback. We discussed several key features that need to be implemented. The team agreed on the priority order and timeline.","2024-01-15T10:30:00Z"
"Customer Feedback Session","This session covers customer feedback and feature requests. Users expressed concerns about the current interface and suggested improvements for better usability.","2024-01-20T14:00:00Z"
"Planning Discussion","Team planning session focused on timeline and resource allocation. We reviewed the current sprint and discussed priorities for the next quarter.","2024-01-25T09:15:00Z"`;
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_sessions.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
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

        {/* Batch Upload Card */}
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center">
              <Upload className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Batch Upload</h2>
              <p className="text-sm text-muted-foreground">Upload multiple sessions via CSV</p>
            </div>
          </div>
          
          <div className="space-y-4">
            {/* Upload Progress */}
            {uploadProgress && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-700">Processing...</span>
                  <span className="text-sm text-blue-600">
                    {uploadProgress.processed}/{uploadProgress.total}
                  </span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(uploadProgress.processed / uploadProgress.total) * 100}%` }}
                  ></div>
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-blue-600">
                  <span>✅ {uploadProgress.success} successful</span>
                  <span>❌ {uploadProgress.errors} failed</span>
                </div>
              </div>
            )}

            {/* File Upload */}
            <div className="form-group">
              <Label className="form-label">CSV File</Label>
              <div 
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  isUploading 
                    ? 'border-gray-300 bg-gray-50' 
                    : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const files = e.dataTransfer.files;
                  if (files.length > 0) {
                    const file = files[0];
                    if (file.name.endsWith('.csv')) {
                      // Create a synthetic event
                      const syntheticEvent = {
                        target: { files: [file] }
                      } as unknown as React.ChangeEvent<HTMLInputElement>;
                      handleFileUpload(syntheticEvent);
                    } else {
                      toast.error('Please drop a CSV file');
                    }
                  }
                }}
              >
                <div className="flex flex-col items-center gap-3">
                  <Upload className={`w-8 h-8 ${isUploading ? 'text-gray-400' : 'text-blue-500'}`} />
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {isUploading ? 'Processing...' : 'Drop CSV file here or click to browse'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Supports drag and drop or click the button below
                    </p>
                  </div>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                    className="input max-w-xs"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <Button
                  onClick={downloadSampleCSV}
                  variant="outline"
                  size="sm"
                  className="btn btn-secondary"
                >
                  <Download className="w-4 h-4" />
                  Download Sample CSV
                </Button>
                <span className="text-xs text-gray-500">
                  CSV must have columns: <code>title,content</code> (optional: <code>date</code>)
                </span>
              </div>
            </div>

            {/* Batch Results */}
            {batchResults.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">Upload Results</Label>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {batchResults.map((result, index) => (
                    <div 
                      key={index}
                      className={`flex items-center justify-between p-2 rounded text-sm ${
                        result.success 
                          ? 'bg-green-50 text-green-700' 
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      <span className="truncate flex-1">{result.title}</span>
                      <div className="flex items-center gap-2 ml-2">
                        {result.success ? (
                          <>
                            <CheckCircle className="w-3 h-3" />
                            <span className="text-xs">
                              {result.chunks_created} chunks, {result.candidates_created} candidates
                              {result.pipeline_success !== undefined && (
                                <span className={`ml-1 ${result.pipeline_success ? 'text-green-600' : 'text-amber-600'}`}>
                                  {result.pipeline_success ? '✓' : '⚠'}
                                </span>
                              )}
                            </span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3" />
                            <span className="text-xs">{result.error}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              <strong>CSV Format:</strong> Each row should have a title and content column. 
              Include a date column for accurate time-based analysis and decay calculations.
              Supported date formats: ISO (2024-01-15T10:30:00Z), date-only (2024-01-15), US (01/15/2024), UK (15/01/2024).
              <br />
              <strong>Processing:</strong> Uses AI pipeline for intelligent chunking and topic detection. 
              Fallback to basic processing if pipeline fails (indicated by ⚠).
            </div>
          </div>
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
  );
}