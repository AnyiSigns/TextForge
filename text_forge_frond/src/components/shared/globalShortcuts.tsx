// src/components/shared/globalShortcuts.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/features/projects';
import { exportWorkspace, downloadBackup } from '@/lib/storage/backup';
import { toast } from 'sonner';

// 全局快捷键（与 KeyboardShortcuts 列表一致）：真正可用，而非仅展示
export function GlobalShortcuts() {
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();

      // Ctrl/Cmd + N 新建项目
      if (key === 'n') {
        e.preventDefault();
        router.push('/projects/new');
        return;
      }
      // Ctrl/Cmd + S 保存当前项目草稿
      if (key === 's') {
        const match = window.location.pathname.match(/\/projects\/([^/]+)/);
        if (match) {
          e.preventDefault();
          // 草稿已在 workbench 自动保存，这里给用户明确反馈
          toast.success('草稿已保存');
        }
        return;
      }
      // Ctrl/Cmd + Shift + E 导出备份
      if (key === 'e' && e.shiftKey) {
        e.preventDefault();
        void (async () => {
          const { projects } = useProjectStore.getState();
          const { characters } = (await import('@/lib/stores/characterStore')).useCharacterStore.getState();
          const { briefs } = (await import('@/features/projects')).useBriefStore.getState();
          const { models } = (await import('@/lib/stores/modelStore')).useModelStore.getState();
          const s = (await import('@/lib/stores/settingsStore')).useSettingsStore.getState();
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
          toast.success('已导出工作区备份');
        })();
        return;
      }
      // Ctrl/Cmd + Space AI 联想补全：聚焦写作区时，触发手稿编辑器的提及联想（受设置频率控制）
      if (key === ' ' && !e.shiftKey) {
        if (window.location.pathname.startsWith('/manuscript/')) {
          e.preventDefault();
          const trigger = (window as unknown as { __tfTriggerSuggestion?: () => void }).__tfTriggerSuggestion;
          if (trigger) trigger();
          else toast.info('AI 联想补全：在正文输入 @ 提及角色、# 提及设定');
          return;
        }
        // 其他页面维持原提示
        const match = window.location.pathname.match(/\/projects\/([^/]+)/);
        if (!match) return;
        e.preventDefault();
        toast.info('AI 联想补全需在手稿写作编辑区使用（侧边栏「手稿」）');
        return;
      }
      // Ctrl/Cmd + Shift + Delete 清除所有草稿
      if (key === 'delete' && e.shiftKey) {
        e.preventDefault();
        if (typeof window !== 'undefined' && window.confirm('确定清除所有本地草稿？此操作不可撤销')) {
          void (async () => {
            const { projects } = useProjectStore.getState();
            for (const p of projects) {
              try { await useProjectStore.getState().saveDraft(p.id, []); } catch { /* ignore */ }
            }
            toast.success('已清除所有草稿');
          })();
        }
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router]);

  return null;
}
