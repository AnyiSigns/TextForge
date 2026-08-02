'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { X, ArrowRight, Wand2, Send, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/cn';
import { useBookDetailStore } from '../store';
import * as cardsApi from '@/shared/api/cards';
import * as contentsApi from '@/shared/api/contents';

interface CardDrawRoomProps {
  onClose: () => void;
  preset?: { characters?: string[]; locations?: string[]; storyDirection?: string } | null;
}

export function CardDrawRoom({ onClose, preset }: CardDrawRoomProps) {
  const characters = useBookDetailStore((s) => s.characters);
  const locations = useBookDetailStore((s) => s.locations);
  const chapters = useBookDetailStore((s) => s.chapters);
  const books = useBookDetailStore((s) => s.book);
  const selectedChapterId = useBookDetailStore((s) => s.selectedChapterId);

  const allChapters = useMemo(
    () => chapters.flatMap((v) => v.chapters.map((ch) => ({ ...ch, volumeTitle: v.title }))),
    [chapters],
  );

  const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<number[]>([]);
  const [selectedOutlineNode, setSelectedOutlineNode] = useState('');
  const [storyDirection, setStoryDirection] = useState('');
  const [extraRequirements, setExtraRequirements] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [result, setResult] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const hasAutoStarted = useRef(false);
  const selectedCharactersRef = useRef<number[]>([]);
  const storyDirectionRef = useRef('');

  useEffect(() => { selectedCharactersRef.current = selectedCharacters; }, [selectedCharacters]);
  useEffect(() => { storyDirectionRef.current = storyDirection; }, [storyDirection]);

  useEffect(() => {
    if (preset && !hasAutoStarted.current) {
      if (preset.storyDirection) setStoryDirection(preset.storyDirection);
      let matchedIds: number[] = [];
      if (preset.characters && preset.characters.length > 0) {
        matchedIds = characters
          .filter((c) => preset.characters!.some((name) => c.name.includes(name) || name.includes(c.name)))
          .map((c) => c.id);
        setSelectedCharacters(matchedIds);
      }
      if (preset.locations && preset.locations.length > 0) {
        const locIds = locations
          .filter((l) => preset.locations!.some((name) => l.name.includes(name) || name.includes(l.name)))
          .map((l) => l.id);
        setSelectedLocations(locIds);
      }
      if (matchedIds.length > 0 || preset.storyDirection) {
        hasAutoStarted.current = true;
        setTimeout(() => handleStart(), 300);
      }
    }
  }, [preset, characters, locations]);

  const toggleCharacter = (id: number) => {
    setSelectedCharacters((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const toggleLocation = (id: number) => {
    setSelectedLocations((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id],
    );
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const handleStart = async () => {
    const chars = selectedCharactersRef.current;
    const direction = storyDirectionRef.current;
    if (chars.length === 0 || !books?.id) return;
    setStreaming(true);
    setResult('');
    try {
      const session = await cardsApi.openCardSession({
        book_id: books.id,
        card_type: 'story',
        title: '抽卡创作',
      });
      const ws = cardsApi.createCardWebSocket(session.cardId, '');
      wsRef.current = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'simulate_dialogue',
          characters: characters.filter((c) => chars.includes(c.id)).map((c) => c.name),
          setting: direction || '自由对话',
        }));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'dialogue_result' || msg.type === 'dialogue_stream_token') {
          setResult((prev) => prev + (msg.content || msg.token || ''));
        } else if (msg.type === 'dialogue_done') {
          setStreaming(false);
        } else if (msg.type === 'error') {
          toast.error(msg.message || '对话失败');
          setStreaming(false);
        }
      };
      ws.onclose = () => setStreaming(false);
    } catch { toast.error('创建卡片会话失败'); setStreaming(false); }
  };

  const handleWriteToChapter = async () => {
    if (!result.trim() || !selectedChapterId) {
      toast.error('请先生成内容并选择章节');
      return;
    }
    try {
      await contentsApi.saveContent(selectedChapterId, result);
      toast.success('已写入章节');
      setResult('');
    } catch { toast.error('写入章节失败'); }
  };

  const handleSendToAgent = () => {
    if (!result.trim()) {
      toast.error('请先生成内容');
      return;
    }
    window.dispatchEvent(new CustomEvent('textforge:card-draw-start', {
      detail: {
        characters: characters.filter((c) => selectedCharacters.includes(c.id)).map((c) => ({ name: c.name, roleType: c.roleType, description: c.description })),
        locations: locations.filter((l) => selectedLocations.includes(l.id)).map((l) => ({ name: l.name, type: l.type })),
        storyDirection,
        extraRequirements,
      },
    }));
    toast.success('已发送到 AI 助手');
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wand2 size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold">抽卡创作</h2>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer">
          <X size={16} />
        </button>
      </div>

      <div className="text-[11px] text-muted-foreground mb-4">
        选择创作要素，AI 将基于你的选择模拟剧情展开
      </div>

      <div className="space-y-4 overflow-y-auto flex-1 pr-1">
        <div className="p-3 rounded-lg border border-border bg-card">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">角色选择</div>
          <div className="flex flex-wrap gap-1.5">
            {characters.map((ch) => (
              <button
                key={ch.id}
                onClick={() => toggleCharacter(ch.id)}
                className={cn(
                  'text-[12px] px-2 py-1 rounded-full border bg-transparent cursor-pointer transition-colors',
                  selectedCharacters.includes(ch.id)
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border hover:border-foreground/30',
                )}
              >
                {ch.name}
              </button>
            ))}
            {characters.length === 0 && <span className="text-xs text-muted-foreground">暂无可选角色</span>}
          </div>
        </div>

        <div className="p-3 rounded-lg border border-border bg-card">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">地点选择</div>
          <div className="flex flex-wrap gap-1.5">
            {locations.map((l) => (
              <button
                key={l.id}
                onClick={() => toggleLocation(l.id)}
                className={cn(
                  'text-[12px] px-2 py-1 rounded-full border bg-transparent cursor-pointer transition-colors',
                  selectedLocations.includes(l.id)
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border hover:border-foreground/30',
                )}
              >
                {l.name}
              </button>
            ))}
            {locations.length === 0 && <span className="text-xs text-muted-foreground">暂无可选地点</span>}
          </div>
        </div>

        <div className="p-3 rounded-lg border border-border bg-card">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">故事方向</div>
          <input
            type="text"
            value={storyDirection}
            onChange={(e) => setStoryDirection(e.target.value)}
            placeholder="例：复仇、成长、探索、悬疑..."
            className="w-full h-8 px-2 rounded-md text-xs bg-background border border-border focus:outline-none"
          />
        </div>

        {result && (
          <div className="p-3 rounded-lg border border-border bg-card">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">生成结果</div>
            <div className="text-sm whitespace-pre-wrap">{result}</div>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-border space-y-2">
        <button
          onClick={handleStart}
          disabled={selectedCharacters.length === 0 || streaming}
          className="w-full h-9 rounded-md bg-foreground text-background text-sm font-medium border-none cursor-pointer hover:opacity-90 disabled:opacity-30 flex items-center justify-center gap-2"
        >
          <Wand2 size={14} /> {streaming ? '生成中...' : '开始抽卡'} <ArrowRight size={14} />
        </button>
        {result && (
          <div className="flex gap-2">
            <button
              onClick={handleWriteToChapter}
              disabled={!selectedChapterId}
              className="flex-1 h-8 rounded-md border border-border text-xs font-medium cursor-pointer hover:bg-[var(--sidebar-hover)] disabled:opacity-30 flex items-center justify-center gap-1 bg-transparent"
            >
              <FileText size={12} /> 写入章节
            </button>
            <button
              onClick={handleSendToAgent}
              className="flex-1 h-8 rounded-md border border-border text-xs font-medium cursor-pointer hover:bg-[var(--sidebar-hover)] flex items-center justify-center gap-1 bg-transparent"
            >
              <Send size={12} /> 发送到 AI 助手
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
