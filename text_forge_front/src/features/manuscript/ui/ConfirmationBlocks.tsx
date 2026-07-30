// src/features/manuscript/ui/ConfirmationBlocks.tsx
'use client';

import { AntiMistakeBlock } from '@/features/projects/ui/AntiMistakeBlock';
import { Trash2 } from 'lucide-react';
import type { ManuscriptChapter } from '@/types';

interface ConfirmationBlocksProps {
  chapters: ManuscriptChapter[];
  bookName: string;
  clearBlocked: boolean;
  setClearBlocked: (v: boolean) => void;
  deleteBlocked: boolean;
  setDeleteBlocked: (v: boolean) => void;
  pendingDeleteId: number | null;
  setPendingDeleteId: (id: number | null) => void;
  clearProject: (bookId: number) => Promise<void>;
  removeChapter: (id: number) => void;
  activeId: number | null;
  setActiveId: (id: number | null) => void;
  projectId: string;
}

export function ConfirmationBlocks({
  chapters, bookName, clearBlocked, setClearBlocked, deleteBlocked, setDeleteBlocked,
  pendingDeleteId, setPendingDeleteId, clearProject, removeChapter, activeId, setActiveId, projectId,
}: ConfirmationBlocksProps) {
  return (
    <>
      {chapters.length > 0 && (
        <AntiMistakeBlock
          blocked={clearBlocked}
          message={`将删除《${bookName}》下的全部 ${chapters.length} 个章节（不可恢复）。此操作仅清除本地手稿，不影响工作台步骤。`}
          onForce={() => { void clearProject(Number(projectId)).then(() => { setActiveId(null); setClearBlocked(false); }); }}
          onCancel={() => setClearBlocked(false)}
          defaultLabel={<Trash2 className="w-3.5 h-3.5" />}
          onDefault={() => setClearBlocked(true)}
        />
      )}
      {pendingDeleteId !== null && (
        <AntiMistakeBlock
          blocked={deleteBlocked}
          message={`将删除《${chapters.find((c) => c.id === pendingDeleteId)?.title ?? ''}》，此操作不可恢复。`}
          onForce={() => {
            const id = pendingDeleteId!;
            removeChapter(id);
            if (activeId === id) {
              const rest = chapters.filter((x) => x.id !== id);
              setActiveId(rest[0]?.id ?? null);
            }
            setPendingDeleteId(null);
            setDeleteBlocked(false);
          }}
          onCancel={() => { setPendingDeleteId(null); setDeleteBlocked(false); }}
          defaultLabel={<Trash2 className="w-3.5 h-3.5" />}
          onDefault={() => setDeleteBlocked(true)}
        />
      )}
    </>
  );
}
