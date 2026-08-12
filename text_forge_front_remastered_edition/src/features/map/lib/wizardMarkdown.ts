// 初始化向导 Step 0-6 的 Markdown 方案解析器。
// 统一格式：
// - Step 0 世界观：# 世界观方案 + 「文风基调/世界观/写作禁忌/自定义字段：」字段行
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

/* ── Step 0：世界观（块字段：文风基调/世界观/写作禁忌/自定义字段） ── */

export interface ParsedCreativeSetting {
  name: string;
  tone: string;
  worldview: string;
  taboos: string;
  customFields: Record<string, string>;
}

/** 世界观方案顶层字段定义（单一数据源）：字段名 → 解析目标与是否多行续写 */
const CREATIVE_FIELDS = {
  文风基调: { target: 'tone', multiline: false },
  世界观: { target: 'worldview', multiline: true },
  写作禁忌: { target: 'taboos', multiline: true },
  自定义字段: { target: 'custom', multiline: false },
} as const;

type CreativeTarget = (typeof CREATIVE_FIELDS)[keyof typeof CREATIVE_FIELDS]['target'];
const CREATIVE_FIELD_KEYS = new Set(Object.keys(CREATIVE_FIELDS));

export function parseCreativeSetting(markdown: string): ParsedCreativeSetting {
  const out: ParsedCreativeSetting = { name: '', tone: '', worldview: '', taboos: '', customFields: {} };
  let current: CreativeTarget | null = null;
  let currentMulti = false;

  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    const hm = line.match(/^#\s*世界观方案[:：]\s*(.+)$/);
    if (hm) {
      const { title } = splitTitleSummary(hm[1]);
      out.name = title;
      current = null;
      currentMulti = false;
      continue;
    }
    // 其他任意标题 → 结束当前字段块
    if (/^#{1,6}\s/.test(line)) {
      current = null;
      currentMulti = false;
      continue;
    }
    if (line.trim() === '') continue;

    const fm = line.match(FIELD_RE);
    if (fm && CREATIVE_FIELD_KEYS.has(fm[1])) {
      const def = CREATIVE_FIELDS[fm[1] as keyof typeof CREATIVE_FIELDS];
      current = def.target;
      currentMulti = def.multiline;
      if (def.target !== 'custom') out[def.target] = fm[2].trim();
      continue;
    }

    if (current && currentMulti) {
      const target = current as 'worldview' | 'taboos';
      out[target] += out[target] ? `\n${line.trim()}` : line.trim();
    } else if (current === 'custom') {
      const kvm = line.match(FIELD_RE);
      if (kvm) out.customFields[kvm[1].trim()] = kvm[2].trim();
    }
  }
  return out;
}

/* ── Step 1：地点（标题层级表达父子关系 + 块字段） ── */

export interface ParsedLocation {
  name: string;
  type: string;
  description: string;
  /** Markdown 标题层级深度（JSON 数据块路径不填，落库只用 parentName） */
  level?: number;
  parentName?: string;
  /** JSON 数据块路径：父地点 [id] 引用（markdown 路径为空） */
  parentRefId?: number;
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
  /** JSON 数据块路径：目标角色 [id] 引用 */
  targetRefId?: number;
  description: string;
}

export interface ParsedCharacter {
  name: string;
  roleType: string;
  aliases: string[];
  status: string;
  description: string;
  spawnLocationName?: string;
  /** JSON 数据块路径：首次出场地点 [id] 引用 */
  spawnLocationRefId?: number;
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
  /** JSON 数据块路径：父线 [id] 引用 */
  parentRefId?: number;
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
  /** JSON 数据块路径：地点/角色/情节线 [id] 引用 */
  locationRefId?: number;
  characters: string[];
  charactersRefIds?: number[];
  plotThreads: string[];
  plotThreadsRefIds?: number[];
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
  /** JSON 数据块路径：章节 [id] 引用 */
  chapterRefId?: number;
  timeLabel: string;
  location: string;
  locationRefId?: number;
  characters: string[];
  charactersRefIds?: number[];
  plotThreads: string[];
  plotThreadsRefIds?: number[];
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
  charactersRefIds?: number[];
  relatedEvent: string;
  /** JSON 数据块路径：埋下事件 [id] 引用 */
  relatedEventRefId?: number;
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

/* ── JSON 数据块解析（Markdown 方案末尾的 ```json 结构化数据） ──
 * 方案 A：Markdown 负责展示，末尾 JSON 块负责落库。
 * 引用字段支持「[id] 名称」或纯名称两种写法；id 优先用于落库匹配。
 */

/** 提取文本中所有围栏 JSON 块并逐个解析，返回成功解析的对象列表。 */
export function extractJsonBlocks(text: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  const re = /```(?:json)?[ \t]*\r?\n?([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        blocks.push(parsed as Record<string, unknown>);
      }
    } catch { /* 单个块损坏不影响其他块 */ }
  }
  return blocks;
}

/** 引用值解析：「[id] 名称」→ { id, name }；纯名称 → { name }。 */
export function parseRef(value: string | null | undefined): { id?: number; name: string } {
  if (!value) return { name: '' };
  const m = value.trim().match(/^\[\s*(\d+)\s*\]\s*(.*)$/);
  if (m) return { id: Number(m[1]), name: m[2].trim() };
  return { name: value.trim() };
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asStringMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(asRecord(v))) {
    if (typeof val === 'string') out[k] = val;
  }
  return out;
}

/** 引用项解析：纯数字（LLM 直接输出 id）→ { id }；「[id] 名称」→ { id, name }；纯名称 → { name }。 */
function refParts(v: unknown): { id?: number; name: string } {
  if (typeof v === 'number' && Number.isInteger(v)) return { id: v, name: '' };
  return parseRef(asString(v));
}

function refsToNames(values: unknown[]): string[] {
  return values.map((v) => refParts(v).name).filter(Boolean);
}

function refsToIds(values: unknown[]): number[] | undefined {
  const ids = values.map((v) => refParts(v).id).filter((x): x is number => x != null);
  return ids.length > 0 ? ids : undefined;
}

export type ParsedStepResult =
  | ParsedCreativeSetting
  | ParsedLocation[]
  | ParsedCharacter[]
  | ParsedPlotThread[]
  | ParsedOutlineVolume[]
  | ParsedEvent[]
  | ParsedForeshadowing[];

/** 按步骤解析 JSON 块为与 markdown 解析器同构的实体结构；无有效块返回 null（调用方回退 markdown）。
 * 注：Step 0 走 parseCreativeSetting，不进入本函数（case 0 已移除）。 */
export function parseStepJson(text: string, step: number): ParsedStepResult | null {
  const blocks = extractJsonBlocks(text);
  if (blocks.length === 0) return null;

  switch (step) {
    case 1: {
      // 长输出可能拆多个块：合并全部块的 locations
      const items = blocks.flatMap((b) => asArray(b.locations));
      if (items.length === 0) return null;
      return items.map((raw) => {
        const it = asRecord(raw);
        const parent = refParts(it.parent);
        return {
          name: asString(it.name),
          type: asString(it.type),
          description: asString(it.description),
          parentName: parent.name || undefined,
          parentRefId: parent.id,
          customFields: asStringMap(it.customFields),
        };
      });
    }
    case 2: {
      const items = blocks.flatMap((b) => asArray(b.characters));
      if (items.length === 0) return null;
      return items.map((raw) => {
        const it = asRecord(raw);
        const spawn = refParts(it.spawnLocation);
        const relations = asArray(it.relationships).map((r) => {
          const rr = asRecord(r);
          const target = refParts(rr.targetName);
          return {
            type: asString(rr.type),
            targetName: target.name,
            targetRefId: target.id,
            description: asString(rr.description),
          };
        });
        return {
          name: asString(it.name),
          roleType: asString(it.roleType),
          aliases: asArray(it.aliases).map(asString).filter(Boolean),
          status: asString(it.status),
          description: asString(it.description),
          spawnLocationName: spawn.name || undefined,
          spawnLocationRefId: spawn.id,
          relationships: relations,
          customFields: asStringMap(it.customFields),
        };
      });
    }
    case 3: {
      const items = blocks.flatMap((b) => asArray(b.plotThreads));
      if (items.length === 0) return null;
      return items.map((raw) => {
        const it = asRecord(raw);
        const parent = refParts(it.parent);
        return {
          name: asString(it.name),
          type: asString(it.type),
          description: asString(it.description),
          parentName: parent.name || undefined,
          parentRefId: parent.id,
          level: parent.name || parent.id != null ? 2 : 1,
        };
      });
    }
    case 4: {
      // Step 4 按卷分批：每卷末尾各有一个 {"volume": {...}} 块，全部收集
      const volumes: ParsedOutlineVolume[] = [];
      for (const block of blocks) {
        const vol = asRecord(block.volume);
        if (!asString(vol.title)) continue;
        const chapters = asArray(vol.chapters).map((c) => {
          const ch = asRecord(c);
          const scenes = asArray(ch.scenes).map((s) => {
            const sc = asRecord(s);
            const loc = refParts(sc.location);
            return {
              title: asString(sc.title),
              summary: asString(sc.summary),
              timeLabel: asString(sc.timeLabel),
              location: loc.name,
              locationRefId: loc.id,
              characters: refsToNames(asArray(sc.characters)),
              charactersRefIds: refsToIds(asArray(sc.characters)),
              plotThreads: refsToNames(asArray(sc.plotThreads)),
              plotThreadsRefIds: refsToIds(asArray(sc.plotThreads)),
            };
          });
          return { title: asString(ch.title), summary: asString(ch.summary), scenes };
        });
        volumes.push({ title: asString(vol.title), summary: asString(vol.summary), chapters });
      }
      return volumes.length > 0 ? volumes : null;
    }
    case 5: {
      const items = blocks.flatMap((b) => asArray(b.events));
      if (items.length === 0) return null;
      return items.map((raw) => {
        const it = asRecord(raw);
        const chapter = refParts(it.chapterRef);
        const loc = refParts(it.location);
        return {
          title: asString(it.title),
          summary: asString(it.summary),
          chapterRef: chapter.name,
          chapterRefId: chapter.id,
          timeLabel: asString(it.timeLabel),
          location: loc.name,
          locationRefId: loc.id,
          characters: refsToNames(asArray(it.characters)),
          charactersRefIds: refsToIds(asArray(it.characters)),
          plotThreads: refsToNames(asArray(it.plotThreads)),
          plotThreadsRefIds: refsToIds(asArray(it.plotThreads)),
        };
      });
    }
    case 6: {
      const items = blocks.flatMap((b) => asArray(b.foreshadowings));
      if (items.length === 0) return null;
      return items.map((raw) => {
        const it = asRecord(raw);
        const ev = refParts(it.relatedEvent);
        return {
          title: asString(it.title),
          description: asString(it.description),
          type: asString(it.type),
          characters: refsToNames(asArray(it.characters)),
          charactersRefIds: refsToIds(asArray(it.characters)),
          relatedEvent: ev.name,
          relatedEventRefId: ev.id,
          revealTiming: asString(it.revealTiming),
        };
      });
    }
    default:
      return null;
  }
}
