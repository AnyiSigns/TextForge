'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useEditorStore } from '@/features/map/stores/editorStore';
import { SceneEditor } from './SceneEditor';
import { LocationEditor } from './LocationEditor';
import { CharacterEditor } from './CharacterEditor';
import { ForeshadowingEditor } from './ForeshadowingEditor';
import { PlotThreadEditor } from './PlotThreadEditor';
import { ChapterEditor } from './ChapterEditor';

const PANEL_LABELS: Record<string, string> = {
  scene: '场景编辑',
  location: '地点编辑',
  character: '角色编辑',
  foreshadowing: '伏笔编辑',
  'plot-thread': '情节线编辑',
  chapter: '章节编辑',
  volume: '卷编辑',
};

const NEW_PANEL_LABELS: Record<string, string> = {
  scene: '新建场景',
  location: '新建地点',
  character: '新建角色',
  foreshadowing: '新建伏笔',
  'plot-thread': '新建情节线',
  chapter: '新建章节',
  volume: '新建卷',
};

export function FloatingEditor() {
  const isOpen = useEditorStore((s) => s.isOpen);
  const entityType = useEditorStore((s) => s.entityType);
  const entityId = useEditorStore((s) => s.entityId);
  const isNew = useEditorStore((s) => s.isNew);
  const close = useEditorStore((s) => s.close);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, close]);

  function renderEditor() {
    switch (entityType) {
      case 'scene':
        return <SceneEditor eventId={entityId} isNew={isNew} onClose={close} />;
      case 'location':
        return <LocationEditor locationId={entityId} isNew={isNew} onClose={close} />;
      case 'character':
        return <CharacterEditor characterId={entityId} isNew={isNew} onClose={close} />;
      case 'foreshadowing':
        return <ForeshadowingEditor foreshadowingId={entityId} isNew={isNew} onClose={close} />;
      case 'plot-thread':
        return <PlotThreadEditor plotThreadId={entityId} isNew={isNew} onClose={close} />;
      case 'chapter':
      case 'volume':
        return <ChapterEditor entityType={entityType} entityId={entityId} isNew={isNew} onClose={close} />;
      default:
        return null;
    }
  }

  if (!isOpen) return null;

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 z-40 bg-foreground/[0.02] backdrop-blur-[1px]"
        onClick={close}
      />

      {/* 面板 */}
      <div
        className="fixed top-0 right-0 z-50 h-full w-[420px] bg-card/98 backdrop-blur-md border-l border-border/60 shadow-2xl"
        style={{
          animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-border/40">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground/80">
              {entityType ? (isNew ? (NEW_PANEL_LABELS[entityType] ?? entityType) : (PANEL_LABELS[entityType] ?? entityType)) : '编辑'}
            </span>
          </div>
          <button
            onClick={close}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 bg-transparent border-none cursor-pointer transition-colors"
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-5 overflow-y-auto" style={{ height: 'calc(100% - 56px)' }}>
          {renderEditor()}
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
