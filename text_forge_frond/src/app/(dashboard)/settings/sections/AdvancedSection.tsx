// src/app/(dashboard)/settings/sections/AdvancedSection.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Download } from 'lucide-react';

interface AdvancedSectionProps {
  onExportAllJson: () => void;
}

export function AdvancedSection({ onExportAllJson }: AdvancedSectionProps) {
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
          <Button variant="outline" onClick={onExportAllJson}>
            <Download className="w-4 h-4 mr-2" /> 导出全部
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
