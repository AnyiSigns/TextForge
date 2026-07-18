'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchCharacterDetail, fetchCharacterMessages, sendChatMessage } from '@/lib/api/characters';
import { ChatMessage } from '@/components/characters/ChatMessage';
import { useBriefStore, briefToContextLine } from '@/lib/stores/briefStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import {
  Send, ArrowLeft, Settings2, Download, Trash2, Search, BookText, Lightbulb, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Character, Message } from '@/types';
import { useManuscriptStore } from '@/lib/stores/manuscriptStore';
import { loadInspiration, saveInspiration, type InspirationItem } from '@/lib/storage/backup';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const addChapter = useManuscriptStore((s) => s.addChapter);

  const projectId = character?.projectId ?? null;
  const briefLine = useBriefStore((s) => (projectId ? briefToContextLine(s.briefs[projectId]) : ''));

  // 新消息进入或流式输出逐字更新后，自动把对话视角滚到最新一条
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

  // 将整段对话转为手稿章节（仅关联了项目的角色可用）
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

  // 将整段对话保存为项目灵感
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

  if (isLoadingData) return <div className="flex items-center justify-center h-full">加载中...</div>;
  const name = character?.name ?? '';
  const avatar = character?.avatar ?? '';
  const desc = character?.description ?? '';

  if (!character) return <div className="flex items-center justify-center h-full">角色不存在</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-4xl mx-auto relative lg:h-[calc(100dvh-120px)]">
      <div className="flex flex-wrap items-center gap-2 sm:gap-4 pb-4 border-b border-border/40">
        <Button variant="ghost" size="sm" onClick={() => router.push('/characters')} className="shrink-0">
          <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" /> <span className="hidden sm:inline">返回</span>
        </Button>
        <Avatar className="w-9 h-9 sm:w-10 sm:h-10 shrink-0">
          <AvatarImage src={avatar} />
          <AvatarFallback>{name.slice(0, 2)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold truncate">{name}</h2>
          <p className="text-xs text-muted-foreground truncate max-w-full sm:max-w-xs">{desc}</p>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 shrink-0 flex-wrap justify-end">
          {projectId && (
            <>
              <Button variant="ghost" size="sm" onClick={convertToChapter} className="text-muted-foreground hover:text-foreground">
                <BookText className="w-4 h-4 mr-2" /> <span className="hidden sm:inline">转为章节</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={saveAsInspiration} className="text-muted-foreground hover:text-foreground">
                <Lightbulb className="w-4 h-4 mr-2" /> <span className="hidden sm:inline">存为灵感</span>
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={clearConversation} className={showClearConfirm ? "text-destructive hover:text-destructive" : "text-muted-foreground hover:text-destructive"}>
            <Trash2 className="w-4 h-4 mr-2" /> <span className="hidden sm:inline">{showClearConfirm ? '确认清空？' : '清空'}</span>
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={() => setIsSettingsOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Settings2 className="w-4 h-4 mr-2" /> <span className="hidden sm:inline">角色设定</span>
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={() => {
              const content = messages.map(m => (m.role === 'user' ? '你' : name) + ': ' + m.content).join('\n\n');
              const blob = new Blob([content], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = (name || '对话记录') + '-对话记录.txt';
              a.click();
              URL.revokeObjectURL(url);
              toast.success('对话记录已导出');
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <Download className="w-4 h-4 mr-2" /> <span className="hidden sm:inline">导出记录</span>
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索对话内容…"
            className="pl-9 pr-8"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="清除搜索"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
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
        {search && (
          <span className="text-xs text-muted-foreground shrink-0">
            {messages.filter(m => m.content.includes(search)).length} 条匹配
          </span>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 rounded-2xl border border-border/40 bg-background/40 overflow-y-auto">
        <div className="space-y-4 px-2 py-4">
          {messages
            .filter(m => !search || m.content.includes(search))
            .map((msg) => {
              const origIndex = messages.indexOf(msg);
              return (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  characterName={name}
                  isLoading={isLoading}
                  prevTimestamp={origIndex > 0 ? messages[origIndex - 1].timestamp : undefined}
                  bubbleOpacity={bubbleOpacity}
                />
              );
            })}
          {isLoading && messages.at(-1)?.role === 'user' && (
            <div className="flex gap-3">
              <Avatar className="w-8 h-8 shrink-0">
                <AvatarFallback className="text-xs">{name.slice(0, 2)}</AvatarFallback>
              </Avatar>
              <div className="bg-muted/60 rounded-2xl px-4 py-3 flex items-center gap-1">
                {[0, 150, 300].map(delay => (
                  <span key={delay} className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-border/40">
        <div className="flex items-center gap-2 relative">
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder={`对 ${name || '角色'} 说点什么...`}
              className="pr-12"
            />
          </div>
          <Button onClick={sendMessage} disabled={!input.trim() || isLoading}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <SheetContent side="right" className="glass-sheet w-full sm:max-w-[20rem] rounded-l-3xl">
            <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/30">
              <SheetTitle className="text-xl tracking-tight">角色设定</SheetTitle>
              <SheetDescription className="text-[13px]">
                该角色的完整设定，对话与生成都将严格遵循
              </SheetDescription>
            </SheetHeader>
            <div className="mt-5 px-5 space-y-5">
              <div className="glass-sheet-card p-5">
                <div className="flex items-center gap-3">
                  <Avatar className="w-16 h-16 rounded-2xl shrink-0">
                    <AvatarImage src={avatar} />
                    <AvatarFallback className="text-xl rounded-2xl">{name.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-lg">{name || "未命名角色"}</p>
                    <p className="text-xs text-muted-foreground">
                      {projectId ? "关联小说项目" : "独立角色"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">角色描述</p>
                <div className="glass-sheet-card p-5">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {desc || "暂无设定"}
                  </p>
                </div>
              </div>

              {(character?.role || character?.status || character?.currentProfile) && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">角色档案</p>
                  <div className="glass-sheet-card p-5 space-y-3">
                    {character?.role && (
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-muted-foreground shrink-0">故事定位</span>
                        <span className="text-right">{character.role}</span>
                      </div>
                    )}
                    {character?.status && (
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-muted-foreground shrink-0">当前状态</span>
                        <span className="text-right">{character.status}</span>
                      </div>
                    )}
                    {character?.currentProfile && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">当前时间点</span>
                        <p className="mt-1 leading-relaxed whitespace-pre-wrap text-foreground/90">{character.currentProfile}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {projectId && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">项目关联</p>
                  <div className="glass-sheet-card p-5">
                    <p className="text-sm text-muted-foreground">
                      该角色已绑定到小说项目，对话时自动注入项目世界观与剧情上下文
                    </p>
                  </div>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}