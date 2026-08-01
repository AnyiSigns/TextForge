// src/features/projects/ui/useOutlinePanel.ts
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import type { OutlineVolume, OutlineChapter, OutlineNode, OutlineNodeStatus } from '@/lib/storage/backupSchema';
import { dispatchInsertStep } from '@/lib/events/projectEvents';
import { useCharacterStore } from '@/features/characters';
import { useCreativeSettingStore } from '@/features/projects';
import { useOutline } from '@/features/projects';
import { toast } from 'sonner';

interface UseOutlinePanelReturn {
  volumes: OutlineVolume[];
  expanded: Record<string, boolean>;
  newVol: string;
  newChap: Record<string, string>;
  newNode: Record<string, string>;
  view: 'tree' | 'graph';
  stats: { total: number; done: number; writing: number };
  isLoading: boolean;
  projChars: { id: number; name: string; description: string; bookId: number | null }[];
  creativeSettingSections: { id: string; title: string }[];
  toggle: (id: string) => void;
  setNewVol: (v: string) => void;
  setNewChap: (v: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  setNewNode: (v: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  setView: (v: 'tree' | 'graph') => void;
  handleAddVolume: () => Promise<void>;
  handleAddChapter: (volId: string) => Promise<void>;
  handleAddNode: (chId: string) => Promise<void>;
  generateThisChapter: (volTitle: string, chap: OutlineVolume['chapters'][number]) => void;
  patchVolume: (id: string, patch: Partial<OutlineVolume>) => void;
  removeVolume: (id: string) => Promise<void>;
  patchChapter: (volId: string, chId: string, patch: Partial<OutlineChapter>) => void;
  removeChapter: (volId: string, chId: string) => Promise<void>;
  patchNode: (volId: string, chId: string, nodeId: string, patch: Partial<OutlineNode>) => void;
  removeNode: (volId: string, chId: string, nodeId: string) => Promise<void>;
  patchChapterNodes: (volId: string, chId: string, patch: Partial<OutlineChapter>) => void;
}

export function useOutlinePanel(bookId: string): UseOutlinePanelReturn {
  const { volumes, reload, addVolume, addChapter, patchVolume, patchChapter, patchNode, patchChapterNodes, removeVolume, removeChapter, removeNode } = useOutline({ bookId: Number(bookId) });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [newVol, setNewVol] = useState('');
  const [newChap, setNewChap] = useState<Record<string, string>>({});
  const [newNode, setNewNode] = useState<Record<string, string>>({});
  const [view, setView] = useState<'tree' | 'graph'>('tree');
  const didHydrate = useRef(false);

  const characters = useCharacterStore((s) => s.characters);
  const creativeSetting = useCreativeSettingStore((s) => s.settings[Number(bookId)]);
  const creativeSettingSections = creativeSetting?.customDimensions ?? [];
  const projChars = useMemo(
    () => characters.filter((c) => (c.bookId ?? null) === Number(bookId)),
    [characters, bookId],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      await reload();
      if (!active) return;
      didHydrate.current = true;
    })();
    return () => { active = false; };
  }, [bookId, reload]);

  useEffect(() => {
    const onSeeded = (e: Event) => {
      const detail = (e as CustomEvent<{ bookId: string }>).detail;
      if (detail?.bookId !== bookId) return;
      void reload();
    };
    window.addEventListener('outline-seeded', onSeeded);
    return () => window.removeEventListener('outline-seeded', onSeeded);
  }, [bookId, reload]);

  const stats = useMemo(() => {
    if (!Array.isArray(volumes)) {
      console.error('[OutlinePanel] volumes is not array', volumes);
    }
    const arr = Array.isArray(volumes) ? volumes : [];
    const chapters = arr.reduce<OutlineVolume['chapters']>((acc, v) => acc.concat(Array.isArray(v.chapters) ? v.chapters : []), []);
    const nodes = chapters.reduce<OutlineNode[]>((acc, c) => acc.concat(Array.isArray(c.nodes) ? c.nodes : []), []);
    return { total: nodes.length, done: nodes.filter((n) => n.status === 'done').length, writing: nodes.filter((n) => n.status === 'writing').length };
  }, [volumes]);

  const toggle = (id: string) => setExpanded((m) => ({ ...m, [id]: !m[id] }));

  const handleAddVolume = async () => {
    if (!newVol.trim()) return;
    await addVolume(newVol.trim());
    setNewVol('');
  };

  const handleAddChapter = async (volId: string) => {
    const title = newChap[volId]?.trim();
    if (!title) return;
    await addChapter(volId, title);
    setNewChap((m) => ({ ...m, [volId]: '' }));
  };

  const handleAddNode = async (chId: string) => {
    const title = newNode[chId]?.trim();
    if (!title) return;
    for (const vol of volumes) {
      const ch = vol.chapters.find((c) => c.id === chId);
      if (ch) {
        await patchChapterNodes(vol.id, chId, { nodes: [...ch.nodes, { id: `nd-${Date.now()}`, title, status: 'writing' }] });
        break;
      }
    }
    setNewNode((m) => ({ ...m, [chId]: '' }));
  };

  const generateThisChapter = (volTitle: string, chap: OutlineVolume['chapters'][number]) => {
    const summary = chap.nodes.map((n) => `- ${n.title}：${n.content || ''}`).join('\n');
    dispatchInsertStep({ bookId: String(bookId), title: `大纲·${volTitle}/${chap.title}`, content: summary });
    toast.success(`已把「${chap.title}」大纲发送到工作台，可在工作台生成此章`);
    for (const vol of volumes) {
      if (vol.id === volumes.find((v) => v.chapters.includes(chap))?.id) {
        for (const node of chap.nodes) {
          patchNode(vol.id, chap.id, node.id, { status: 'writing' });
        }
        break;
      }
    }
  };

  return {
    volumes, expanded, newVol, newChap, newNode, view, stats, isLoading: !didHydrate.current, projChars, creativeSettingSections,
    toggle, setNewVol, setNewChap, setNewNode, setView,
    handleAddVolume, handleAddChapter, handleAddNode, generateThisChapter,
    patchVolume, removeVolume, patchChapter, removeChapter, patchNode, removeNode, patchChapterNodes,
  };
}