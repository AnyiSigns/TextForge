'use client';

import { useEffect, useState, useRef } from 'react';
import { use } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import * as characterApi from '@/shared/api/characters';
import type { Character } from '@/shared/api/types';
import { PageContainer } from '@/shared/ui/PageContainer';
import { PageHeader } from '@/shared/ui/PageHeader';

export default function CharacterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const characterId = parseInt(id, 10);
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isNaN(characterId)) return;
    setLoading(true);
    characterApi.fetchCharacter(characterId)
      .then((data) => {
        setCharacter(data);
        setName(data.name);
        setDescription(data.description);
        setAvatarPreview(data.avatarUrl || null);
      })
      .catch(() => toast.error('加载角色失败'))
      .finally(() => setLoading(false));
  }, [characterId]);

  const handleSave = async () => {
    if (!character) return;
    setSaving(true);
    try {
      const updated = await characterApi.updateCharacter(character.id, {
        name,
        description,
      });
      setCharacter(updated);
      toast.success('已保存');
    } catch { toast.error('保存失败'); }
    finally { setSaving(false); }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !character) return;
    setUploading(true);
    try {
      const result = await characterApi.uploadCharacterAvatar(character.id, file);
      setAvatarPreview(result.avatarUrl);
      setCharacter({ ...character, avatarUrl: result.avatarUrl });
      toast.success('头像已更新');
    } catch { toast.error('上传失败'); }
    finally { setUploading(false); }
  };

  const handleAvatarDelete = async () => {
    if (!character) return;
    try {
      await characterApi.deleteCharacterAvatar(character.id);
      setAvatarPreview(null);
      setCharacter({ ...character, avatarUrl: null });
      toast.success('头像已删除');
    } catch { toast.error('删除失败'); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">加载中...</div>;
  }

  if (!character) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">角色不存在</div>;
  }

  return (
    <PageContainer>
      <PageHeader
        title="角色详情"
        description={character.bookId ? `书籍 ID: ${character.bookId}` : '全局角色'}
        backHref={`/books/${character.bookId ?? ''}`}
      />

      <div className="px-6 py-5 max-w-2xl space-y-6">
        <section>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">头像</div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-xl font-semibold shrink-0 overflow-hidden">
              {avatarPreview ? (
                <img src={avatarPreview} alt={character.name} className="w-full h-full object-cover" />
              ) : (
                character.name.charAt(0)
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs border border-border bg-transparent hover:bg-muted cursor-pointer disabled:opacity-50"
              >
                <Upload size={12} /> {uploading ? '上传中...' : '上传头像'}
              </button>
              {avatarPreview && (
                <button
                  onClick={handleAvatarDelete}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs border border-destructive/40 text-destructive bg-transparent hover:bg-destructive/10 cursor-pointer"
                >
                  <Trash2 size={12} /> 删除
                </button>
              )}
            </div>
          </div>
        </section>

        <section>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">基本信息</div>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">名称</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-8 px-3 rounded-md text-xs bg-background border border-border focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">描述</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 rounded-md text-xs bg-background border border-border focus:outline-none resize-none"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="h-8 px-4 rounded-md bg-foreground text-background text-xs font-medium border-none cursor-pointer hover:opacity-90 disabled:opacity-30"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </section>

        <section>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">其他信息</div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg border border-border bg-card">
              <div className="text-muted-foreground mb-1">角色类型</div>
              <div className="font-medium">{character.roleType || '未设置'}</div>
            </div>
            <div className="p-3 rounded-lg border border-border bg-card">
              <div className="text-muted-foreground mb-1">状态</div>
              <div className="font-medium">{character.status || 'active'}</div>
            </div>
            <div className="p-3 rounded-lg border border-border bg-card">
              <div className="text-muted-foreground mb-1">创建时间</div>
              <div className="font-medium">{character.createdAt ? new Date(character.createdAt).toLocaleString() : '-'}</div>
            </div>
            <div className="p-3 rounded-lg border border-border bg-card">
              <div className="text-muted-foreground mb-1">更新时间</div>
              <div className="font-medium">{character.updatedAt ? new Date(character.updatedAt).toLocaleString() : '-'}</div>
            </div>
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
