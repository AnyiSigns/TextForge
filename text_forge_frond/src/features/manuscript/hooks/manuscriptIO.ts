// src/lib/hooks/manuscriptIO.ts
// 手稿编辑器「导入/导出/同步」动作：书籍 txt 导入、导出、发送到工作台。纯逻辑，依赖注入。
import { toast } from 'sonner';
import { importManuscriptToProject, importBookToProject } from '@/features/projects';
import { exportManuscriptBook } from '@/lib/storage/backup';
import { parseBookText } from '@/lib/utils/bookImport';
import { useManuscriptStore } from '../stores/manuscriptStore';
import { useProjectStore } from '@/features/projects';
import type { ManuscriptChapter } from '@/types';

export interface ManuscriptIO {
  id: string;
  activeId: string | null;
  active: ManuscriptChapter | null;
  bookChapters: { title: string; content: string }[] | null;
  setBookName: (v: string) => void;
  setBookChapters: React.Dispatch<React.SetStateAction<{ title: string; content: string }[] | null>>;
  setAskBookTxt: (v: boolean) => void;
  setExportOpen: (v: boolean) => void;
  setSendOpen: (v: boolean) => void;
}

export function makeManuscriptIO(d: ManuscriptIO) {
  const { id: projectId, active, bookChapters, setBookName, setBookChapters, setAskBookTxt, setExportOpen, setSendOpen } = d;

  const openSend = () => { if (active) setSendOpen(true); };
  const confirmSend = async (syncGlobal: boolean) => {
    if (!active) return;
    if (syncGlobal) {
      const step = await importManuscriptToProject(projectId, active.title, active.content);
      const draft = (await useProjectStore.getState().getDraft(projectId)) ?? [];
      await useProjectStore.getState().saveDraft(projectId, [...draft, step]);
      toast.success('已同步到工作台（作为项目步骤，可被 Agent 流读取为前文）');
    } else {
      toast.success('已留在手稿本地（未同步到工作台）');
    }
    setSendOpen(false);
  };

  const onPickBook = async (file: File) => {
    const text = await file.text();
    const parsed = parseBookText(text);
    setBookName(file.name.replace(/\.txt$/i, ''));
    setBookChapters(parsed);
  };
  const confirmBookImport = async (syncGlobal: boolean) => {
    if (!bookChapters) return;
    if (syncGlobal) {
      const steps = await importBookToProject(projectId, bookChapters);
      const draft = (await useProjectStore.getState().getDraft(projectId)) ?? [];
      await useProjectStore.getState().saveDraft(projectId, [...draft, ...steps]);
      toast.success(`已导入 ${steps.length} 章到工作台（Agent 续写将以此为前文）`);
    } else {
      for (const c of bookChapters) {
        await useManuscriptStore.getState().importFromStep(projectId, c.title, c.content);
      }
      toast.success(`已导入 ${bookChapters.length} 章到手稿（本地续写）`);
    }
    setBookChapters(null);
  };

  const handleExportBook = (fmt: 'markdown' | 'txt') => {
    if (fmt === 'markdown') {
      exportManuscriptBook(projectId, 'markdown').then(() => setExportOpen(false));
      return;
    }
    setAskBookTxt(true);
  };
  const doExportBookTxt = (mode: 'tidy' | 'format') => {
    exportManuscriptBook(projectId, 'txt', mode)
      .then(() => { setAskBookTxt(false); setExportOpen(false); });
  };

  return { openSend, confirmSend, onPickBook, confirmBookImport, handleExportBook, doExportBookTxt };
}
