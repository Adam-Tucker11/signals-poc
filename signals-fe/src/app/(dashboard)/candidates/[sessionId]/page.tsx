'use client';

import { useEffect, useMemo, useState, use } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  Save, 
  Loader2,
  AlertCircle,
  Keyboard,
  Target,
  Link as LinkIcon,
  FolderOpen,
  Sparkles,
  ChevronRight,
  Eye
} from 'lucide-react';

type Candidate = {
  candidate_id: string;
  topic_id_suggested: string | null;
  label: string;
  evidence: string | null;
  why_new: string | null;
  merged_into_topic: string | null;
  status: 'pending' | 'approved' | 'rejected';
};

export default function CandidatePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const sb = supabaseBrowser();
  const [cands, setCands] = useState<Candidate[]>([]);
  const [cores, setCores] = useState<{id: string, label: string}[]>([]);
  const [mergeThreshold, setMergeThreshold] = useState<number>(0.65);
  const [autoChunkTag, setAutoChunkTag] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, {
    status: 'pending'|'approved'|'rejected',
    action: 'none'|'alias'|'subtopic',
    targetCoreId?: string
  }>>({});

  async function load() {
    try {
      setIsLoading(true);
      const [{ data: cd }, { data: tc }, { data: cfg }] = await Promise.all([
        sb.from('topic_candidates').select('*').eq('session_id', sessionId).order('created_at', { ascending:false }),
        sb.from('topics').select('id,label').order('label'),
        sb.from('scoring_config').select('*').eq('id', 1).maybeSingle()
      ]);
      setCands(cd ?? []);
      setCores(tc ?? []);
      if (cfg?.merge_threshold) setMergeThreshold(Number(cfg.merge_threshold));
      const init: typeof decisions = {};
      (cd ?? []).forEach(x => init[x.candidate_id] = { status: x.status, action: 'none', targetCoreId: x.merged_into_topic ?? undefined });
      setDecisions(init);
    } catch (error) {
      toast.error('Failed to load candidates');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { load(); }, [sessionId]);

  function setDecision(id: string, patch: Partial<typeof decisions[string]>) {
    setDecisions(prev => ({ ...prev, [id]: { ...prev[id], ...patch }}));
  }

  async function save() {
    try {
      setIsSaving(true);
      const payload = Object.entries(decisions).map(([id, v]) => ({ id, ...v, sessionId }));
      const res = await fetch('/api/approvals/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decisions: payload }),
      });
      if (!res.ok) {
        throw new Error('Commit failed');
      }
      toast.success('Decisions saved successfully');
      
      // Auto-run chunk+tag if enabled
      if (autoChunkTag) {
        try {
          await fetch('/api/chunk-tag', { 
            method: 'POST', 
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionId })
          });
          toast.success('Chunk+tag pipeline triggered automatically');
        } catch (error) {
          toast.error('Failed to trigger chunk+tag pipeline');
        }
      }
      
      await load();
    } catch (error) {
      toast.error('Failed to save decisions');
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }

  const pendingCount = useMemo(() => cands.filter(c => decisions[c.candidate_id]?.status === 'pending').length, [cands, decisions]);
  const hasChanges = useMemo(() => {
    return cands.some(c => {
      const d = decisions[c.candidate_id];
      return d && (d.status !== c.status || d.action !== 'none' || d.targetCoreId !== c.merged_into_topic);
    });
  }, [cands, decisions]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      const activeCandidate = cands.find(c => decisions[c.candidate_id]?.status === 'pending');
      if (!activeCandidate) return;
      
      switch (e.key.toLowerCase()) {
        case 'a':
          e.preventDefault();
          setDecision(activeCandidate.candidate_id, { status: 'approved' });
          break;
        case 'r':
          e.preventDefault();
          setDecision(activeCandidate.candidate_id, { status: 'rejected' });
          break;
        case 'm':
          e.preventDefault();
          setDecision(activeCandidate.candidate_id, { action: 'alias' });
          break;
        case ' ':
          e.preventDefault();
          const current = decisions[activeCandidate.candidate_id]?.status;
          setDecision(activeCandidate.candidate_id, { status: current === 'approved' ? 'rejected' : 'approved' });
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cands, decisions]);

  return (
    <div className="min-h-screen">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Topic Candidates</h1>
            <p className="text-gray-500 mt-2">Review and approve new topic suggestions</p>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="px-4 py-2 text-sm font-medium border-blue-200 bg-blue-50/50">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                {pendingCount} Pending
              </div>
            </Badge>
            <Badge variant="outline" className="px-4 py-2 text-sm font-medium border-gray-200">
              Threshold: {mergeThreshold}
            </Badge>
          </div>
        </div>

        {/* Keyboard shortcuts card */}
        <div className="glass-effect rounded-2xl p-4 mb-6 border-gradient animate-in">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-800">Quick Actions</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 text-xs font-semibold bg-white rounded-lg shadow-sm border">A</kbd>
              <span className="text-sm text-gray-600">Approve</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 text-xs font-semibold bg-white rounded-lg shadow-sm border">R</kbd>
              <span className="text-sm text-gray-600">Reject</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 text-xs font-semibold bg-white rounded-lg shadow-sm border">M</kbd>
              <span className="text-sm text-gray-600">Set Alias</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 text-xs font-semibold bg-white rounded-lg shadow-sm border">Space</kbd>
              <span className="text-sm text-gray-600">Toggle</span>
            </div>
          </div>
        </div>
      </div>

      {/* Candidates Cards */}
      <div className="grid gap-6">
        {cands.map((c, index) => {
          const d = decisions[c.candidate_id] ?? { status: c.status, action: 'none' as const };
          
          // Preview what will happen
          let preview = '';
          let previewIcon = null;
          if (d.status === 'approved') {
            if (d.action === 'alias' && d.targetCoreId) {
              const target = cores.find(t => t.id === d.targetCoreId);
              preview = `Add alias → ${target?.label || d.targetCoreId}`;
              previewIcon = '🔗';
            } else if (d.action === 'subtopic' && d.targetCoreId) {
              const parent = cores.find(t => t.id === d.targetCoreId);
              preview = `Add subtopic → ${parent?.label || d.targetCoreId}`;
              previewIcon = '📁';
            } else {
              preview = 'Create new topic';
              previewIcon = '✨';
            }
          } else if (d.status === 'rejected') {
            preview = 'Reject candidate';
            previewIcon = '❌';
          }
          
          const isPending = d.status === 'pending';
          const isApproved = d.status === 'approved';
          const isRejected = d.status === 'rejected';
          
          return (
            <div 
              key={c.candidate_id} 
              className={`glass-effect rounded-2xl p-6 transition-all duration-300 animate-in ${
                isPending ? 'border-2 border-blue-400 shadow-glow' : 
                isApproved ? 'border-2 border-green-400' : 
                isRejected ? 'border-2 border-red-400 opacity-75' : 'border'
              } hover:shadow-2xl hover:scale-[1.01]`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-gray-800">{c.label}</h3>
                    <Badge variant={isPending ? "default" : isApproved ? "outline" : "destructive"} 
                           className={`text-xs ${
                             isPending ? 'bg-blue-500' : 
                             isApproved ? 'bg-green-500 text-white' : 
                             'bg-red-500'
                           }`}>
                      {d.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs font-mono">
                      {c.topic_id_suggested ?? 'no-id'}
                    </Badge>
                  </div>
                  
                  {c.why_new && (
                    <div className="text-sm text-gray-600 mb-2">
                      <span className="font-medium text-gray-700">Reason:</span> {c.why_new}
                    </div>
                  )}
                  
                  {c.evidence && (
                    <blockquote className="pl-4 border-l-4 border-blue-300 text-sm text-gray-500 italic mb-3">
                      "{c.evidence}"
                    </blockquote>
                  )}
                  
                  {preview && (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg text-sm font-medium text-blue-700">
                      <span>{previewIcon}</span>
                      <span>{preview}</span>
                    </div>
                  )}
                </div>
                
                {c.merged_into_topic && (
                  <div className="ml-4">
                    <Badge variant="secondary" className="text-xs">
                      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                      Merge: {c.merged_into_topic}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Card Controls */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-200">
                {/* Status Selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-gray-700">Decision Status</Label>
                  <RadioGroup 
                    className="flex flex-col gap-2" 
                    value={d.status} 
                    onValueChange={(v:any)=>setDecision(c.candidate_id,{status:v})}
                  >
                    <div className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <RadioGroupItem value="pending" id={c.candidate_id+'p'} className="text-blue-500"/>
                      <Label htmlFor={c.candidate_id+'p'} className="cursor-pointer flex-1">⏳ Pending</Label>
                    </div>
                    <div className="flex items-center space-x-3 p-2 rounded-lg hover:bg-green-50 transition-colors">
                      <RadioGroupItem value="approved" id={c.candidate_id+'a'} className="text-green-500"/>
                      <Label htmlFor={c.candidate_id+'a'} className="cursor-pointer flex-1">✅ Approve</Label>
                    </div>
                    <div className="flex items-center space-x-3 p-2 rounded-lg hover:bg-red-50 transition-colors">
                      <RadioGroupItem value="rejected" id={c.candidate_id+'r'} className="text-red-500"/>
                      <Label htmlFor={c.candidate_id+'r'} className="cursor-pointer flex-1">❌ Reject</Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Relationship Selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-gray-700">Relationship Type</Label>
                  <Select value={d.action} onValueChange={(v:any)=>setDecision(c.candidate_id,{action:v})}>
                    <SelectTrigger className="w-full bg-white hover:bg-gray-50 transition-colors">
                      <SelectValue placeholder="Select action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        <div className="flex items-center gap-2">
                          <span>➖</span>
                          <span>No relationship</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="alias">
                        <div className="flex items-center gap-2">
                          <span>🔗</span>
                          <span>Alias (same concept)</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="subtopic">
                        <div className="flex items-center gap-2">
                          <span>📁</span>
                          <span>Subtopic (child)</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Target Topic Selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-gray-700">Target Topic</Label>
                  <Select 
                    value={d.targetCoreId} 
                    onValueChange={(v:any)=>setDecision(c.candidate_id,{targetCoreId:v})}
                    disabled={d.action === 'none'}
                  >
                    <SelectTrigger className="w-full bg-white hover:bg-gray-50 transition-colors disabled:opacity-50">
                      <SelectValue placeholder="Select target" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {cores.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          <div className="flex items-center justify-between w-full">
                            <span className="font-medium">{t.label}</span>
                            <span className="text-xs text-gray-400 ml-2">({t.id})</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions Section */}
      <div className="mt-8 glass-effect rounded-2xl p-6 border-gradient animate-in" style={{ animationDelay: '200ms' }}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Checkbox 
                id="auto-chunk-tag" 
                checked={autoChunkTag} 
                onCheckedChange={(checked) => setAutoChunkTag(checked as boolean)}
                className="data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
              />
              <Label htmlFor="auto-chunk-tag" className="text-sm font-medium cursor-pointer">
                Auto-run chunk+tag pipeline after applying approvals
              </Label>
            </div>
            
            {hasChanges && (
              <Badge variant="outline" className="bg-yellow-50 border-yellow-300 text-yellow-700">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div>
                  Unsaved changes
                </div>
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <Button 
              onClick={save} 
              disabled={!hasChanges || pendingCount > 0 || isSaving}
              className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              size="lg"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Save Decisions
              {autoChunkTag && hasChanges && pendingCount === 0 && " + Run Pipeline"}
            </Button>
            
            {pendingCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-lg">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="font-medium">Resolve {pendingCount} pending item{pendingCount !== 1 ? 's' : ''} first</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
