// src/features/projects/hooks/useOutline.ts
// 统一大纲数据加载/保存，并承担「卷章 -> 大纲占位」的单向同步。
import { useState, useEffect, useRef, useCallback } from 'react';
import { listOutlines, createOutline, updateOutline } from '@/features/projects';
import { loadOutline, saveOutline } from '@/lib/storage/backup';
import type { OutlineVolume, OutlineChapter, OutlineNode } from '@/lib/storage/backupSchema';
import { toast } from 'sonner';

interface UseOutlineOptions {
  bookId: number;
  autoSync?: boolean;
}

interface UseOutlineReturn {
  volumes: OutlineVolume[];
  loaded: boolean;
  saving: boolean;
  reload: () => Promise<void>;
  save: (next: OutlineVolume[]) => Promise<void>;
  syncVolumesToOutline: (volumes: { id: string | number; title: string; chapters: { id: string | number; title: string }[] }[]) => Promise<void>;
  addVolume: (title: string) => Promise<void>;
  addChapter: (volumeId: string, title: string) => Promise<void>;
  patchVolume: (id: string, patch: Partial<OutlineVolume>) => void;
  patchChapter: (volumeId: string, chapterId: string, patch: Partial<OutlineChapter>) => void;
  patchNode: (volumeId: string, chapterId: string, nodeId: string, patch: Partial<OutlineNode>) => void;
  patchChapterNodes: (volumeId: string, chapterId: string, patch: Partial<OutlineChapter>) => void;
  removeVolume: (id: string) => Promise<void>;
  removeChapter: (volumeId: string, chapterId: string) => Promise<void>;
  removeNode: (volumeId: string, chapterId: string, nodeId: string) => Promise<void>;
}

const outlineIdCache: Record<number, number> = {};

export function useOutline({ bookId, autoSync = true }: UseOutlineOptions): UseOutlineReturn {
  const [volumes, setVolumes] = useState<OutlineVolume[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const didHydrate = useRef(false);

  const resolveOutlineId = useCallback(async (): Promise<number | null> => {
    if (outlineIdCache[bookId]) return outlineIdCache[bookId];
    try {
      const items = await listOutlines(bookId);
      if (items.length > 0) {
        outlineIdCache[bookId] = items[0].id;
        return items[0].id;
      }
    } catch { /* 后端未就绪 */ }
    return null;
  }, [bookId]);

  const load = useCallback(async () => {
    setLoaded(false);
    try {
      const items = await listOutlines(bookId);
      if (items.length > 0 && Array.isArray(items[0].data)) {
        setVolumes(items[0].data);
        outlineIdCache[bookId] = items[0].id;
      } else {
        const local = await loadOutline(String(bookId));
        setVolumes((prev) => (prev.length ? prev : local));
      }
    } catch {
      const local = await loadOutline(String(bookId));
      setVolumes((prev) => (prev.length ? prev : local));
    } finally {
      didHydrate.current = true;
      setLoaded(true);
    }
  }, [bookId]);

  const save = useCallback(async (next: OutlineVolume[]) => {
    setSaving(true);
    try {
      await saveOutline(String(bookId), next);
      const existingId = await resolveOutlineId();
      if (existingId) {
        await updateOutline(bookId, existingId, next);
      } else {
        const created = await createOutline(bookId, next);
        if (created?.id) outlineIdCache[bookId] = created.id;
      }
    } catch {
      toast.error('大纲保存失败');
    } finally {
      setSaving(false);
    }
  }, [bookId, resolveOutlineId]);

  useEffect(() => {
    if (!autoSync) return;
    if (!loaded || !didHydrate.current) return;
    const timer = setTimeout(() => {
      void save(volumes);
    }, 800);
    return () => clearTimeout(timer);
  }, [loaded, volumes, bookId, save, autoSync]);

  const syncVolumesToOutline = useCallback(async (sourceVolumes: { id: string | number; title: string; chapters: { id: string | number; title: string }[] }[]) => {
    setVolumes((prev) => {
      const outlineById = new Map<string, OutlineVolume>();
      const outlineByTitle = new Map<string, OutlineVolume>();
      for (const v of prev) {
        outlineById.set(String(v.id), v);
        outlineByTitle.set(v.title, v);
      }
      const next: OutlineVolume[] = [];
      for (const sv of sourceVolumes) {
        const key = String(sv.id);
        let outlineVol = outlineById.get(key) || outlineByTitle.get(sv.title);
        if (!outlineVol) {
          outlineVol = { id: key, title: sv.title, chapters: [] };
        }
        const chapterById = new Map<string, OutlineChapter>();
        const chapterByTitle = new Map<string, OutlineChapter>();
        for (const ch of outlineVol.chapters) {
          chapterById.set(String(ch.id), ch);
          chapterByTitle.set(ch.title, ch);
        }
        const chapters: OutlineChapter[] = [];
        for (const sc of sv.chapters) {
          const chKey = String(sc.id);
          let outlineCh = chapterById.get(chKey) || chapterByTitle.get(sc.title);
          if (!outlineCh) {
            outlineCh = { id: chKey, title: sc.title, nodes: [] };
          }
          chapters.push(outlineCh);
        }
        outlineVol = { ...outlineVol, chapters };
        next.push(outlineVol);
      }
      return next;
    });
  }, []);

  const addVolume = useCallback(async (title: string) => {
    const vol: OutlineVolume = { id: `vol-${Date.now()}`, title, chapters: [] };
    setVolumes((v) => [...v, vol]);
  }, []);

  const addChapter = useCallback(async (volumeId: string, title: string) => {
    setVolumes((vs) => vs.map((v) => (v.id === volumeId ? { ...v, chapters: [...v.chapters, { id: `ch-${Date.now()}`, title, nodes: [] }] } : v)));
  }, []);

  const patchVolume = useCallback((id: string, patch: Partial<OutlineVolume>) => {
    setVolumes((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }, []);

  const patchChapter = useCallback((volumeId: string, chapterId: string, patch: Partial<OutlineChapter>) => {
    setVolumes((vs) => vs.map((v) => (v.id !== volumeId ? v : { ...v, chapters: v.chapters.map((c) => (c.id === chapterId ? { ...c, ...patch } : c)) })));
  }, []);

  const patchNode = useCallback((volumeId: string, chapterId: string, nodeIdOrPatch: string | Partial<OutlineNode>, patch?: Partial<OutlineNode>) => {
    if (typeof nodeIdOrPatch === 'string' && patch) {
      setVolumes((vs) => vs.map((v) => (v.id !== volumeId ? v : {
        ...v,
        chapters: v.chapters.map((c) => (c.id !== chapterId ? c : {
          ...c,
          nodes: c.nodes.map((n) => (n.id === nodeIdOrPatch ? { ...n, ...patch } : n)),
        })),
      })));
    } else if (typeof nodeIdOrPatch === 'object' && nodeIdOrPatch !== null) {
      setVolumes((vs) => vs.map((v) => (v.id !== volumeId ? v : {
        ...v,
        chapters: v.chapters.map((c) => (c.id !== chapterId ? { ...c, ...nodeIdOrPatch } : c)),
      })));
    }
  }, []);

  const patchChapterNodes = useCallback((volumeId: string, chapterId: string, patch: Partial<OutlineChapter>) => {
    setVolumes((vs) => vs.map((v) => (v.id !== volumeId ? v : {
      ...v,
      chapters: v.chapters.map((c) => (c.id !== chapterId ? c : { ...c, ...patch })),
    })));
  }, []);

  const removeVolume = useCallback(async (id: string) => {
    setVolumes((vs) => vs.filter((v) => v.id !== id));
  }, []);

  const removeChapter = useCallback(async (volumeId: string, chapterId: string) => {
    setVolumes((vs) => vs.map((v) => (v.id !== volumeId ? v : { ...v, chapters: v.chapters.filter((c) => c.id !== chapterId) })));
  }, []);

  const removeNode = useCallback(async (volumeId: string, chapterId: string, nodeId: string) => {
    setVolumes((vs) => vs.map((v) => (v.id !== volumeId ? v : {
      ...v,
      chapters: v.chapters.map((c) => (c.id !== chapterId ? c : {
        ...c,
        nodes: c.nodes.filter((n) => n.id !== nodeId),
      })),
    })));
  }, []);

  return {
    volumes,
    loaded,
    saving,
    reload: load,
    save,
    syncVolumesToOutline,
    addVolume,
    addChapter,
    patchVolume,
    patchChapter,
    patchNode,
    patchChapterNodes,
    removeVolume,
    removeChapter,
    removeNode,
  };
}
