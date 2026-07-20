// src/components/projects/BriefPanel.tsx
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Save, Sparkles, ChevronDown, Target, Plus, Trash2, Pin, PinOff } from 'lucide-react';
import { toast } from 'sonner';
import { useBriefStore, briefToContextLine } from '@/features/projects';
import type { ProjectBrief, BriefSection } from '@/types';
import { cn } from '@/lib/utils';
import { uid } from '@/lib/utils/id';

export function BriefPanel({ projectId, projectTitle }: { projectId: string; projectTitle?: string }) {
  const brief = useBriefStore((s) => s.briefs[projectId]);
  const upsertBrief = useBriefStore((s) => s.upsertBrief);

  const [isExpanded, setIsExpanded] = useState(true);
  const [form, setForm] = useState<ProjectBrief>({
    projectId,
    genre: '',
    worldview: '',
    tone: '',
    forbidden: '',
    styleGuide: '',
    defaultStyle: '',
    wordCountGoal: undefined,
    dailyWordCountGoal: undefined,
    sections: [],
  });
  const [isSaving, setIsSaving] = useState(false);

  const setNumber = (key: 'wordCountGoal' | 'dailyWordCountGoal', value: number | undefined) =>
    setForm((p) => ({ ...p, [key]: value }));

  useEffect(() => {
    if (!brief) return;
    const t = setTimeout(() => setForm((prev) => ({ ...prev, ...brief })), 0);
    return () => clearTimeout(t);
  }, [brief]);

  const set = (key: keyof ProjectBrief, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const addSection = () => {
    const section: BriefSection = {
      id: uid('sec'),
      title: '',
      content: '',
      pinned: false,
      updatedAt: new Date().toISOString(),
    };
    setForm((p) => ({ ...p, sections: [...(p.sections ?? []), section] }));
  };

  const updateSection = (id: string, patch: Partial<BriefSection>) => {
    setForm((p) => ({
      ...p,
      sections: (p.sections ?? []).map((s) => (s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s)),
    }));
  };

  const removeSection = (id: string) => {
    if (!confirm('删除该设定维度？相关生成上下文将不再包含它。')) return;
    setForm((p) => ({ ...p, sections: (p.sections ?? []).filter((s) => s.id !== id) }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const cleaned: ProjectBrief = {
        ...form,
        projectId,
        // 过滤掉标题为空的无效维度
        sections: (form.sections ?? []).filter((s) => s.title.trim()),
        updatedAt: new Date().toISOString(),
      };
      upsertBrief(cleaned);
      toast.success('创作设定已保存');
    } finally {
      setIsSaving(false);
    }
  };

  const preview = briefToContextLine(form);

  return (
    <Card className="glass-card">
      <CardHeader className="cursor-pointer select-none" onClick={() => setIsExpanded((v) => !v)}>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            创作设定
          </span>
          <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
        </CardTitle>
        <CardDescription>
          统一注入到「{projectTitle || '本项目'}」的角色对话与图文/视频生成，控制与小说内容相关的程度
        </CardDescription>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>类型</Label>
              <Input value={form.genre ?? ''} onChange={(e) => set('genre', e.target.value)} placeholder="如 科幻 / 武侠 / 都市" />
            </div>
            <div className="space-y-1.5">
              <Label>基调 / 文风</Label>
              <Input value={form.tone ?? ''} onChange={(e) => set('tone', e.target.value)} placeholder="如 轻松幽默 / 暗黑严肃" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>世界观</Label>
            <Textarea value={form.worldview ?? ''} onChange={(e) => set('worldview', e.target.value)} placeholder="核心设定、力量体系、时代背景…" rows={3} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>风格指南（视觉/文本统一参考）</Label>
              <Input value={form.styleGuide ?? ''} onChange={(e) => set('styleGuide', e.target.value)} placeholder="如 水墨写意的东方美学" />
            </div>
            <div className="space-y-1.5">
              <Label>默认图片风格</Label>
              <Input value={form.defaultStyle ?? ''} onChange={(e) => set('defaultStyle', e.target.value)} placeholder="如 水墨 / 写实 / 二次元" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>创作禁忌</Label>
            <Textarea value={form.forbidden ?? ''} onChange={(e) => set('forbidden', e.target.value)} placeholder="生成与对话都必须避开的内容" rows={2} />
          </div>

          <div className="space-y-3 pt-2">
            <Label className="flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> 写作目标</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">总字数目标</Label>
                <Input type="number" value={form.wordCountGoal ?? ''} onChange={(e) => setNumber('wordCountGoal', e.target.value ? Number(e.target.value) : undefined)} placeholder="如 100000" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">每日目标（字）</Label>
                <Input type="number" value={form.dailyWordCountGoal ?? ''} onChange={(e) => setNumber('dailyWordCountGoal', e.target.value ? Number(e.target.value) : undefined)} placeholder="如 1000" />
              </div>
            </div>
          </div>

          {/* 自定义设定维度：用户自由增删（势力/战力/阵营关系…） */}
          <div className="space-y-3 pt-2 border-t border-border/40">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> 自定义设定维度</Label>
              <Button size="sm" variant="outline" onClick={addSection}>
                <Plus className="w-3.5 h-3.5 mr-1" /> 添加维度
              </Button>
            </div>
            {(form.sections ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无自定义维度。可添加「势力设定」「战力体系」「阵营关系」等任意维度，按需注入生成。</p>
            ) : (
              <div className="space-y-3">
                {(form.sections ?? []).map((sec) => (
                  <Card key={sec.id} className="border-border/40 bg-background/40">
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={sec.title}
                          onChange={(e) => updateSection(sec.id, { title: e.target.value })}
                          placeholder="维度名称，如 势力设定"
                          className="h-8 text-sm flex-1"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className={cn('h-8 px-2', sec.pinned ? 'text-primary' : 'text-muted-foreground')}
                          title={sec.pinned ? '已常驻注入生成（点击取消）' : '设为常驻注入生成'}
                          onClick={() => updateSection(sec.id, { pinned: !sec.pinned })}
                        >
                          {sec.pinned ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-muted-foreground hover:text-destructive"
                          title="删除维度"
                          onClick={() => removeSection(sec.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <Textarea
                        value={sec.content}
                        onChange={(e) => updateSection(sec.id, { content: e.target.value })}
                        placeholder="该维度的详细设定…"
                        rows={3}
                        className="text-sm"
                      />
                      {sec.pinned && (
                        <p className="text-xs text-primary/80">✓ 常驻注入：每次生成都会带上该维度</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {preview && (
            <div className="rounded-xl border border-border/40 bg-background/40 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground/70">将注入的上下文预览：</p>
              <p className="leading-relaxed">{preview}</p>
            </div>
          )}

          <Button onClick={handleSave} disabled={isSaving} className="w-full">
            <Save className="w-4 h-4 mr-2" /> {isSaving ? '保存中...' : '保存创作设定'}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
