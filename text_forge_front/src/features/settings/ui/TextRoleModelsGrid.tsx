'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Check, AlertCircle } from 'lucide-react';
import type { ModelRole, RoleModelConfig } from '@/types';

interface TextRoleModelsGridProps {
  textRoleModels: Record<ModelRole, RoleModelConfig | null>;
  testStatus: Record<string, 'idle' | 'testing' | 'success' | 'error'>;
  onEdit: (role: ModelRole) => void;
  onDelete: (role: ModelRole, key: string) => void;
  onTest: (m: RoleModelConfig) => void;
  onAdd: (role: ModelRole) => void;
}

const TEXT_ROLES: ModelRole[] = ['main', 'audit', 'router', 'tool'];

export function TextRoleModelsGrid({ textRoleModels, testStatus, onEdit, onDelete, onTest, onAdd }: TextRoleModelsGridProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">文本生成（最少 1 个主模型）</p>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground" onClick={() => onAdd('main')}>
          <Plus className="w-3.5 h-3.5 mr-1" /> 添加模型
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {TEXT_ROLES.map((role) => {
          const m = textRoleModels[role];
          const isMain = role === 'main';
          const display = m && m.modelId ? m : null;
          return (
            <div key={role} className="rounded-xl border border-border/40 bg-background/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{label(role)}</span>
                {isMain && <Badge variant="secondary" className="text-[10px]">必须</Badge>}
              </div>
              {display ? (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium truncate">{display.name || label(role)}</p>
                  <p className="text-xs text-muted-foreground truncate">{display.modelId}</p>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onTest(display)}>
                      {testStatus[display.id] === 'success' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : testStatus[display.id] === 'error' ? <AlertCircle className="w-3.5 h-3.5 text-destructive" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onEdit(role)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    {(() => {
                      const key = role === 'audit' ? 'audit_config' : role === 'router' ? 'router_config' : role === 'tool' ? 'tool_config' : 'main_config';
                      return (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={() => onDelete(role, key)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full mt-1" onClick={() => onAdd(role)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> {isMain ? '选择模型' : '添加'}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function label(role: ModelRole): string {
  return { main: '主模型', audit: '轻量模型', router: '路由模型（自动选模型）', tool: '工具模型' }[role];
}