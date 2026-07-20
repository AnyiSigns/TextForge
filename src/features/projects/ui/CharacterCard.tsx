// src/components/projects/CharacterCard.tsx
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  MessageCircle, Trash2, Eye, Sparkles, CircleDot, Link2, Pencil, Upload,
} from 'lucide-react';
import { Character, CharacterRole } from '@/types';

export interface CharacterCardActions {
  onRelations: (c: Character) => void;
  onStudio: (c: Character) => void;
  onStatus: (c: Character) => void;
  onDetail: (c: Character) => void;
  onEdit: (c: Character) => void;
  onDelete: (id: string) => void;
  onAvatarChange: (id: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  onUploadClick: (id: string) => void;
  avatarInputRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
}

interface CharacterCardProps {
  char: Character;
  isEditing: boolean;
  editName: string;
  editDesc: string;
  editRole: string;
  editCustomRole: string;
  viewMode: 'list' | 'grid';
  onName: (v: string) => void;
  onDesc: (v: string) => void;
  onRole: (v: string) => void;
  onCustomRole: (v: string) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  rolePresets: { value: CharacterRole; label: string }[];
  roleLabel: (char: Character | { role?: string; customRole?: string }) => string | null;
  statusBadge: (status?: string) => React.ReactNode;
  actions: CharacterCardActions;
}

export function CharacterCard(props: CharacterCardProps) {
  const {
    char, isEditing, editName, editDesc, editRole, editCustomRole, viewMode,
    onName, onDesc, onRole, onCustomRole, onSaveEdit, onCancelEdit,
    rolePresets, roleLabel, statusBadge, actions,
  } = props;

  const roleField = (
    <div className="space-y-1.5">
      <label className="text-xs text-muted-foreground">故事定位</label>
      <select
        value={editRole}
        onChange={(e) => onRole(e.target.value)}
        className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
      >
        <option value="">未设定</option>
        {rolePresets.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      {editRole === 'custom' && (
        <Input
          value={editCustomRole}
          onChange={(e) => onCustomRole(e.target.value)}
          placeholder="自定义定位，如：亦正亦邪的军师"
          className="mt-1.5 h-9 rounded-xl text-sm"
        />
      )}
    </div>
  );

  const actionBar = () => (
    <div className="flex items-center gap-1.5 shrink-0">
      <Button asChild size="sm" variant="default" className="rounded-xl">
        <Link href={`/characters/${char.id}/chat`}>
          <MessageCircle className="w-4 h-4 mr-1.5" /> 对话
        </Link>
      </Button>
      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => actions.onRelations(char)} title="设置角色关系">
        <Link2 className="w-4 h-4" />
      </Button>
      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => actions.onStudio(char)} title="生成立绘 / 素材">
        <Sparkles className="w-4 h-4" />
      </Button>
      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => actions.onStatus(char)} title="设置角色状态">
        <CircleDot className="w-4 h-4" />
      </Button>
      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => actions.onDetail(char)} title="查看角色详情">
        <Eye className="w-4 h-4" />
      </Button>
      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => actions.onEdit(char)}>
        <Pencil className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive rounded-xl" onClick={() => actions.onDelete(char.id)}>
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );

  if (viewMode === 'list') {
    return (
      <div className="flex items-center gap-3 p-2.5 border border-border/40 rounded-xl bg-background/30">
        {isEditing ? (
          <div className="flex-1 min-w-0 space-y-2 w-full">
            <Input value={editName} onChange={(e) => onName(e.target.value)} placeholder="角色名" className="h-9 rounded-xl" autoFocus />
            <Textarea value={editDesc} onChange={(e) => onDesc(e.target.value)} placeholder="角色描述..." rows={2} className="text-sm rounded-xl" />
            {roleField}
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 rounded-xl" onClick={() => onSaveEdit(char.id)}>保存</Button>
              <Button size="sm" variant="outline" className="rounded-xl" onClick={onCancelEdit}>取消</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="relative shrink-0">
              <Avatar className="w-10 h-10 rounded-xl border border-border/40">
                <AvatarImage src={char.avatar} />
                <AvatarFallback className="text-sm rounded-xl">{char.name.slice(0, 2)}</AvatarFallback>
              </Avatar>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium truncate">{char.name}</p>
                {roleLabel(char) && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{roleLabel(char)}</span>
                )}
                {statusBadge(char.status)}
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{char.description || '暂无描述'}</p>
            </div>
            {actionBar()}
          </>
        )}
      </div>
    );
  }

  return (
    <Card className="group rounded-3xl p-1 hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5">
      <CardHeader className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-3.5">
          <div className="relative shrink-0">
            <Avatar className="w-14 h-14 rounded-2xl border border-border/40 shadow-sm">
              <AvatarImage src={char.avatar} />
              <AvatarFallback className="text-lg rounded-2xl">{char.name.slice(0, 2)}</AvatarFallback>
            </Avatar>
            {isEditing && (
              <button
                type="button"
                onClick={() => actions.onUploadClick(char.id)}
                className="absolute -bottom-1 -right-1 grid place-items-center w-6 h-6 rounded-full bg-primary text-primary-foreground ring-2 ring-background"
                title="更换头像"
                aria-label="更换头像"
              >
                <Upload className="w-3 h-3" />
              </button>
            )}
            {isEditing && (
              <input
                ref={(el) => { actions.avatarInputRefs.current[char.id] = el; }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => actions.onAvatarChange(char.id, e)}
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <Input value={editName} onChange={(e) => onName(e.target.value)} className="h-9 text-sm rounded-xl" autoFocus />
            ) : (
              <CardTitle className="text-lg truncate tracking-tight">{char.name}</CardTitle>
            )}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {roleLabel(char) && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{roleLabel(char)}</span>
              )}
              {statusBadge(char.status)}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {isEditing ? (
          <div className="space-y-3">
            <Textarea value={editDesc} onChange={(e) => onDesc(e.target.value)} placeholder="角色描述..." rows={2} className="text-sm rounded-xl" />
            {roleField}
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 rounded-xl" onClick={() => onSaveEdit(char.id)}>保存</Button>
              <Button size="sm" variant="outline" className="rounded-xl" onClick={onCancelEdit}>取消</Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-4">{char.description || '暂无描述'}</p>
            {actionBar()}
          </>
        )}
      </CardContent>
    </Card>
  );
}
