// src/components/settings/ModelEditDialog.tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { MODEL_TEMPLATES } from '../api/templates';
import type { RoleModelConfig } from '@/types';

interface ModelEditDialogProps {
  editing: RoleModelConfig | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (model: RoleModelConfig) => void;
  onDelete?: () => void;
  mode: 'text' | 'vision' | 'embedding';
}

export function ModelEditDialog(props: ModelEditDialogProps) {
  const { editing, open, onOpenChange, onSave, onDelete, mode } = props;

  if (!editing) return null;

  const categoryMap: Record<string, string> = { text: 'llm', vision: 'vision', embedding: 'embedding' };
  const category = categoryMap[mode];

  const [draft, setDraft] = useState<RoleModelConfig>(editing);

  useEffect(() => {
    setDraft(editing);
  }, [editing]);

  const onPatch = (patch: Partial<RoleModelConfig>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch } as RoleModelConfig;
      if (patch.adapter) {
        const t = MODEL_TEMPLATES.find((x) => x.adapter === patch.adapter && x.category === category);
        if (t) {
          if (!patch.name) next.name = t.vendor;
          if (!patch.modelId) next.modelId = t.defaultModelId;
          if (!patch.baseUrl) next.baseUrl = t.defaultBaseUrl ?? '';
        }
      }
      return next;
    });
  };

  const templateKey = MODEL_TEMPLATES.find((t) => t.adapter === draft.adapter && t.category === category)?.key;

  const filteredTemplates = MODEL_TEMPLATES.filter((t) => t.category === category);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{open ? (draft.id ? '编辑模型' : '添加模型') : '编辑模型'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>服务商 / 模板</Label>
            <Select value={templateKey} onValueChange={(v) => {
              const t = MODEL_TEMPLATES.find((x) => x.key === v);
              if (t) onPatch({ adapter: t.adapter, name: t.vendor, modelId: t.defaultModelId, baseUrl: t.defaultBaseUrl ?? '' });
            }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="选择服务商模板" /></SelectTrigger>
              <SelectContent>
                {filteredTemplates.map((t) => (
                  <SelectItem key={t.key} value={t.key}>{t.vendor}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input value={draft.name} onChange={(e) => onPatch({ name: e.target.value })} placeholder="自定义名称（可选）" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label>模型名</Label>
              <Input value={draft.modelId} onChange={(e) => onPatch({ modelId: e.target.value })} placeholder="如 deepseek-chat（直接粘贴模型名称）" autoComplete="off" />
            </div>
          </div>

          <div className="space-y-1.5">
             <Label>服务地址</Label>
               <Input value={draft.baseUrl ?? ''} onChange={(e) => onPatch({ baseUrl: e.target.value })} placeholder="https://" autoComplete="off" />
          </div>

          <div className="space-y-1.5">
             <Label>密钥</Label>
               <Input type="password" value={draft.apiKey ?? ''} onChange={(e) => onPatch({ apiKey: e.target.value })} placeholder="sk-..." autoComplete="off" />
          </div>

          {MODEL_TEMPLATES.find((t) => t.adapter === draft.adapter && t.category === category)?.extraFields?.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label}</Label>
              <Input
                type={f.type === 'number' ? 'number' : 'text'}
                value={String(draft.extra?.[f.key] ?? '')}
                onChange={(e) => onPatch({ extra: { ...(draft.extra ?? {}), [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value } })}
                placeholder={f.placeholder}
              />
            </div>
          ))}
        </div>

        <DialogFooter className="flex items-center justify-between">
          <div>
            {onDelete && (
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onDelete}>
                删除
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button onClick={() => onSave({ ...draft })} disabled={!draft.modelId}>保存</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
