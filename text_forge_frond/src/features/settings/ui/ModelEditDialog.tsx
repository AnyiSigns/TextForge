// src/components/settings/ModelEditDialog.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  MODEL_TEMPLATES,
} from '../api/templates';
import type { ModelConfig, RoleModelConfig } from '@/types';

interface ModelEditDialogProps {
  editing: ModelConfig | RoleModelConfig | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPatch: (patch: Partial<ModelConfig>) => void;
  onTemplateChange: (key: string) => void;
  onSave: () => void;
}

export function ModelEditDialog(props: ModelEditDialogProps) {
  const { editing, open, onOpenChange, onPatch, onTemplateChange, onSave } = props;

  if (!editing) return null;

  const isRole = 'role' in editing;

  const templateKey = editing
    ? MODEL_TEMPLATES.find((t) => {
        if ('vendor' in editing) return t.vendor === (editing as ModelConfig).vendor && t.adapter === editing.adapter;
        return t.adapter === editing.adapter;
      })?.key
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{open && editing ? (editing.id ? '编辑模型' : '添加模型') : '添加模型'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>厂商 / 模板</Label>
            <Select value={templateKey} onValueChange={(v) => onTemplateChange(v ?? '')}>
              <SelectTrigger className="w-full"><SelectValue placeholder="选择厂商模板" /></SelectTrigger>
              <SelectContent>
                {MODEL_TEMPLATES.filter((t) => !isRole || t.category === 'llm').map((t) => (
                  <SelectItem key={t.key} value={t.key}>{t.vendor}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input value={editing.name} onChange={(e) => onPatch({ name: e.target.value })} placeholder="模型显示名" />
            </div>
            <div className="space-y-1.5">
              <Label>模型 ID</Label>
              <Input value={editing.modelId} onChange={(e) => onPatch({ modelId: e.target.value })} placeholder="如 gpt-4o" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>部署方式</Label>
            <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-xl">
              <button onClick={() => onPatch({ deployment: 'cloud' })}
                className={cn('flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-all', editing.deployment === 'cloud' ? 'bg-primary/10 text-primary ring-1 ring-primary/15' : 'text-muted-foreground hover:bg-accent/60')}>
                云端
              </button>
              <button onClick={() => onPatch({ deployment: 'local' })}
                className={cn('flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-all', editing.deployment === 'local' ? 'bg-primary/10 text-primary ring-1 ring-primary/15' : 'text-muted-foreground hover:bg-accent/60')}>
                本地
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Base URL</Label>
            <Input value={editing.baseUrl ?? ''} onChange={(e) => onPatch({ baseUrl: e.target.value })} placeholder="https://" />
          </div>

          <div className="space-y-1.5">
            <Label>API Key {editing.deployment === 'local' && <span className="text-muted-foreground">(本地可留空)</span>}</Label>
            <Input type="password" value={editing.apiKey ?? ''} onChange={(e) => onPatch({ apiKey: e.target.value })} placeholder="sk-..." />
          </div>

          {MODEL_TEMPLATES.find((t) => t.adapter === editing.adapter && (!isRole || t.category === 'llm'))?.extraFields?.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label}</Label>
              <Input
                type={f.type === 'number' ? 'number' : 'text'}
                value={String(editing.extra?.[f.key] ?? '')}
                onChange={(e) => onPatch({ extra: { ...editing.extra, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value } })}
                placeholder={f.placeholder}
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
          <Button onClick={onSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
