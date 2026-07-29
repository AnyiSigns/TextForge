'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Checkbox } from '@/shared/ui/checkbox';
import { Label } from '@/shared/ui/label';
import { Spinner } from '@/shared/components';
import { Search, Settings2, BookOpen, Users, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchBookCharacters,
  fetchBookVolumes,
  fetchBookChaptersTree,
  fetchBookOutlineTree,
  fetchBookContextConfig,
  saveBookContextConfig,
  type OutlineNode,
  type VolumeChapterTree,
  type VolumeListItem,
} from '@/features/projects';

interface ProjectContextConfigTabProps {
  projectId: number;
}

export function ProjectContextConfigTab({ projectId }: ProjectContextConfigTabProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [characters, setCharacters] = useState<{ id: number; name: string; description?: string }[]>([]);
  const [volumes, setVolumes] = useState<VolumeListItem[]>([]);
  const [chapterTree, setChapterTree] = useState<VolumeChapterTree[]>([]);
  const [outlineNodes, setOutlineNodes] = useState<OutlineNode[]>([]);

  const [selectedCharIds, setSelectedCharIds] = useState<Set<number>>(new Set());
  const [selectedVolumeIds, setSelectedVolumeIds] = useState<Set<number>>(new Set());
  const [chapterContentIds, setChapterContentIds] = useState<Set<number>>(new Set());
  const [chapterSummaryIds, setChapterSummaryIds] = useState<Set<number>>(new Set());
  const [selectedOutlineNodeIds, setSelectedOutlineNodeIds] = useState<Set<number>>(new Set());

  const [injectContent, setInjectContent] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const [chars, vols, chTree, outline, config] = await Promise.all([
          fetchBookCharacters(projectId),
          fetchBookVolumes(projectId),
          fetchBookChaptersTree(projectId),
          fetchBookOutlineTree(projectId),
          fetchBookContextConfig(projectId).catch(() => ({
            character_ids: [],
            chapter_content_ids: [],
            chapter_summary_ids: [],
            volume_ids: [],
            outline_node_ids: [],
          })),
        ]);

        if (cancelled) return;

        setCharacters(chars || []);
        setVolumes(vols || []);
        setChapterTree(chTree || []);
        setOutlineNodes(outline || []);

        const charSet = new Set<number>((config.character_ids || []).filter(Boolean));
        setSelectedCharIds(charSet);

        const volSet = new Set<number>((config.volume_ids || []).filter(Boolean));
        setSelectedVolumeIds(volSet);

        const ccSet = new Set<number>((config.chapter_content_ids || []).filter(Boolean));
        setChapterContentIds(ccSet);

        const csSet = new Set<number>((config.chapter_summary_ids || []).filter(Boolean));
        setChapterSummaryIds(csSet);

        const outlineSet = new Set<number>((config.outline_node_ids || []).filter(Boolean));
        setSelectedOutlineNodeIds(outlineSet);
      } catch {
        if (!cancelled) toast.error('加载项目上下文配置失败');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [projectId]);

  const filteredCharacters = useMemo(() => {
    if (!searchTerm.trim()) return characters;
    const q = searchTerm.trim().toLowerCase();
    return characters.filter(c => c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));
  }, [characters, searchTerm]);

  const toggleChar = (id: number) => {
    setSelectedCharIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVolume = (id: number) => {
    setSelectedVolumeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleOutlineNode = (id: number) => {
    setSelectedOutlineNodeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        let current = outlineNodes.find(n => n.id === id);
        while (current && current.parent_id) {
          next.add(current.parent_id);
          current = outlineNodes.find(n => n.id === current!.parent_id);
        }
      }
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveBookContextConfig(projectId, {
        character_ids: Array.from(selectedCharIds),
        chapter_content_ids: Array.from(chapterContentIds),
        chapter_summary_ids: Array.from(chapterSummaryIds),
        volume_ids: Array.from(selectedVolumeIds),
        outline_node_ids: Array.from(selectedOutlineNodeIds),
      });
      toast.success('工作流上下文配置已保存');
    } catch (e) {
      toast.error('保存失败', { description: e instanceof Error ? e.message : '未知错误' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <Spinner label="正在加载上下文配置..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Settings2 className="w-5 h-5" />
            工作流上下文配置
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            为当前项目配置工作流节点可注入的具体内容池；只有在此处选中的内容，才会在工作流节点开启对应开关时注入。
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving} size="sm">
          <Save className="w-4 h-4 mr-1.5" />
          {isSaving ? '保存中…' : '保存配置'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4" />
              角色注入池
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="搜索角色..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-8 text-xs"
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
              {filteredCharacters.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">暂无角色</p>
              ) : filteredCharacters.map(c => (
                <label key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/40 cursor-pointer text-xs">
                  <Checkbox
                    checked={selectedCharIds.has(c.id)}
                    onCheckedChange={() => toggleChar(c.id)}
                  />
                  <span className="flex-1 truncate">{c.name}</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">已选 {selectedCharIds.size} 个角色</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              章节注入池
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-3">
              <Label className="text-xs flex items-center gap-1.5 cursor-pointer">
                <Checkbox
                  checked={injectContent}
                  onCheckedChange={(v) => setInjectContent(Boolean(v))}
                />
                注入完整正文
              </Label>
              <span className="text-[10px] text-muted-foreground">（否则仅注入摘要）</span>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
              {chapterTree.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">暂无章节</p>
              ) : chapterTree.map(vol => (
                <div key={vol.id} className="space-y-1">
                  <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/40 cursor-pointer text-xs font-medium">
                    <Checkbox
                      checked={vol.chapters.every(ch => injectContent ? chapterContentIds.has(ch.id) : chapterSummaryIds.has(ch.id))}
                      onCheckedChange={(checked) => {
                        const next = new Set(injectContent ? chapterContentIds : chapterSummaryIds);
                        vol.chapters.forEach(ch => {
                          if (checked) next.add(ch.id);
                          else next.delete(ch.id);
                        });
                        if (injectContent) setChapterContentIds(next);
                        else setChapterSummaryIds(next);
                      }}
                    />
                    <span className="flex-1 truncate">{vol.title}</span>
                  </label>
                  <div className="ml-6 space-y-1">
                    {vol.chapters.map(ch => {
                      const activeId = injectContent ? ch.id : ch.id;
                      const activeSet = injectContent ? chapterContentIds : chapterSummaryIds;
                      return (
                        <label key={ch.id} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-accent/30 cursor-pointer text-[11px]">
                          <Checkbox
                            checked={activeSet.has(activeId)}
                            onCheckedChange={() => {
                              const next = new Set(activeSet);
                              if (next.has(activeId)) next.delete(activeId);
                              else next.add(activeId);
                              if (injectContent) setChapterContentIds(next);
                              else setChapterSummaryIds(next);
                            }}
                          />
                          <span className="flex-1 truncate">{ch.title}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              正文 {chapterContentIds.size} 章 · 摘要 {chapterSummaryIds.size} 章
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              大纲注入池
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-[10px] text-muted-foreground">勾选需要注入的大纲节点；选中节点将保留其父级链路。</p>
            <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
              {outlineNodes.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">暂无大纲</p>
              ) : outlineNodes.map(node => (
                <label key={node.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/40 cursor-pointer text-xs">
                  <Checkbox
                    checked={selectedOutlineNodeIds.has(node.id)}
                    onCheckedChange={() => toggleOutlineNode(node.id)}
                  />
                  <span className="flex-1 truncate">
                    [{node.node_type}] {node.title}
                  </span>
                  {node.target_chapter_id && <span className="text-[10px] text-muted-foreground">章:{node.target_chapter_id}</span>}
                  {node.target_volume_id && <span className="text-[10px] text-muted-foreground">卷:{node.target_volume_id}</span>}
                </label>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">已选 {selectedOutlineNodeIds.size} 个节点</p>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              卷注入池
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
              {volumes.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">暂无卷</p>
              ) : volumes.map(vol => (
                <label key={vol.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/40 cursor-pointer text-xs">
                  <Checkbox
                    checked={selectedVolumeIds.has(vol.id)}
                    onCheckedChange={() => toggleVolume(vol.id)}
                  />
                  <span className="flex-1 truncate">{vol.title}</span>
                  {vol.summary && <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{vol.summary}</span>}
                </label>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">已选 {selectedVolumeIds.size} 卷</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
