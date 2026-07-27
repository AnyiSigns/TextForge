'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Wand2, BookOpen, Users, FileText, Globe, Palette, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OutlineNodeStatus, OutlineVolume } from '@/lib/storage/backup';
import type { Step } from '@/types';
import { useBriefStore } from '@/features/projects';
import { useCharacterStore } from '@/features/characters';
import { createOutline, updateOutline, listOutlines } from '@/features/projects';
import apiClient from '@/shared/lib/apiClient';
import { toast } from 'sonner';

interface WritePanelProps {
  projectId: string;
  steps: Step[];
  brief: any;
  projectChars: any[];
}

type WriteTarget = 'worldview' | 'tone' | 'forbidden' | 'styleGuide' | 'characterProfile' | 'characterStatus' | 'relations' | 'outline';

const TARGETS: { key: WriteTarget; label: string; icon: typeof Globe }[] = [
  { key: 'worldview', label: '世界观', icon: Globe },
  { key: 'tone', label: '基调', icon: Palette },
  { key: 'forbidden', label: '禁忌', icon: FileText },
  { key: 'styleGuide', label: '风格指南', icon: Wand2 },
  { key: 'characterProfile', label: '角色设定', icon: Users },
  { key: 'characterStatus', label: '角色状态', icon: Users },
  { key: 'relations', label: '角色关系链', icon: Users },
  { key: 'outline', label: '大纲', icon: BookOpen },
];

export function WritePanel({ projectId, steps, brief, projectChars }: WritePanelProps) {
  const [selectedTargets, setSelectedTargets] = useState<WriteTarget[]>(['worldview', 'tone', 'outline']);
  const [drafts, setDrafts] = useState<Record<WriteTarget, string>>({
    worldview: brief?.worldview || '',
    tone: brief?.tone || '',
    forbidden: brief?.forbidden || '',
    styleGuide: brief?.style_guide || '',
    characterProfile: '',
    characterStatus: '',
    relations: '',
    outline: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const allContent = useMemo(() => {
    return steps
      .filter((s) => s.content && s.content.trim())
      .map((s) => `【${s.agentName || s.agent}】\n${s.content}`)
      .join('\n\n---\n\n');
  }, [steps]);

  const toggleTarget = (key: WriteTarget) => {
    setSelectedTargets((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const pid = Number(projectId);
      const currentBrief = brief || useBriefStore.getState().getBrief(projectId);
      const briefUpdates: Record<string, string> = {};
      if (selectedTargets.includes('worldview')) briefUpdates.worldview = drafts.worldview;
      if (selectedTargets.includes('tone')) briefUpdates.tone = drafts.tone;
      if (selectedTargets.includes('forbidden')) briefUpdates.forbidden = drafts.forbidden;
      if (selectedTargets.includes('styleGuide')) briefUpdates.style_guide = drafts.styleGuide;

      if (Object.keys(briefUpdates).length > 0 && currentBrief) {
        const fieldOrigins: Record<string, string> = { ...(currentBrief.fieldOrigins || {}) };
        for (const k of Object.keys(briefUpdates)) {
          if (['worldview', 'tone', 'forbidden', 'style_guide', 'styleGuide'].includes(k)) {
            fieldOrigins[k] = 'user';
          }
        }
        const updatedBrief = { ...currentBrief, ...briefUpdates, fieldOrigins };
        useBriefStore.getState().upsertBrief(updatedBrief, 'user');
      }

      if (selectedTargets.includes('characterProfile') && drafts.characterProfile.trim()) {
        const charNameMatch = drafts.characterProfile.match(/^(?:角色[名称：:]\s*|【角色】\s*|名称[：:]\s*)(.+?)(?:\n|$)/m);
        const name = charNameMatch ? charNameMatch[1].trim() : drafts.characterProfile.slice(0, 20).trim() || '未命名角色';
        const existingChar = projectChars.find((c) => c.name === name);
        if (existingChar) {
          await updateCharacter(existingChar.id, {
            description: drafts.characterProfile,
            current_profile: drafts.characterProfile,
          });
        } else {
          await createCharacter({ name, description: drafts.characterProfile, project_id: pid, image_seed: Date.now() });
        }
      }

      if (selectedTargets.includes('characterStatus') && drafts.characterStatus.trim() && projectChars.length > 0) {
        await updateCharacter(projectChars[0].id, { status: drafts.characterStatus });
      }

      if (selectedTargets.includes('outline') && drafts.outline.trim()) {
        const existing = await listOutlines(pid);
        const outlineData: OutlineVolume[] = [
          {
            id: `vol-${Date.now()}`,
            title: '生成大纲',
            chapters: [
              {
                id: `ch-${Date.now()}`,
                title: '大纲',
                nodes: [
                  {
                    id: `nd-${Date.now()}`,
                    title: '大纲节点',
                    content: drafts.outline,
                    status: 'writing',
                    origin: 'init',
                  },
                ],
              },
            ],
            origin: 'init',
          },
        ];
        if (existing.length > 0) {
          await updateOutline(pid, existing[0].id, outlineData);
        } else {
          await createOutline(pid, outlineData);
        }
      }

      toast.success('写入创作设定成功');
    } catch (e) {
      toast.error('写入失败', { description: e instanceof Error ? e.message : '未知错误' });
    } finally {
      setIsSaving(false);
    }
  };

  const updateCharacter = async (id: string, patch: any) => {
    const { updateCharacter: apiUpdate } = await import('@/features/characters');
    return apiUpdate(id, patch);
  };

  const createCharacter = async (body: any) => {
    const { createCharacter: apiCreate } = await import('@/features/characters');
    return apiCreate(body);
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-primary" />
          写入创作设定
        </CardTitle>
        <CardDescription>
          从工作台生成内容中提取信息，写入下方字段。选择要写入的目标字段，编辑后点击确认。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="source" className="space-y-4">
          <TabsList>
            <TabsTrigger value="source">源内容</TabsTrigger>
            <TabsTrigger value="targets">选择目标字段</TabsTrigger>
            <TabsTrigger value="preview">编辑与确认</TabsTrigger>
          </TabsList>

          <TabsContent value="source" className="space-y-3">
            <div className="space-y-2">
              <Label>工作台全部节点内容（只读）</Label>
              <ScrollArea className="h-[300px] rounded-lg border border-border/40 bg-muted/20">
                <div className="p-3 space-y-3 text-xs leading-relaxed whitespace-pre-wrap">
                  {steps.filter((s) => s.content && s.content.trim()).length === 0 ? (
                    <p className="text-muted-foreground">工作台暂无内容，请先生成。</p>
                  ) : (
                    steps
                      .filter((s) => s.content && s.content.trim())
                      .map((s) => (
                        <div key={s.nodeId} className="rounded-lg border border-border/30 p-2.5">
                          <div className="font-medium text-xs text-primary mb-1">{s.agentName || s.agent}</div>
                          <div className="text-muted-foreground">{s.content}</div>
                        </div>
                      ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="targets" className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TARGETS.map((t) => {
                const Icon = t.icon;
                const checked = selectedTargets.includes(t.key);
                return (
                  <button
                    key={t.key}
                    onClick={() => toggleTarget(t.key)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors',
                      checked ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:bg-accent/40'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              已选择 {selectedTargets.length} 个目标字段。切换到「编辑与确认」填写内容。
            </p>
          </TabsContent>

          <TabsContent value="preview" className="space-y-4">
            {selectedTargets.map((key) => {
              const target = TARGETS.find((t) => t.key === key)!;
              const placeholder = {
                worldview: '世界观设定...',
                tone: '基调/文风...',
                forbidden: '创作禁忌...',
                styleGuide: '风格指南...',
                characterProfile: '角色设定（名称/描述/角色/自定义角色）...',
                characterStatus: '角色状态...',
                relations: '角色关系链（JSON 或文本）...',
                outline: '大纲内容...',
              }[key];
              const description = {
                worldview: '世界观',
                tone: '基调',
                forbidden: '创作禁忌',
                styleGuide: '风格指南',
                characterProfile: '角色信息（第一行当作角色名）',
                characterStatus: '状态（如：存活/死亡/失踪）',
                relations: '角色关系（如：A-朋友-B）',
                outline: '大纲',
              }[key];
              return (
                <div key={key} className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <target.icon className="w-3.5 h-3.5" />
                    {target.label}
                    <span className="text-[10px] text-muted-foreground">({description})</span>
                  </Label>
                  <Textarea
                    value={drafts[key]}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    rows={4}
                    className="text-sm"
                  />
                </div>
              );
            })}
            <Button onClick={handleSave} disabled={isSaving || selectedTargets.length === 0} className="w-full">
              {isSaving ? '写入中...' : '确认写入'}
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
