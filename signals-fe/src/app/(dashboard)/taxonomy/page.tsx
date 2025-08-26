'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Input } from '@/components/ui/input';
import { Search, GitBranch, Tag, ArrowUpRight, Loader2 } from 'lucide-react';

type Topic = {
  id: string;
  label: string;
  description: string | null;
  aliases: string[];
  children: string[];
  parents: string[];
};

export default function TaxonomyPage() {
  const sb = supabaseBrowser();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    try {
      setIsLoading(true);
      // Get all topics
      const { data: topicsData } = await sb.from('topics').select('*').order('label');
      
      // Get aliases for each topic
      const { data: aliasesData } = await sb.from('topic_aliases').select('*');
      
      // Get relations for each topic
      const { data: relationsData } = await sb.from('topic_relations').select('*');
      
      // Build the topic graph
      const topicsWithRelations = (topicsData ?? []).map(topic => {
        const aliases = (aliasesData ?? [])
          .filter(a => a.topic_id === topic.id)
          .map(a => a.alias);
        
        const children = (relationsData ?? [])
          .filter(r => r.parent_id === topic.id)
          .map(r => r.child_id);
        
        const parents = (relationsData ?? [])
          .filter(r => r.child_id === topic.id)
          .map(r => r.parent_id);
        
        return {
          ...topic,
          aliases,
          children,
          parents
        };
      });
      
      setTopics(topicsWithRelations);
    } catch (error) {
      console.error('Failed to load topics:', error);
    } finally {
      setIsLoading(false);
    }
  }
  
  useEffect(() => { load(); }, []);

  const filteredTopics = topics.filter(t => 
    t.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.aliases.some(alias => alias.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (isLoading) {
    return (
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Topic Taxonomy</h1>
          <p className="text-muted-foreground mt-1">Topic hierarchy and relations</p>
        </div>

        {/* Search */}
        <div className="skeleton h-10 w-80"></div>

        {/* Topics List */}
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card">
              <div className="skeleton h-6 w-48 mb-2"></div>
              <div className="skeleton h-4 w-32 mb-4"></div>
              <div className="space-y-3">
                <div className="skeleton h-4 w-24"></div>
                <div className="skeleton h-6 w-full"></div>
                <div className="skeleton h-4 w-32"></div>
                <div className="skeleton h-6 w-full"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Topic Taxonomy</h1>
        <p className="text-muted-foreground mt-1">Topic hierarchy and relations</p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          placeholder="Search topics..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)}
          className="input pl-10"
        />
      </div>

      {/* Topics List */}
      <div className="space-y-4">
        {filteredTopics.map(topic => (
          <div key={topic.id} className="card">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <GitBranch className="w-4 h-4 text-blue-600" />
                  <h3 className="font-semibold text-foreground">{topic.label}</h3>
                </div>
                
                <div className="text-xs text-muted-foreground mb-2">ID: {topic.id}</div>
                
                {topic.description && (
                  <div className="text-sm text-muted-foreground mb-4">{topic.description}</div>
                )}
                
                <div className="space-y-3">
                  {topic.aliases.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        Aliases
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {topic.aliases.map(alias => (
                          <span key={alias} className="badge badge-gray">
                            {alias}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {topic.children.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-2">Subtopic of:</h4>
                      <div className="flex flex-wrap gap-1">
                        {topic.children.map(childId => {
                          const child = topics.find(t => t.id === childId);
                          return (
                            <span key={childId} className="badge badge-blue">
                              {child?.label || childId}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  {topic.parents.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-foreground mb-2">Parent topics:</h4>
                      <div className="flex flex-wrap gap-1">
                        {topic.parents.map(parentId => {
                          const parent = topics.find(t => t.id === parentId);
                          return (
                            <span key={parentId} className="badge badge-green">
                              {parent?.label || parentId}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="text-xs text-muted-foreground ml-4 flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" />
                {topic.status}
              </div>
            </div>
          </div>
        ))}
        
        {filteredTopics.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <GitBranch className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {searchTerm ? 'No topics found' : 'No topics available'}
            </h3>
            <p className="text-muted-foreground">
              {searchTerm ? 'Try adjusting your search terms' : 'Create your first topic to get started'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
