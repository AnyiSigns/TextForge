// src/app/(dashboard)/settings/sections/AdvancedSection.tsx
'use client';

import { useProjectStore } from '@/features/projects';
import { useCharacterStore } from '@/features/characters';
import { useCreativeSettingStore } from '@/features/projects';
import { useModelStore } from '@/features/settings';
import { useSettingsStore } from '@/features/settings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { exportWorkspace, downloadBackup } from '@/lib/storage/backup';

export function AdvancedSection() {
  const handleExportAllJson = async () => {
    try {
      const books = useProjectStore.getState().books;
      const characters = useCharacterStore.getState().characters;
      const settingsMap = useCreativeSettingStore.getState().settings;
      const models = useModelStore.getState().models;
      const settings = useSettingsStore.getState();
      const projectIds = Array.isArray(books)
        ? books.map((p) => String(p.id))
        : Object.keys(books || {});
      const backup = await exportWorkspace(
        { projects: books, characters, creativeSettings: settingsMap, models, settings },
        projectIds,
      );
      downloadBackup(backup);
      toast.success('已导出全部项目（JSON）');
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      toast.error('导出失败', { description: err.message });
    }
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>高级选项</CardTitle>
        <CardDescription>数据备份与导入等高级功能</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border border-border/40 p-4">
          <div className="space-y-0.5">
            <Label className="text-sm">全部项目导出（JSON）</Label>
            <p className="text-xs text-muted-foreground">导出所有项目、角色、设定与当前设置，便于备份或迁移</p>
          </div>
          <Button variant="outline" onClick={handleExportAllJson}>
            <Download className="w-4 h-4 mr-2" /> 导出全部
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

