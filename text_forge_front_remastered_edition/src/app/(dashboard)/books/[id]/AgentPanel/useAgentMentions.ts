'use client';

/**
 * Agent 面板：@角色/#设定 提及输入逻辑（从 AgentPanel.tsx 抽离）。
 * 数据源加载、触发词检测、建议浮层导航、应用与键盘处理。
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface AgentMention {
  kind: 'character' | 'setting';
  query: string;
  index: number;
  items: Array<{ label: string }>;
}

interface UseAgentMentionsOptions {
  bookId: number;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  setInput: (v: string) => void;
}

export function useAgentMentions({ bookId, inputRef, setInput }: UseAgentMentionsOptions) {
  const [mention, setMention] = useState<AgentMention | null>(null);
  const [mentionCharacters, setMentionCharacters] = useState<Array<{ name: string }>>([]);
  const [mentionSettings, setMentionSettings] = useState<Array<{ name: string }>>([]);
  const mentionStartRef = useRef(0);

  // 提及输入数据源——角色名 + 设定关键词（文风/世界观/禁忌/自定义维度键）
  useEffect(() => {
    let alive = true;
    if (!bookId) return;
    Promise.all([
      import('@/shared/api/characters').then(({ fetchCharacters }) => fetchCharacters(bookId)),
      import('@/shared/api/books').then(({ fetchCreativeSetting }) => fetchCreativeSetting(bookId)),
    ]).then(([chars, setting]) => {
      if (!alive) return;
      const names = (chars || []).map((c) => ({ name: c.name })).filter((x) => x.name);
      const dims = setting?.customDimensions || {};
      const keys = Object.keys(dims).filter(Boolean).map((k) => ({ name: k }));
      const extras: Array<{ name: string }> = [];
      if (setting?.tone) extras.push({ name: setting.tone.slice(0, 20) });
      if (setting?.worldview) extras.push({ name: setting.worldview.slice(0, 20) });
      if (setting?.writingTaboos) extras.push({ name: setting.writingTaboos.slice(0, 20) });
      setMentionCharacters(names);
      setMentionSettings([...keys, ...extras]);
    }).catch(() => { /* 数据加载失败则提及功能静默降级 */ });
    return () => { alive = false; };
  }, [bookId]);

  /** 输入变化时检测 @角色/#设定 触发词（光标位置决定触发词起点）。 */
  const detectMention = useCallback(
    (value: string, pos: number) => {
      const before = value.slice(0, pos);
      const at = before.match(/@([\u4e00-\u9fa5\w]*)$/);
      const hash = before.match(/#([\u4e00-\u9fa5\w]*)$/);
      if (at) {
        const query = at[1];
        const items = mentionCharacters
          .filter((c) => !query || c.name.includes(query))
          .map((c) => ({ label: c.name }));
        if (items.length) {
          mentionStartRef.current = pos - at[0].length;
          setMention({ kind: 'character', query, index: 0, items });
          return;
        }
      } else if (hash) {
        const query = hash[1];
        const items = mentionSettings
          .filter((c) => !query || c.name.includes(query))
          .map((c) => ({ label: c.name }));
        if (items.length) {
          mentionStartRef.current = pos - hash[0].length;
          setMention({ kind: 'setting', query, index: 0, items });
          return;
        }
      }
      setMention(null);
    },
    [mentionCharacters, mentionSettings],
  );

  /** 应用选中的提及：替换触发词为 @角色名/#设定关键词 并恢复光标。 */
  const applyMention = useCallback(
    (item: { label: string }) => {
      if (!mention || !inputRef.current) return;
      const el = inputRef.current;
      const value = el.value;
      const pos = el.selectionStart ?? value.length;
      const trigger = mention.kind === 'character' ? '@' : '#';
      const replaced = value.slice(0, mentionStartRef.current) + `${trigger}${item.label} ` + value.slice(pos);
      setInput(replaced);
      setMention(null);
      requestAnimationFrame(() => {
        el.focus();
        const caret = mentionStartRef.current + trigger.length + item.label.length + 1;
        el.setSelectionRange(caret, caret);
      });
    },
    [mention, inputRef, setInput],
  );

  /** 键盘导航：上下移动、Enter/Tab 应用、Esc 关闭；无浮层时 Enter 提交（onSend）。 */
  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>, onSend: () => void) => {
      if (!mention || !mention.items.length) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        // N13：导航 index 限制在展示范围（slice(0,6)），仅 min(index,5) 不够——
        // ArrowUp 从 0 回绕到 items.length-1（>5）仍不可见，模数双向统一取 min(len,6)
        setMention((m) => (m ? { ...m, index: (m.index + 1) % Math.min(m.items.length, 6) } : m));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMention((m) => {
          if (!m) return m;
          const n = Math.min(m.items.length, 6);
          return { ...m, index: (m.index - 1 + n) % n };
        });
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applyMention(mention.items[mention.index]);
      } else if (e.key === 'Escape') {
        setMention(null);
      }
      // shift+Enter 换行：不阻止默认行为
    },
    [mention, applyMention],
  );

  return {
    mention,
    setMention,
    detectMention,
    applyMention,
    handleInputKeyDown,
  };
}
