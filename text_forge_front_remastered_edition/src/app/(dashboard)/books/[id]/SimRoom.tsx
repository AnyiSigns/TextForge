'use client';

import { useState } from 'react';
import { X, Send, User } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

interface SimMessage {
  id: number;
  characterId: number;
  characterName: string;
  content: string;
  isUser: boolean;
}

interface SimRoomProps {
  characterNames?: string[];
  onClose: () => void;
}

const MOCK_CONVERSATIONS: Record<string, SimMessage[]> = {
  'tavern': [
    { id: 1, characterId: 1, characterName: '林星辰', content: '听说了吗？星辰学府今年的入学试炼比往年都难。', isUser: false },
    { id: 2, characterId: 5, characterName: '铁心', content: '哼，再难我也要考进去！为了给落日镇的乡亲们争光。', isUser: false },
    { id: 3, characterId: 2, characterName: '苏月', content: '你们也别太紧张，听说今年的试炼重点考察的是对星辰之力的感知，不是战斗。', isUser: false },
    { id: 4, characterId: 1, characterName: '林星辰', content: '苏月说得对。我听北辰师父提过，真正的星辰使者不在于力量的强弱，而在于与星辰的共鸣。', isUser: false },
    { id: 5, characterId: 5, characterName: '铁心', content: '那好吧，我先去修炼了。明天天亮在城门口集合？', isUser: false },
  ],
  'warRoom': [
    { id: 1, characterId: 7, characterName: '云城主', content: '诸位，暗影组织的势力正在向云中城逼近。我们需要一个计划。', isUser: false },
    { id: 2, characterId: 3, characterName: '北辰', content: '城主，我建议先疏散城外百姓。星辰军可以布防在东门和南门。', isUser: false },
    { id: 3, characterId: 1, characterName: '林星辰', content: '师父，让我去守东门吧。我的星辰之力已经能凝聚成护盾了。', isUser: false },
    { id: 4, characterId: 6, characterName: '紫烟', content: '我在星门遗迹发现了一些线索。暗影组织似乎在寻找某种能封印星辰之力的装置。', isUser: false },
    { id: 5, characterId: 7, characterName: '云城主', content: '那我们必须比他们更早找到。北辰先生，你带星辰和紫烟去调查遗迹。铁心留守城防。', isUser: false },
  ],
};

export function SimRoom({ characterNames, onClose }: SimRoomProps) {
  const [selectedScene, setSelectedScene] = useState<string>('tavern');
  const [messages, setMessages] = useState<SimMessage[]>(MOCK_CONVERSATIONS.tavern);
  const [inputValue, setInputValue] = useState('');
  const [simOverlay, setSimOverlay] = useState(false);

  const handleSelectScene = (scene: string) => {
    setSelectedScene(scene);
    setMessages(MOCK_CONVERSATIONS[scene] ?? []);
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;
    const newMsg: SimMessage = {
      id: Date.now(),
      characterId: 0,
      characterName: '你',
      content: inputValue.trim(),
      isUser: true,
    };
    setMessages([...messages, newMsg]);
    setInputValue('');

    // Mock 自动回复
    setTimeout(() => {
      const autoReply: SimMessage = {
        id: Date.now() + 1,
        characterId: 1,
        characterName: '系统',
        content: '（该角色正在思考如何回复...）',
        isUser: false,
      };
      setMessages((prev) => [...prev, autoReply]);
    }, 1000);
  };

  if (simOverlay) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-foreground/[0.04] backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-[480px] max-h-[600px] bg-card/98 backdrop-blur-md border border-border/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ animation: 'modal-in 0.25s ease-out' }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 h-12 border-b border-border/40 flex-shrink-0">
          <div className="flex items-center gap-2">
            <User size={15} strokeWidth={1.5} className="text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground/80">Sim Room</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 bg-transparent border-none cursor-pointer"
          >
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>

        {/* 场景选择 */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border/20 flex-shrink-0">
          <span className="text-[10px] text-muted-foreground/50 mr-2">场景：</span>
          {[
            { key: 'tavern', label: '客栈闲聊' },
            { key: 'warRoom', label: '战前会议' },
          ].map((scene) => (
            <button
              key={scene.key}
              onClick={() => handleSelectScene(scene.key)}
              className={cn(
                'px-3 py-1 rounded-full text-[11px] bg-transparent border cursor-pointer transition-colors',
                selectedScene === scene.key
                  ? 'border-foreground/30 bg-foreground/[0.04] text-foreground/80'
                  : 'border-border/40 text-muted-foreground/60 hover:text-foreground/70',
              )}
            >
              {scene.label}
            </button>
          ))}
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[300px]">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex gap-2',
                msg.isUser ? 'justify-end' : 'justify-start',
              )}
            >
              {!msg.isUser && (
                <div className="w-7 h-7 rounded-full bg-muted/60 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {msg.characterName.slice(0, 2)}
                  </span>
                </div>
              )}
              <div
                className={cn(
                  'max-w-[75%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed',
                  msg.isUser
                    ? 'bg-foreground/[0.08] text-foreground/80 rounded-br-md'
                    : 'bg-muted/40 text-foreground/70 rounded-bl-md',
                )}
              >
                {!msg.isUser && (
                  <span className="text-[10px] font-medium text-foreground/50 block mb-0.5">
                    {msg.characterName}
                  </span>
                )}
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        {/* 输入框 */}
        <div className="px-4 py-3 border-t border-border/30 flex-shrink-0 flex items-center gap-2">
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
            placeholder="输入发言..."
            className="flex-1 h-8 px-3 rounded-xl text-xs bg-background border border-border focus:outline-none focus:border-foreground/20"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-30"
          >
            <Send size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
