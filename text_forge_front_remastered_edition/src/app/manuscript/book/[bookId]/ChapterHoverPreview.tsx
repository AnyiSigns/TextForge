'use client';

import { useEffect } from 'react';
import { useManuscriptStore } from './store';

export function ChapterHoverPreview() {
  const preview = useManuscriptStore((s) => s.hoverPreview);
  const clearHoverPreview = useManuscriptStore((s) => s.clearHoverPreview);

  useEffect(() => {
    if (!preview) return;
    const el = document.elementFromPoint(preview.left + 4, preview.top + 4);
    if (!el) return;
    const onLeave = () => clearHoverPreview();
    el.addEventListener('mouseleave', onLeave);
    return () => el.removeEventListener('mouseleave', onLeave);
  }, [preview, clearHoverPreview]);

  if (!preview) return null;
  return (
    <div
      className="fixed z-50 w-64 max-h-48 overflow-y-auto rounded-lg border border-border bg-background shadow-lg p-3 text-xs leading-relaxed"
      style={{ top: preview.top, left: preview.left }}
    >
      <p className="font-medium text-foreground mb-1 truncate">{preview.title}</p>
      <p className="text-muted-foreground whitespace-pre-wrap line-clamp-5">
        {preview.content?.slice(0, 300) || '（暂无内容）'}
      </p>
    </div>
  );
}
