// src/app/(dashboard)/projects/new/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Plus, BookPlus, LayoutTemplate } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/features/projects';

const PRESET_GENRES = ['科幻', '奇幻', '言情', '悬疑', '武侠', '都市', '历史', '仙侠', '末世', '轻小说'];

export default function NewProjectPage() {
  const router = useRouter();
  const addProject = useProjectStore((s) => s.addProject);
  const templates = useProjectStore((s) => s.templates);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('');
  const [customGenre, setCustomGenre] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // 字段级错误：未填必填项时高亮具体字段（而非仅靠 toast）
  const [errors, setErrors] = useState<{ title?: string; genre?: string }>({});

  const addCustom = () => {
    const g = customGenre.trim();
    if (!g) return;
    if (PRESET_GENRES.includes(g)) { setGenre(g); setCustomGenre(''); return; }
    setGenre(g);
    setCustomGenre('');
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setGenre(template.genre || '');
      setDescription(template.description);
      setTitle(title || `新${template.name}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: { title?: string; genre?: string } = {};
    if (!title.trim()) nextErrors.title = '请填写小说标题';
    if (!genre.trim()) nextErrors.genre = '请选择或填写题材';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast.error('请完善必填信息');
      return;
    }
    setIsLoading(true);
    try {
      const project = await addProject({ title, description, genre: genre.trim() });
      // 跳转工作台：项目设定/角色/大纲/生成都从工作台进入更顺手
      toast.success('项目创建成功，前往工作台开始创作');
      router.push(`/projects/${project.id}`);
    } catch (e) {
      toast.error('创建失败', { description: e instanceof Error ? e.message : '未知错误' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Button variant="ghost" className="mb-4" onClick={() => router.back()}>
        <ArrowLeft className="w-4 h-4 mr-2" /> 返回
      </Button>

      <PageHeader icon={BookPlus} title="新建小说项目" description="设置小说基本信息，AI 将根据这些信息开始创作" className="mb-5" />

      <Card className="glass-card mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><LayoutTemplate className="w-4 h-4" /> 项目模板</CardTitle>
          <CardDescription>选择预设模板快速开始，也可自定义</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleTemplateSelect(t.id)}
                className={cn(
                  'p-3 rounded-lg border text-left transition-all hover:bg-accent/40',
                  selectedTemplate === t.id ? 'border-primary/40 bg-primary/10' : 'border-border'
                )}
              >
                <p className="font-medium text-sm">{t.name}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>项目信息</CardTitle>
          <CardDescription>题材可自定义，选择预设或填写你自己的分类</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">小说标题</Label>
              <Input
                id="title"
                value={title}
                onChange={e => { setTitle(e.target.value); if (errors.title) setErrors(p => ({ ...p, title: undefined })); }}
                placeholder="输入小说标题"
                required
                aria-invalid={!!errors.title}
                className={errors.title ? 'border-destructive focus-visible:border-destructive' : ''}
              />
              {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="genre">题材（可自定义）</Label>
              <div className={errors.genre ? 'rounded-lg border border-destructive p-2' : ''}>
                <div className="flex flex-wrap gap-2">
                  {PRESET_GENRES.map(g => (
                    <button
                      type="button"
                      key={g}
                      onClick={() => { setGenre(g); if (errors.genre) setErrors(p => ({ ...p, genre: undefined })); }}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-sm border transition-all',
                        genre === g
                          ? 'bg-primary/12 text-primary border-primary/30 ring-1 ring-primary/20'
                          : 'border-border text-muted-foreground hover:bg-accent/60'
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <Input
                    id="genre"
                    value={customGenre}
                    onChange={e => setCustomGenre(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
                    placeholder="自定义题材，如：赛博修仙"
                  />
                  <Button type="button" variant="outline" onClick={addCustom}><Plus className="w-4 h-4 mr-1" />添加</Button>
                </div>
              </div>
              {genre && (
                <p className="text-xs text-muted-foreground">当前题材：<span className="text-primary font-medium">{genre}</span></p>
              )}
              {errors.genre && <p className="text-xs text-destructive">{errors.genre}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">故事梗概</Label>
              <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} placeholder="简要描述故事背景、主题和风格" rows={4} />
            </div>

            <div className="flex gap-3 pt-1">
              <Button type="submit" disabled={isLoading}>{isLoading ? '创建中...' : '创建项目'}</Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>取消</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}