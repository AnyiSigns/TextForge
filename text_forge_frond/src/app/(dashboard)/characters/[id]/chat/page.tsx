'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchCharacterDetail, fetchCharacterMessages, sendChatMessage } from '@/features/characters';
import { useBriefStore, briefToContextLine } from '@/features/projects';
import { useManuscriptStore } from '@/lib/stores/manuscriptStore';
import { loadInspiration, saveInspiration, type InspirationItem } from '@/lib/storage/backup';
import { toast } from 'sonner';
import type { Character, Message } from '@/types';
import { CharacterChatHeader } from './CharacterChatHeader';
import { CharacterChatMessages } from './CharacterChatMessages';
import { CharacterSettingsSheet } from './CharacterSettingsSheet';

export default function CharacterChatPage() {
  const { id: charId } = useParams<{ id: string }>();
  const router = useRouter();

  const [character, setCharacter] = useState<Character | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [bubbleOpacity, setBubbleOpacity] = useState(0.85);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const addChapter = useManuscriptStore((s) => s.addChapter);

  const projectId = character?.projectId ?? null;
  const briefLine = useBriefStore((s) => (projectId ? briefToContextLine(s.briefs[projectId]) : ''));

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(id);
  }, [messages]);

  useEffect(() => {
    Promise.all([
      fetchCharacterDetail(charId),
      fetchCharacterMessages(charId),
    ])
      .then(([char, msgs]) => { setCharacter(char); setMessages(msgs); })
      .catch(e => toast.error('加载失败', { description: e instanceof Error ? e.message : '未知错误' }))
      .finally(() => setIsLoadingData(false));
  }, [charId]);

  const clearConversation = () => {
    if (showClearConfirm) {
      setMessages([]);
      setShowClearConfirm(false);
      toast.success('对话已清空');
      return;
    }
    setShowClearConfirm(true);
    toast('再次点击「清空」确认删除当前对话', { duration: 3000 });
    setTimeout(() => setShowClearConfirm(false), 3000);
  };

  const sendMessage = async () => {
    if (!input.trim() || !character) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input, timestamp: new Date().toISOString() };
    const placeholderId = (Date.now() + 1).toString();
    const placeholder: Message = { id: placeholderId, role: 'assistant', content: '', timestamp: new Date().toISOString() };

    setMessages(prev => [...prev, userMsg, placeholder]);
    const sentInput = input;
    setInput('');
    setIsLoading(true);

    try {
      const history = messages
        .filter((m) => m.id !== placeholderId)
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await sendChatMessage(charId, {
        message: sentInput,
        project_id: projectId ?? undefined,
        brief: briefLine || undefined,
        character_name: name,
        character_description: desc,
        messages: history,
      });
      if (!response.body) throw new Error('响应体为空');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (typeof parsed?.content === 'string') {
              aiContent += parsed.content;
              setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, content: aiContent } : m));
            }
          } catch { /* 忽略非 JSON */ }
        }
      }
    } catch (e) {
      toast.error('发送失败', { description: e instanceof Error ? e.message : '未知错误' });
    } finally {
      setIsLoading(false);
    }
  };

  const convertToChapter = async () => {
    if (!projectId) { toast.error('该角色未关联项目，无法转为章节'); return; }
    const content = messages
      .map((m) => (m.role === 'user' ? '你' : name) + '：' + m.content)
      .join('\n\n');
    if (!content.trim()) { toast.error('当前对话为空'); return; }
    try {
      const chapter = await addChapter(projectId, `${name}的对话记录`);
      await useManuscriptStore.getState().updateChapter(chapter.id, { content });
      toast.success('已转为手稿章节，去手稿继续创作', { action: { label: '前往', onClick: () => router.push(`/manuscript/${projectId}`) } });
    } catch {
      toast.error('转为章节失败');
    }
  };

  const saveAsInspiration = async () => {
    if (!projectId) { toast.error('该角色未关联项目，无法保存灵感'); return; }
    const content = messages
      .map((m) => (m.role === 'user' ? '你' : name) + '：' + m.content)
      .join('\n\n');
    if (!content.trim()) { toast.error('当前对话为空'); return; }
    try {
      const items = await loadInspiration(projectId);
      const item: InspirationItem = {
        id: `insp-${Date.now()}`,
        type: 'text',
        content: `【与${name}的对话】\n${content}`,
        note: `来自角色对话 · ${new Date().toLocaleString('zh-CN')}`,
        createdAt: new Date().toISOString(),
      };
      await saveInspiration(projectId, [item, ...items]);
      toast.success('已保存为项目灵感');
    } catch {
      toast.error('保存灵感失败');
    }
  };

  const exportRecord = () => {
    const content = messages.map(m => (m.role === 'user' ? '你' : name) + ': ' + m.content).join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (name || '对话记录') + '-对话记录.txt';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('对话记录已导出');
  };

  if (isLoadingData) return <div className="flex items-center justify-center h-full">加载中...</div>;
  const name = character?.name ?? '';
  const avatar = character?.avatar ?? '';
  const desc = character?.description ?? '';

  if (!character) return <div className="flex items-center justify-center h-full">角色不存在</div>;

  const filteredMessages = messages.filter(m => !search || m.content.includes(search));

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-4xl mx-auto relative lg:h-[calc(100dvh-120px)]">
      <CharacterChatHeader
        name={name}
        avatar={avatar}
        desc={desc}
        projectId={projectId}
        search={search}
        isLoading={isLoading}
        showClearConfirm={showClearConfirm}
        matchCount={messages.filter(m => m.content.includes(search)).length}
        onSearch={setSearch}
        onClearSearch={() => setSearch('')}
        onConvertToChapter={convertToChapter}
        onSaveAsInspiration={saveAsInspiration}
        onClearConversation={clearConversation}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onExport={exportRecord}
      />

      <div className="flex items-center gap-2 mb-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          气泡透明度
          <input
            type="range"
            min={0.3}
            max={1}
            step={0.05}
            value={bubbleOpacity}
            onChange={(e) => setBubbleOpacity(Number(e.target.value))}
            className="w-24 accent-primary"
          />
        </label>
      </div>

      <CharacterChatMessages
        ref={scrollRef}
        name={name}
        input={input}
        messages={filteredMessages}
        isLoading={isLoading}
        onInput={setInput}
        onSend={sendMessage}
      />

      <CharacterSettingsSheet
        character={character}
        name={name}
        avatar={avatar}
        desc={desc}
        projectId={projectId}
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
      />
    </div>
  );
}
