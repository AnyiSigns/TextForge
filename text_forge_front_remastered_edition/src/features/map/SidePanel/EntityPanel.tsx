'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Lock } from 'lucide-react';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { useEditorStore } from '@/features/map/stores/editorStore';
import { ConfirmDialog } from '@/features/map/components/ConfirmDialog';
import { cn } from '@/shared/lib/cn';

export function EntityPanel() {
  const foreshadowings = useEntityStore((s) => s.foreshadowings);
  const plotThreads = useEntityStore((s) => s.plotThreads);
  const chapters = useEntityStore((s) => s.chapters);
  const characters = useEntityStore((s) => s.characters);
  const sceneEvents = useEntityStore((s) => s.sceneEvents);
  const removeForeshadowing = useEntityStore((s) => s.removeForeshadowing);
  const removePlotThread = useEntityStore((s) => s.removePlotThread);
  const openEditor = useEditorStore((s) => s.open);

  const [deleteFwId, setDeleteFwId] = useState<number | null>(null);
  const [deletePtId, setDeletePtId] = useState<number | null>(null);

  const statusColor = (status: string) => {
    switch (status) {
      case 'planted': return 'text-amber-500/60';
      case 'ongoing': return 'text-emerald-500/60';
      case 'resolved': return 'text-muted-foreground/40';
      default: return 'text-muted-foreground/50';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'planted': return '已埋下';
      case 'ongoing': return '进行中';
      case 'resolved': return '已回收';
      default: return status;
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between px-1 mb-2">
          <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">伏笔</span>
          <button
            onClick={() => openEditor('foreshadowing', null)}
            className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground/60 bg-transparent border-none cursor-pointer transition-colors"
            title="添加伏笔"
          >
            <Plus size={12} strokeWidth={1.8} />
          </button>
        </div>

        {foreshadowings.length === 0 ? (
          <div className="text-[11px] text-muted-foreground/40 text-center py-3 transition-all duration-200">
            暂无伏笔，点击 + 添加
          </div>
        ) : (
          <div className="space-y-1.5">
            {foreshadowings.map((f) => {
              const plantedCh = chapters.find((c) => c.id === f.plantedAtChapterId);
              const resolvedCh = chapters.find((c) => c.id === f.resolvedAtChapterId);
              const relatedEv = sceneEvents.find((e) => e.id === f.relatedEventId);
              const relatedChars = characters.filter((c) => f.relatedCharacterIds?.includes(c.id));
              return (
              <div
                key={`f-${f.id}`}
                className="px-2 py-2 rounded-lg border border-border/30 bg-card/50 group transition-all duration-200 hover:scale-[1.02] hover:bg-foreground/[0.02]"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] leading-relaxed text-foreground/70 flex-1">
                    {f.description}
                  </p>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {f.locked && <Lock size={9} className="text-muted-foreground/30" />}
                    <span className={cn('text-[9px]', statusColor(f.status))}>
                      {statusLabel(f.status)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5">
                  {plantedCh && (
                    <span className="text-[9px] text-muted-foreground/40">埋下: {plantedCh.title}</span>
                  )}
                  {resolvedCh && (
                    <span className="text-[9px] text-muted-foreground/40">回收: {resolvedCh.title}</span>
                  )}
                  <span className="text-[9px] text-muted-foreground/40">
                    揭示: {f.revealType === 'gradual' ? '逐步' : f.revealType === 'twist' ? '反转' : f.revealType === 'sudden' ? '突然' : f.revealType}
                  </span>
                  {relatedEv && (
                    <span className="text-[9px] text-muted-foreground/40">事件: {relatedEv.title}</span>
                  )}
                </div>
                {relatedChars.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {relatedChars.map((ch) => (
                      <span key={ch.id} className="text-[8px] px-1 py-0.5 rounded bg-foreground/[0.04] text-foreground/50">{ch.name}</span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-end mt-1 opacity-0 group-hover:opacity-100 transition-all">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditor('foreshadowing', f.id)}
                      className="w-3.5 h-3.5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground/60 hover:scale-110 transition-all bg-transparent border-none cursor-pointer"
                      title="编辑"
                    >
                      <Pencil size={10} strokeWidth={1.8} />
                    </button>
                    <button
                      onClick={() => setDeleteFwId(f.id)}
                      className="w-3.5 h-3.5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-red-500/60 hover:scale-110 transition-all bg-transparent border-none cursor-pointer"
                      title="删除"
                    >
                      <Trash2 size={10} strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
              </div>
            )})}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between px-1 mb-2">
          <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">情节线</span>
          <button
            onClick={() => openEditor('plot-thread', null)}
            className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground/60 bg-transparent border-none cursor-pointer transition-colors"
            title="添加情节线"
          >
            <Plus size={12} strokeWidth={1.8} />
          </button>
        </div>

        {plotThreads.length === 0 ? (
          <div className="text-[11px] text-muted-foreground/40 text-center py-3 transition-all duration-200">
            暂无情节线，点击 + 添加
          </div>
        ) : (
          <div className="space-y-1.5">
            {plotThreads.map((p) => (
              <div
                key={`p-${p.id}`}
                className="px-2 py-2 rounded-lg border border-border/30 bg-card/50 group transition-all duration-200 hover:scale-[1.02] hover:bg-foreground/[0.02]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-foreground/70">{p.name}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={() => openEditor('plot-thread', p.id)}
                      className="w-3.5 h-3.5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground/60 hover:scale-110 transition-all bg-transparent border-none cursor-pointer"
                      title="编辑"
                    >
                      <Pencil size={10} strokeWidth={1.8} />
                    </button>
                    <button
                      onClick={() => setDeletePtId(p.id)}
                      className="w-3.5 h-3.5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-red-500/60 hover:scale-110 transition-all bg-transparent border-none cursor-pointer"
                      title="删除"
                    >
                      <Trash2 size={10} strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className={cn('text-[9px]', statusColor(p.status))}>
                    {statusLabel(p.status)}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground/60 mt-1 leading-relaxed">
                  {p.description}
                </p>
                {p.progressNote && (
                  <p className="text-[9px] text-muted-foreground/40 mt-1 italic">
                    {p.progressNote}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {deleteFwId !== null && (
        <ConfirmDialog
          title="删除伏笔"
          message="确定要删除该伏笔吗？"
          confirmLabel="删除"
          onConfirm={() => { removeForeshadowing(deleteFwId); setDeleteFwId(null); }}
          onCancel={() => setDeleteFwId(null)}
        />
      )}

      {deletePtId !== null && (
        <ConfirmDialog
          title="删除情节线"
          message="确定要删除该情节线吗？"
          confirmLabel="删除"
          onConfirm={() => { removePlotThread(deletePtId); setDeletePtId(null); }}
          onCancel={() => setDeletePtId(null)}
        />
      )}
    </div>
  );
}
