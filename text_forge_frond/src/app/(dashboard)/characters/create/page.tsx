// src/app/(dashboard)/characters/create/page.tsx
'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { uploadAvatar } from '@/lib/api/characters';
import { useCharacterStore } from '@/lib/stores/characterStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, UserPlus, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { ProjectPicker } from '@/components/shared/ProjectPicker';

function readPresetProjectId(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('projectId');
}

export default function CreateCharacterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState<string | null>(readPresetProjectId);
  const [avatar, setAvatar] = useState<string>('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // 字段级错误：未填必填项时高亮具体字段（而非仅靠 toast）
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('请选择图片文件'); return; }
    setAvatarFile(file);
    setAvatar(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: { name?: string; description?: string } = {};
    if (!name.trim()) nextErrors.name = '请填写角色名';
    if (!description.trim()) nextErrors.description = '请填写角色设定';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast.error('请完善必填信息');
      return;
    }
    setIsLoading(true);
    try {
      const character = await useCharacterStore.getState().addCharacter({ name, description, projectId, avatar: avatarFile ? undefined : avatar || undefined });
      if (avatarFile) {
        try {
          await uploadAvatar(character.id, avatarFile);
        } catch {
          toast.warning('角色已创建，但头像上传失败');
        }
      }
      toast.success('角色创建成功');
      router.push(projectId ? `/projects/${projectId}?tab=characters` : '/characters');
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

      <PageHeader icon={UserPlus} title="创建新角色" description="设定角色的姓名、背景和性格，AI 将基于此进行对话" className="mb-5" />

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>角色信息</CardTitle>
          <CardDescription>设定角色的姓名、背景和性格，AI 将基于此进行对话</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar className="w-16 h-16 border-2 border-border">
                  <AvatarImage src={avatar} />
                  <AvatarFallback className="text-xl">{name.slice(0, 2) || '角'}</AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute -bottom-1 -right-1 grid place-items-center w-6 h-6 rounded-full bg-primary text-primary-foreground ring-2 ring-background"
                  title="上传头像"
                >
                  <Upload className="w-3 h-3" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
              </div>
              <div className="space-y-1">
                <Label>角色头像</Label>
                <p className="text-xs text-muted-foreground">可选，点击上传图片</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">角色名</Label>
              <Input
                id="name"
                value={name}
                onChange={e => { setName(e.target.value); if (errors.name) setErrors(p => ({ ...p, name: undefined })); }}
                placeholder="如：林墨"
                required
                aria-invalid={!!errors.name}
                className={errors.name ? 'border-destructive focus-visible:border-destructive' : ''}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">角色设定</Label>
              <Textarea
                id="description"
                value={description}
                onChange={e => { setDescription(e.target.value); if (errors.description) setErrors(p => ({ ...p, description: undefined })); }}
                placeholder="描述角色的性格、背景、说话风格等"
                rows={6}
                required
                aria-invalid={!!errors.description}
                className={errors.description ? 'border-destructive focus-visible:border-destructive' : ''}
              />
              {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
            </div>

            <hr className="ink-divider" />

            <ProjectPicker value={projectId} onChange={setProjectId} label="关联项目（角色模拟 / AI 会话）" />

            <div className="flex gap-3 pt-1">
              <Button type="submit" disabled={isLoading}>{isLoading ? '创建中...' : '创建角色'}</Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>取消</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
