// src/components/shared/ProjectPicker.tsx
'use client';

import { useEffect } from 'react';
import { useProjectStore } from '@/features/projects';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export const NO_PROJECT = '__none__';

export function ProjectPicker({
  value,
  onChange,
  label = '关联项目',
}: {
  value: string | null;
  onChange: (projectId: string | null) => void;
  label?: string;
}) {
  const { projects, load, loaded } = useProjectStore();

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground">{label}</Label>
      <Select
        value={value ?? NO_PROJECT}
        onValueChange={(v) => onChange(v === NO_PROJECT ? null : v)}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="关联到项目（可选）">
            {(v: string) => {
              if (v === NO_PROJECT) return '不关联项目';
              return projects.find((p) => p.id === v)?.title ?? '选择项目';
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_PROJECT}>不关联项目</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.title || '未命名项目'}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground/80">
        关联后，可以在项目工作台查看相关产出
      </p>
    </div>
  );
}
