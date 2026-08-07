// 初始化向导 Step 1-6 的 Markdown 方案解析器。
// 统一格式：
// - Step 1 地点：# 地点（标题层级表达父子关系）+ 「类型/自定义字段：」字段行
// - Step 2 角色：## 角色 + 「类型/别名/状态/首次出场/关系链/自定义字段：」字段行
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

/* ── Step 1：地点（标题层级表达父子关系 + 块字段） ── */

export interface ParsedLocation {
  name: string;
  type: string;
  description: string;
  parentName?: string;
  level: number;
  customFields: Record<string, string>;
}

export function parseLocations(markdown: string): ParsedLocation[] {
  const locations: ParsedLocation[] = [];
  let cur: ParsedLocation | undefined;
  let customBlock = false;
  // 层级栈（多叉树）：stack[level] = 最近该层级的节点名，父级 = stack[level-1]
  const stack: Record<number, string> = {};

  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    const hm = line.match(/^(\#{1,6})\s*地点[:：]\s*(.+)$/);
    if (hm) {
      const level = hm[1].length;
      const { title, summary } = splitTitleSummary(hm[2]);
      cur = {
        name: title,
        type: '',
        description: summary,
        level,
        parentName: level > 1 ? stack[level - 1] : undefined,
        customFields: {},
      };
      locations.push(cur);
      stack[level] = title;
      customBlock = false;
      continue;
    }
    if (!cur || line.trim() === '') continue;

    // 自定义字段块：标记行后的「键：值」行，直到下一个标题
    if (customBlock) {
      const fm = line.match(FIELD_RE);
      if (fm) {
        // 块内出现已知字段名（如 LLM 反向顺序的「类型：」）→ 按外层字段处理并退出块
        if (fm[1] === '类型') {
          cur.type = fm[2].trim();
          customBlock = false;
        } else {
          cur.customFields[fm[1]] = fm[2].trim();
        }
      }
      continue;
    }

    const fm = line.match(FIELD_RE);
    if (fm) {
      if (fm[1] === '类型') {
        cur.type = fm[2].trim();
      } else if (fm[1] === '自定义字段') {
        const inline = fm[2].trim();
        if (inline) {
          try {
            const parsed = JSON.parse(inline);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              cur.customFields = Object.fromEntries(
                Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
              );
            }
          } catch { /* 非 JSON 内联值忽略 */ }
        } else {
          customBlock = true;
        }
      }
    }
  }
  return locations;
}

/* ── Step 2：角色（块字段：关系链 + 自定义字段） ── */

export interface ParsedCharacterRelation {
  type: string;
  targetName: string;
  description: string;
}

export interface ParsedCharacter {
  name: string;
  roleType: string;
  aliases: string[];
  status: string;
  description: string;
  spawnLocationName?: string;
  relationships: ParsedCharacterRelation[];
  customFields: Record<string, string>;
}

/** 关系行：关系类型 - 目标角色名：首行描述（分隔符两侧须有空格，避免类型内含连字符被误切） */
const RELATION_RE = /^(.+?)\s+-\s+(.+?)[:：]\s*(.*)$/;

/** 角色块字段名集合：用于在关系链块中识别"退出块"的字段行 */
const CHARACTER_FIELD_KEYS = new Set(['类型', '角色类型', '别名', '状态', '首次出场', '关系链', '自定义字段']);

export function parseCharacters(markdown: string): ParsedCharacter[] {
  const chars: ParsedCharacter[] = [];
  let cur: ParsedCharacter | undefined;
  let block: 'relation' | 'custom' | null = null;

  const applyField = (key: string, value: string) => {
    if (!cur) return;
    if (key === '类型' || key === '角色类型') cur.roleType = value;
    else if (key === '别名') cur.aliases = splitNames(value);
    else if (key === '状态') cur.status = value;
    else if (key === '首次出场') cur.spawnLocationName = value;
    else if (key === '关系链') block = 'relation';
    else if (key === '自定义字段') block = 'custom';
  };

  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    const hm = line.match(/^(\#{1,6})\s*角色[:：]\s*(.+)$/);
    if (hm) {
      const { title, summary } = splitTitleSummary(hm[2]);
      cur = {
        name: title,
        roleType: '',
        aliases: [],
        status: '',
        description: summary,
        relationships: [],
        customFields: {},
      };
      chars.push(cur);
      block = null;
      continue;
    }
    if (!cur || line.trim() === '') continue;

    if (block === 'custom') {
      const fm = line.match(FIELD_RE);
      if (fm) cur.customFields[fm[1]] = fm[2].trim();
      continue;
    }

    if (block === 'relation') {
      // 字段行（如「自定义字段：」「类型：」）→ 退出关系块并应用
      const fm = line.match(FIELD_RE);
      if (fm && CHARACTER_FIELD_KEYS.has(fm[1])) {
        block = null;
        applyField(fm[1], fm[2].trim());
        continue;
      }
      const rm = line.match(RELATION_RE);
      if (rm) {
        cur.relationships.push({ type: rm[1].trim(), targetName: rm[2].trim(), description: rm[3].trim() });
      } else {
        // 非关系模式行：追加为当前关系描述续行（多行详写）
        const last = cur.relationships[cur.relationships.length - 1];
        if (last) {
          last.description = last.description ? `${last.description}${line.trim()}` : line.trim();
        }
      }
      continue;
    }

    const fm = line.match(FIELD_RE);
    if (fm) applyField(fm[1], fm[2].trim());
  }
  return chars;
}

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
