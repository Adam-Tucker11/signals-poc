'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { 
  Target, 
  RotateCcw, 
  Save, 
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';

export default function SettingsPage() {
  const sb = supabaseBrowser();
  const [mergeT, setMergeT] = useState<number>(0.65);
  const [halfLife, setHalfLife] = useState<number>(30);
  const [autoChunkTag, setAutoChunkTag] = useState<boolean>(false);
  const [minRelevance, setMinRelevance] = useState<number>(0.35);
  const [hasChanges, setHasChanges] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  async function load() {
    try {
      setIsLoading(true);
      const { data } = await sb.from('scoring_config').select('*').eq('id',1).single();
      if (data?.merge_threshold != null) setMergeT(Number(data.merge_threshold));
      if (data?.decay_half_life_days != null) setHalfLife(Number(data.decay_half_life_days));
      if (data?.auto_chunk_tag_after_approval != null) setAutoChunkTag(Boolean(data.auto_chunk_tag_after_approval));
      if (data?.min_relevance_for_mention != null) setMinRelevance(Number(data.min_relevance_for_mention));
    } catch (error) {
      toast.error('Failed to load settings');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }

  async function save() {
    try {
      setIsSaving(true);
      await sb.from('scoring_config').upsert({ 
        id: 1, 
        merge_threshold: mergeT, 
        decay_half_life_days: halfLife,
        auto_chunk_tag_after_approval: autoChunkTag,
        min_relevance_for_mention: minRelevance,
        updated_at: new Date().toISOString() 
      });
      toast.success('Settings saved successfully');
      setHasChanges(false);
    } catch (error) {
      toast.error('Failed to save settings');
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }

  useEffect(()=>{ load(); },[]);

  const handleInputChange = (setter: (value: any) => void, value: any) => {
    setter(value);
    setHasChanges(true);
  };

  const handleCheckboxChange = (checked: boolean) => {
    setAutoChunkTag(checked);
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">System Configuration</h1>
          <p className="text-muted-foreground mt-1">Configure scoring algorithms and pipeline behavior</p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="card">
            <div className="skeleton h-6 w-32 mb-2"></div>
            <div className="skeleton h-4 w-48 mb-6"></div>
            <div className="space-y-6">
              <div className="skeleton h-4 w-24"></div>
              <div className="skeleton h-10 w-full"></div>
              <div className="skeleton h-16 w-full"></div>
            </div>
          </div>
          
          <div className="card">
            <div className="skeleton h-6 w-32 mb-2"></div>
            <div className="skeleton h-4 w-48 mb-6"></div>
            <div className="space-y-6">
              <div className="skeleton h-4 w-32"></div>
              <div className="skeleton h-10 w-full"></div>
              <div className="skeleton h-16 w-full"></div>
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
        <h1 className="text-2xl font-semibold text-foreground">System Configuration</h1>
        <p className="text-muted-foreground mt-1">Configure scoring algorithms and pipeline behavior</p>
      </div>

      {/* Settings Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Topic Scoring Settings */}
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
              <Target className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Topic Scoring</h2>
              <p className="text-sm text-muted-foreground">Algorithm parameters for topic detection</p>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="form-group">
              <Label className="form-label">Merge Threshold</Label>
              <Input 
                type="number" 
                step="0.01" 
                min="0" 
                max="1" 
                value={mergeT} 
                onChange={e => handleInputChange(setMergeT, Number(e.target.value))}
                className="input"
                placeholder="0.65"
              />
              <div className="form-help">
                <strong>Current:</strong> {mergeT} • Lower values create more aggressive merge suggestions
              </div>
            </div>
            
            <div className="form-group">
              <Label className="form-label">Min Relevance for Mentions</Label>
              <Input 
                type="number" 
                step="0.05" 
                min="0" 
                max="1" 
                value={minRelevance} 
                onChange={e => handleInputChange(setMinRelevance, Number(e.target.value))}
                className="input"
                placeholder="0.35"
              />
              <div className="form-help">
                <strong>Current:</strong> {minRelevance} • Drop mentions below this relevance threshold
              </div>
            </div>
          </div>
        </div>

        {/* System Behavior Settings */}
        <div className="card">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
              <RotateCcw className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">System Behavior</h2>
              <p className="text-sm text-muted-foreground">Pipeline and automation settings</p>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="form-group">
              <Label className="form-label">Recency Half-Life (Days)</Label>
              <Input 
                type="number" 
                min="1" 
                value={halfLife} 
                onChange={e => handleInputChange(setHalfLife, Number(e.target.value))}
                className="input"
                placeholder="30"
              />
              <div className="form-help">
                <strong>Current:</strong> {halfLife} days • Used by nightly scoring decay algorithm
              </div>
            </div>
            
            <div className="checkbox-wrapper">
              <Checkbox 
                id="auto-chunk-tag" 
                checked={autoChunkTag} 
                onCheckedChange={handleCheckboxChange}
                className="mt-1"
              />
              <div className="flex-1">
                <Label htmlFor="auto-chunk-tag" className="form-label cursor-pointer">
                  Auto-run Chunk+Tag Pipeline
                </Label>
                <p className="form-help mt-1">
                  Automatically trigger the chunk+tag pipeline after applying candidate decisions
                </p>
                <div className="mt-3">
                  <span className={`status-indicator ${autoChunkTag ? 'status-enabled' : 'status-disabled'}`}>
                    {autoChunkTag ? (
                      <>
                        <CheckCircle className="w-3 h-3" />
                        Enabled
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3 h-3" />
                        Disabled
                      </>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-center">
        <div className="card">
          <div className="flex items-center gap-4">
            {hasChanges && (
              <div className="flex items-center gap-2 text-amber-700 bg-amber-50 px-3 py-2 rounded-lg text-sm">
                <AlertCircle className="w-4 h-4" />
                <span className="font-medium">Unsaved changes</span>
              </div>
            )}
            <Button 
              onClick={save}
              disabled={!hasChanges || isSaving}
              className={`btn ${hasChanges ? 'btn-primary' : 'btn-secondary'}`}
            >
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </span>
              ) : hasChanges ? (
                <span className="flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  Save Configuration
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  All Saved
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}