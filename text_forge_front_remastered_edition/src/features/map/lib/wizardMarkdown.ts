// 初始化向导 Step 3-6 的 Markdown 方案解析器。
// 统一格式：
// - Step 3 情节线：# 线 / ## 线 + 「类型：」字段行
// - Step 4 大纲：# 卷 / ## 章 / ### 场景 + 「时间/角色/情节线：」字段行
// - Step 5 事件：## 事件 + 「章节/时间/地点/角色/情节线：」字段行
// - Step 6 伏笔：# 伏笔 + 「类型/角色/埋下事件/揭示建议：」字段行

export function splitTitleSummary(text: string): { title: string; summary: string } {
  const idx = text.indexOf(' - ');
  if (idx === -1) return { title: text.trim(), summary: '' };
  return { title: text.slice(0, idx).trim(), summary: text.slice(idx + 3).trim() };
}

export function splitNames(text: string | undefined | null): string[] {
  return (text || '').split(/[、,，]/).map((s) => s.trim()).filter(Boolean);
}

const FIELD_RE = /^(\S+?)[:：]\s*(.*)$/;

/* ── Step 3：情节线 ── */

export interface ParsedPlotThread {
  name: string;
  type: string;
  description: string;
  parentName?: string;
  level: number;
}

export function parsePlotThreads(markdown: string): ParsedPlotThread[] {
  const threads: ParsedPlotThread[] = [];
  let lastLevel1: string | undefined;
  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    const hm = line.match(/^(\#{1,6})\s*线[:：]\s*(.+)$/);
    if (hm) {
      const level = hm[1].length;
      const { title, summary } = splitTitleSummary(hm[2]);
      threads.push({
        name: title,
        type: '',
        description: summary,
        level,
        parentName: level === 2 ? lastLevel1 : undefined,
      });
      if (level === 1) lastLevel1 = title;
      continue;
    }
    const fm = line.match(FIELD_RE);
    if (fm && threads.length > 0 && fm[1] === '类型') {
      threads[threads.length - 1].type = fm[2].trim();
    }
  }
  return threads;
}

/* ── Step 4：大纲 ── */

export interface ParsedOutlineScene {
  title: string;
  summary: string;
  timeLabel: string;
  location: string;
  characters: string[];
  plotThreads: string[];
}

export interface ParsedOutlineChapter {
  title: string;
  summary: string;
  scenes: ParsedOutlineScene[];
}

export interface ParsedOutlineVolume {
  title: string;
  summary: string;
  chapters: ParsedOutlineChapter[];
}

export function parseOutline(markdown: string): ParsedOutlineVolume[] {
  const volumes: ParsedOutlineVolume[] = [];
  let curVol: ParsedOutlineVolume | undefined;
  let curCh: ParsedOutlineChapter | undefined;
  let curScene: ParsedOutlineScene | undefined;

  const flushScene = () => {
    if (curScene) {
      curCh!.scenes.push(curScene);
      curScene = undefined;
    }
  };
  const flushCh = () => {
    if (curCh) {
      flushScene();
      curVol!.chapters.push(curCh);
      curCh = undefined;
    }
  };
  const flushVol = () => {
    if (curVol) {
      flushCh();
      volumes.push(curVol);
      curVol = undefined;
    }
  };

  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    const vm = line.match(/^#\s*卷.+?[:：]\s*(.+)$/);
    if (vm) {
      flushVol();
      const { title, summary } = splitTitleSummary(vm[1]);
      curVol = { title, summary, chapters: [] };
      continue;
    }
    const chm = line.match(/^##\s*第.+?章[:：]\s*(.+)$/);
    if (chm) {
      flushCh();
      const { title, summary } = splitTitleSummary(chm[1]);
      curCh = { title, summary, scenes: [] };
      continue;
    }
    const scm = line.match(/^###\s*场景[:：]\s*(.+)$/);
    if (scm) {
      flushScene();
      const { title, summary } = splitTitleSummary(scm[1]);
      curScene = { title, summary, timeLabel: '', location: '', characters: [], plotThreads: [] };
      continue;
    }
    if (curScene) {
      const fm = line.match(FIELD_RE);
      if (fm) {
        if (fm[1] === '时间') curScene.timeLabel = fm[2].trim();
        else if (fm[1] === '地点') curScene.location = fm[2].trim();
        else if (fm[1] === '角色') curScene.characters = splitNames(fm[2]);
        else if (fm[1] === '情节线') curScene.plotThreads = splitNames(fm[2]);
      }
    }
  }
  flushVol();
  return volumes;
}

/* ── Step 5：事件 ── */

export interface ParsedEvent {
  title: string;
  summary: string;
  chapterRef: string;
  timeLabel: string;
  location: string;
  characters: string[];
  plotThreads: string[];
}

export function parseEvents(markdown: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  let cur: ParsedEvent | undefined;
  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    const em = line.match(/^##\s*事件[:：]\s*(.+)$/);
    if (em) {
      const { title, summary } = splitTitleSummary(em[1]);
      cur = { title, summary, chapterRef: '', timeLabel: '', location: '', characters: [], plotThreads: [] };
      events.push(cur);
      continue;
    }
    if (cur) {
      const fm = line.match(FIELD_RE);
      if (fm) {
        if (fm[1] === '章节') cur.chapterRef = fm[2].trim();
        else if (fm[1] === '时间') cur.timeLabel = fm[2].trim();
        else if (fm[1] === '地点') cur.location = fm[2].trim();
        else if (fm[1] === '角色') cur.characters = splitNames(fm[2]);
        else if (fm[1] === '情节线') cur.plotThreads = splitNames(fm[2]);
      }
    }
  }
  return events;
}

/* ── Step 6：伏笔 ── */

export interface ParsedForeshadowing {
  title: string;
  description: string;
  type: string;
  characters: string[];
  relatedEvent: string;
  revealTiming: string;
}

export function parseForeshadowings(markdown: string): ParsedForeshadowing[] {
  const items: ParsedForeshadowing[] = [];
  let cur: ParsedForeshadowing | undefined;
  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    const fm = line.match(/^#\s*伏笔[:：]\s*(.+)$/);
    if (fm) {
      const { title, summary } = splitTitleSummary(fm[1]);
      cur = { title, description: summary, type: '', characters: [], relatedEvent: '', revealTiming: '' };
      items.push(cur);
      continue;
    }
    if (cur) {
      const f = line.match(FIELD_RE);
      if (f) {
        if (f[1] === '类型') cur.type = f[2].trim();
        else if (f[1] === '角色') cur.characters = splitNames(f[2]);
        else if (f[1] === '埋下事件') cur.relatedEvent = f[2].trim();
        else if (f[1] === '揭示建议') cur.revealTiming = f[2].trim();
      }
    }
  }
  return items;
}
