'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Plus, FileText, X, ExternalLink, Users } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useBookDetailStore } from '../store';
import { Chapter, Volume } from '@/shared/api/types';

function buildOutlineTree(volumes: (Volume & { chapters: Chapter[] })[]) {
  return volumes.map((vol) => ({
    id: `vol-${vol.id}`,
    label: vol.title,
    type: 'volume' as const,
    summary: vol.summary,
    count: vol.chapters.length,
    children: vol.chapters.map((ch) => ({
      id: `ch-${ch.id}`,
      label: ch.title,
      type: 'chapter' as const,
      chapterId: ch.id,
      summary: ch.summary,
      characterIds: ch.characterIds ?? [],
      sortOrder: ch.sortOrder,
      updatedAt: ch.updatedAt,
    })),
  }));
}

export function OutlineTree() {
  const chapters = useBookDetailStore((s) => s.chapters);
  const volumesV = useBookDetailStore((s) => s.volumes);
  const characters = useBookDetailStore((s) => s.characters);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedChapter, setSelectedChapter] = useState<{
    id: number; title: string; summary?: string;
    characterIds: number[]; sortOrder: number; updatedAt: string;
  } | null>(null);

  const tree = buildOutlineTree(chapters.length ? chapters : volumesV.map((v) => ({ ...v, chapters: [] })));

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const totalChapters = tree.reduce((sum, v) => sum + (v.count || v.children?.length || 0), 0);

  return (
    <>
      <div className="ide-sidebar-header">
        大纲
        <button className="text-muted-foreground text-xs hover:text-foreground cursor-pointer bg-transparent border-none" title="新建卷">
          <Plus size={14} />
        </button>
      </div>
      <div className="ide-sidebar-body p-1">
        {tree.map((vol) => (
          <div key={vol.id}>
            <div
              className="ide-outline-row ide-outline-row--volume"
              onClick={() => toggleExpand(vol.id)}
              role="button"
              tabIndex={0}
            >
              <ChevronRight
                size={12}
                className={cn('ol-twistie text-muted-foreground shrink-0 transition-transform', expanded.has(vol.id) && 'rotate-90')}
              />
              <span className="ol-label">{vol.label}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{vol.children?.length ?? 0} 章</span>
            </div>
            {expanded.has(vol.id) && vol.children?.map((ch) => (
              <div key={ch.id}>
                <div
                  className={cn('ide-outline-row ide-outline-row--chapter', selectedChapter?.id === ch.chapterId && 'is-active')}
                  onClick={() => setSelectedChapter(selectedChapter?.id === ch.chapterId ? null : {
                    id: ch.chapterId, title: ch.label, summary: ch.summary,
                    characterIds: ch.characterIds, sortOrder: ch.sortOrder, updatedAt: ch.updatedAt,
                  })}
                  role="button"
                  tabIndex={0}
                >
                  <FileText size={10} className="text-muted-foreground shrink-0 ml-1" />
                  <span className="ol-label">{ch.label}</span>
                  {ch.characterIds?.length > 0 && (
                    <span className="text-[10px] text-muted-foreground shrink-0">{ch.characterIds.length}角色</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
        {tree.length === 0 && (
          <div className="text-xs text-muted-foreground p-3 text-center">暂无卷/章</div>
        )}
      </div>

      {selectedChapter && (
        <div className="border-t border-border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium truncate">{selectedChapter.title}</span>
            <button onClick={() => setSelectedChapter(null)} className="text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer">
              <X size={12} />
            </button>
          </div>
          {selectedChapter.summary && (
            <div className="text-[11px] text-muted-foreground leading-relaxed">{selectedChapter.summary}</div>
          )}
          {selectedChapter.characterIds.length > 0 && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Users size={10} />
              {selectedChapter.characterIds.map((cid) => {
                const ch = characters.find((c) => c.id === cid);
                return ch ? (
                  <span key={cid} className="bg-muted px-1 rounded">{ch.name}</span>
                ) : null;
              })}
            </div>
          )}
          <div className="text-[10px] text-muted-foreground">
            顺序 #{selectedChapter.sortOrder} · {new Date(selectedChapter.updatedAt).toLocaleDateString()}
          </div>
          <Link
            href={`/manuscript/${selectedChapter.id}`}
            className="flex items-center justify-center gap-1 w-full h-7 rounded-md bg-foreground text-background text-xs font-medium no-underline hover:opacity-90"
          >
            <ExternalLink size={10} /> 在手稿中编辑
          </Link>
        </div>
      )}
      <div className="ide-sidebar-footer space-y-0.5">
        <div className="ide-sidebar-stat"><span>总卷数</span><span>{volumesV.length || tree.length}</span></div>
        <div className="ide-sidebar-stat"><span>总章节</span><span>{totalChapters}</span></div>
      </div>
    </>
  );
}
