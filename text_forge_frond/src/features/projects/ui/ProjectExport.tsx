// src/components/projects/ProjectExport.tsx
'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Download, Upload, FileJson, FileText, FileType, HelpCircle } from 'lucide-react';
import { useProjectStore } from '@/features/projects';
import { useCharacterStore } from '@/lib/stores/characterStore';
import { useBriefStore } from '@/features/projects';
import { useModelStore } from '@/lib/stores/modelStore';
import { useSettingsStore } from '@/lib/stores/settingsStore';
import {
  exportWorkspace, downloadBackup, importWorkspace,
  exportProjectJson, exportProjectMarkdown, exportProjectText,
  parseWorkspaceBackup,
} from '@/lib/storage/backup';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Format = 'json' | 'markdown' | 'txt';
type Busy = Format | 'all' | 'import' | null;

  const FORMATS: { key: Format; label: string; icon: typeof FileJson; hint: string }[] = [
    { key: 'json', label: 'JSON', icon: FileJson, hint: '完整备份（含设定/角色/大纲）' },
    { key: 'markdown', label: 'MD', icon: FileType, hint: '含标题格式的完整内容' },
    { key: 'txt', label: '纯正文', icon: FileText, hint: '仅导出正文，不含设定/角色/图片' },
  ];

export function ProjectExport({ projectId, compact = false }: { projectId?: string; compact?: boolean }) {
  const [busy, setBusy] = useState<Busy>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [askTxt, setAskTxt] = useState(false);
  const [busyTxt, setBusyTxt] = useState<null | 'tidy' | 'format'>(null);

  const handleSingle = async (fmt: Format) => {
    if (!projectId) return;
    if (fmt !== 'txt') {
      setBusy(fmt);
      try {
        if (fmt === 'json') await exportProjectJson(projectId);
        else await exportProjectMarkdown(projectId);
        toast.success(`已导出当前项目（${fmt.toUpperCase()}）`);
      } catch (e) {
        toast.error('导出失败', { description: e instanceof Error ? e.message : '未知错误' });
      } finally {
        setBusy(null);
      }
      return;
    }
    // TXT：先询问排版方式
    setAskTxt(true);
  };

  const doExportTxt = async (mode: 'tidy' | 'format') => {
    if (!projectId) return;
    setAskTxt(false);
    setBusyTxt(mode);
    try {
      await exportProjectText(projectId, mode);
      toast.success(mode === 'format' ? '已导出纯正文（已段落排版）' : '已导出纯正文（仅轻度规整）');
    } catch (e) {
      toast.error('导出失败', { description: e instanceof Error ? e.message : '未知错误' });
    } finally {
      setBusyTxt(null);
    }
  };

  const handleExportAll = async () => {
    setBusy('all');
    try {
      const { projects } = useProjectStore.getState();
      const { characters } = useCharacterStore.getState();
      const { briefs } = useBriefStore.getState();
      const { models } = useModelStore.getState();
      const s = useSettingsStore.getState();
      const settingsData = {
        bgImage: s.bgImage, bgOpacity: s.bgOpacity, bgBlur: s.bgBlur, bgArea: s.bgArea,
        cardGlassOpacity: s.cardGlassOpacity, cardGlassBlur: s.cardGlassBlur,
        sidebarGlassOpacity: s.sidebarGlassOpacity, sidebarGlassBlur: s.sidebarGlassBlur,
        glassEnabled: s.glassEnabled, inkEnabled: s.inkEnabled, inkOpacity: s.inkOpacity,
        motionEnabled: s.motionEnabled, suggestionFrequency: s.suggestionFrequency, theme: s.theme,
      };

      const backup = await exportWorkspace(
        { projects, characters, briefs, models, settings: settingsData },
        projects.map((p) => p.id),
      );
      downloadBackup(backup);
      toast.success('已导出完整工作区备份');
    } catch (e) {
      toast.error('导出失败', { description: e instanceof Error ? e.message : '未知错误' });
    } finally {
      setBusy(null);
    }
  };

  const handleImportFile = async (file: File) => {
    setBusy('import');
    try {
      const text = await file.text();
      const backup = parseWorkspaceBackup(text);
      await importWorkspace(
        backup,
        {
          projects: (d) => { useProjectStore.setState({ projects: d as never }); },
          characters: (d) => { useCharacterStore.setState({ characters: d as never }); },
          briefs: (d) => { useBriefStore.setState({ briefs: d as never }); },
          models: (d) => { useModelStore.setState({ models: d as never }); },
          settings: (d) => { useSettingsStore.setState(d as never); },
        },
        Object.keys(backup.outlines || {}),
      );
      toast.success('备份已导入（本地数据已更新，登录后与云端同步）');
    } catch (e) {
      toast.error('导入失败', { description: e instanceof Error ? e.message : '未知错误' });
    } finally {
      setBusy(null);
    }
  };

  // 单项目导出：横向紧凑按钮组
  if (projectId) {
    return (
      <>
        <div className={cn('flex items-center gap-1.5', compact && 'flex-wrap')}>
          <span className="text-xs text-muted-foreground mr-1 hidden sm:inline">导出项目</span>
          {FORMATS.map((f) => {
            const Icon = f.icon;
            return (
              <Button
                key={f.key}
                variant="outline"
                size="sm"
                className="h-8 px-2.5 gap-1.5"
                onClick={() => handleSingle(f.key)}
                disabled={busy !== null || busyTxt !== null}
                title={`导出为 ${f.label}：${f.hint}`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="text-xs">{f.label}</span>
              </Button>
            );
          })}
        </div>
        <Dialog open={askTxt} onOpenChange={setAskTxt}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>导出纯正文（TXT）</DialogTitle>
              <DialogDescription>
                此格式只导出正文内容，不含设定、角色与配图。请选择排版方式：
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-1">
              <Button variant="outline" className="w-full justify-start h-auto py-2.5 pr-2" onClick={() => doExportTxt('tidy')} disabled={busyTxt !== null}>
                <div className="text-left flex-1">
                <p className="text-sm font-medium flex items-center gap-1">
                  仅轻度规整
                  <span className="inline-flex cursor-help" title="只做无害清理：去掉每行末尾多余空格、把连续多个空行压成一个。不改动你的段落和换行，正文原样保留。"><HelpCircle className="w-3.5 h-3.5 text-muted-foreground" /></span>
                </p>
                  <p className="text-xs text-muted-foreground">去掉行尾空格、压缩多余空行，保留原段落与换行</p>
                </div>
              </Button>
              <Button variant="outline" className="w-full justify-start h-auto py-2.5 pr-2" onClick={() => doExportTxt('format')} disabled={busyTxt !== null}>
                <div className="text-left flex-1">
                <p className="text-sm font-medium flex items-center gap-1">
                  轻度规整 + 段落排版
                  <span className="inline-flex cursor-help" title="在轻度规整基础上，按空行把正文重新分成整齐的段落；但《第X章》这类章节标题会单独成行、不会并入上一段。"><HelpCircle className="w-3.5 h-3.5 text-muted-foreground" /></span>
                </p>
                  <p className="text-xs text-muted-foreground">在规整基础上重排段落，并保留章节标题不并入正文</p>
                </div>
              </Button>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAskTxt(false)} disabled={busyTxt !== null}>取消</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // 全部导出 / 导入：下拉菜单，避免占宽
  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleExportAll} disabled={busy !== null}>
          <Download className="w-3.5 h-3.5" />
          <span className="text-xs">{busy === 'all' ? '导出中...' : '导出全部'}</span>
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
          <Upload className="w-3.5 h-3.5" />
          <span className="text-xs">{busy === 'import' ? '导入中...' : '导入'}</span>
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) handleImportFile(e.target.files[0]); e.target.value = ''; }}
      />
    </div>
  );
}
