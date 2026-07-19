// src/lib/storage/backup.ts
// 统一本地存储：把项目级附属文档（大纲、灵感剪藏）也存入 IndexedDB，
// 与 projects/characters/briefs 保持一致，避免 localStorage 与 IndexedDB 两套存储分裂。
// 同时提供整包导出/导入，保证"纯前端可跑 + 前后端数据一致"。
import { getItem, setItem } from './indexedDB';
import type { Project, Step, Character, ProjectBrief, Origin } from '@/types';
import { useProjectStore } from '@/lib/stores/projectStore';
import { useCharacterStore } from '@/lib/stores/characterStore';
import { useBriefStore } from '@/lib/stores/briefStore';
import { useManuscriptStore } from '@/lib/stores/manuscriptStore';

export type OutlineNodeStatus = 'todo' | 'writing' | 'done';

// 大纲三级树：卷 → 章 → 节点（情节节拍）
export interface OutlineNode {
  id: string;
  title: string;
  content?: string;          // 摘要/要点
  status?: OutlineNodeStatus;
  targetWords?: number;       // 目标字数
  charIds?: string[];        // 关联角色
  sectionIds?: string[];     // 关联设定维度
  origin?: Origin;           // 来源（种子/用户），增量合并用
}

export interface OutlineChapter {
  id: string;
  title: string;
  nodes: OutlineNode[];
  origin?: Origin;
}

export interface OutlineVolume {
  id: string;
  title: string;
  chapters: OutlineChapter[];
  origin?: Origin;
}

// 兼容旧扁平结构（迁移用）：title+content 视作单卷单章单节点
export interface OutlineSection {
  id: string;
  title: string;
  content?: string;
}

export interface InspirationItem {
  id: string;
  type: 'text' | 'image' | 'link';
  content: string;
  note?: string;
  createdAt: string;
}

const outlineKey = (projectId: string) => `outline-${projectId}`;
const inspirationKey = (projectId: string) => `inspiration-${projectId}`;

export async function loadOutline(projectId: string): Promise<OutlineVolume[]> {
  const raw = await getItem<OutlineVolume[]>(outlineKey(projectId));
  if (Array.isArray(raw) && raw.length) return raw;
  // 兼容旧扁平结构：title+content → 单卷单章单节点
  const legacy = (await getItem<OutlineSection[]>(outlineKey(projectId))) ?? [];
  if (legacy.length) {
    return [{
      id: `vol-legacy-${projectId}`,
      title: '大纲',
      chapters: [{
        id: `ch-legacy-${projectId}`,
        title: '正文',
        nodes: legacy.map((s) => ({ id: s.id, title: s.title, content: s.content })),
      }],
    }];
  }
  return [];
}

export async function saveOutline(projectId: string, volumes: OutlineVolume[]): Promise<void> {
  if (volumes.length > 0) await setItem(outlineKey(projectId), volumes);
  else await setItem(outlineKey(projectId), []);
}

export async function loadInspiration(projectId: string): Promise<InspirationItem[]> {
  return (await getItem<InspirationItem[]>(inspirationKey(projectId))) || [];
}

export async function saveInspiration(projectId: string, items: InspirationItem[]): Promise<void> {
  await setItem(inspirationKey(projectId), items);
}

// ---------- 整包备份 ----------
export interface WorkspaceBackup {
  version: 1;
  exportedAt: string;
  projects?: unknown;
  characters?: unknown;
  briefs?: unknown;
  models?: unknown;
  settings?: unknown;
  outlines?: Record<string, OutlineVolume[]>;
  inspirations?: Record<string, InspirationItem[]>;
  drafts?: Record<string, unknown>;
  versionHistories?: Record<string, unknown>;
}

export async function exportWorkspace(
  stores: {
    projects?: unknown;
    characters?: unknown;
    briefs?: unknown;
    models?: unknown;
    settings?: unknown;
  },
  projectIds: string[],
): Promise<WorkspaceBackup> {
  const outlines: Record<string, OutlineVolume[]> = {};
  const inspirations: Record<string, InspirationItem[]> = {};
  for (const pid of projectIds) {
    outlines[pid] = await loadOutline(pid);
    inspirations[pid] = await loadInspiration(pid);
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: stores.projects,
    characters: stores.characters,
    briefs: stores.briefs,
    models: stores.models,
    settings: stores.settings,
    outlines,
    inspirations,
    drafts: {},
    versionHistories: {},
  };
}

export function downloadBackup(backup: WorkspaceBackup, filename?: string): void {
  const data = JSON.stringify(backup, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `text-forge-backup-${backup.exportedAt.split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importWorkspace(
  backup: WorkspaceBackup,
  apply: {
    projects?: (data: unknown) => void | Promise<void>;
    characters?: (data: unknown) => void | Promise<void>;
    briefs?: (data: unknown) => void | Promise<void>;
    models?: (data: unknown) => void | Promise<void>;
    settings?: (data: unknown) => void | Promise<void>;
  },
  projectIds: string[],
): Promise<void> {
  if (backup.projects !== undefined && apply.projects) await apply.projects(backup.projects);
  if (backup.characters !== undefined && apply.characters) await apply.characters(backup.characters);
  if (backup.briefs !== undefined && apply.briefs) await apply.briefs(backup.briefs);
  if (backup.models !== undefined && apply.models) await apply.models(backup.models);
  if (backup.settings !== undefined && apply.settings) await apply.settings(backup.settings);

  for (const pid of projectIds) {
    if (backup.outlines?.[pid]) await saveOutline(pid, backup.outlines[pid]);
    if (backup.inspirations?.[pid]) await saveInspiration(pid, backup.inspirations[pid]);
  }
}

// ---------- 单项目导出 ----------
export interface SingleProjectBundle {
  project: Project;
  steps: Step[];
  outline: OutlineVolume[];
  inspiration: InspirationItem[];
  characters: Character[];
  brief: ProjectBrief | null;
}

function downloadText(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const safeName = (title: string) => (title || '未命名项目').replace(/[\\/:*?"<>|]/g, '_');

export async function buildProjectBundle(projectId: string): Promise<SingleProjectBundle> {
  const project = useProjectStore.getState().projects.find((p) => p.id === projectId);
  const steps = (await getItem<Step[]>(`steps-${projectId}`)) || [];
  const outline = await loadOutline(projectId);
  const inspiration = await loadInspiration(projectId);
  const characters = useCharacterStore.getState().characters.filter((c) => (c.projectId ?? null) === projectId);
  const brief = useBriefStore.getState().briefs[projectId] || null;

  return {
    project: project || { id: projectId, title: '未命名项目', status: 'draft', createdAt: '', updatedAt: '' },
    steps,
    outline,
    inspiration,
    characters,
    brief,
  };
}

export function projectBundleToMarkdown(bundle: SingleProjectBundle): string {
  const { project, steps, outline, inspiration, characters, brief } = bundle;
  const lines: string[] = [];
  lines.push(`# ${project.title || '未命名项目'}`);
  lines.push('');
  if (project.genre) lines.push(`> 题材：${project.genre}`);
  if (project.description) lines.push(`> ${project.description}`);
  lines.push('');

  if (brief) {
    lines.push(`## 创作设定`);
    lines.push('');
    const fields: [string, string | undefined][] = [
      ['类型', brief.genre],
      ['世界观', brief.worldview],
      ['基调', brief.tone],
      ['风格指南', brief.styleGuide],
      ['禁忌', brief.forbidden],
    ];
    for (const [k, v] of fields) {
      if (v) lines.push(`- **${k}**：${v}`);
    }
    if (brief.wordCountGoal) lines.push(`- **总字数目标**：${brief.wordCountGoal}`);
    lines.push('');
  }

  if (characters.length) {
    lines.push(`## 角色`);
    lines.push('');
    for (const c of characters) {
      lines.push(`### ${c.name}`);
      if (c.description) lines.push(c.description);
      lines.push('');
    }
  }

  if (outline.length) {
    lines.push(`## 大纲`);
    lines.push('');
    for (const vol of outline) {
      lines.push(`### ${vol.title}`);
      for (const ch of vol.chapters) {
        lines.push(`#### 第 ${vol.chapters.indexOf(ch) + 1} 章：${ch.title}`);
        for (const node of ch.nodes) {
          const mark = node.status === 'done' ? '✅' : node.status === 'writing' ? '✍️' : '⬜';
          lines.push(`- ${mark} ${node.title}${node.targetWords ? `（目标 ${node.targetWords} 字）` : ''}`);
          if (node.content) lines.push(`  ${node.content}`);
        }
      }
    }
  }

  lines.push(`## 正文`);
  lines.push('');
  if (steps.length) {
    for (const step of steps) {
      const agentLabel: Record<string, string> = {
        planner: '策划', world: '世界观', character: '角色', outline: '大纲',
        writer: '写作', reviewer: '审校', editor: '总编',
      };
      const label = agentLabel[step.agent] || step.agent;
      lines.push(`### 第 ${step.agent}（${label}）`);
      lines.push(step.content || '');
      lines.push('');
    }
  } else {
    lines.push('（暂无正文）');
    lines.push('');
  }

  if (inspiration.length) {
    lines.push(`## 灵感剪藏`);
    lines.push('');
    for (const it of inspiration) {
      lines.push(`- [${it.type}] ${it.content}${it.note ? ` —— ${it.note}` : ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export async function exportProjectJson(projectId: string): Promise<void> {
  const bundle = await buildProjectBundle(projectId);
  downloadText(JSON.stringify(bundle, null, 2), `${safeName(bundle.project.title)}.json`, 'application/json');
}

export async function exportProjectMarkdown(projectId: string): Promise<void> {
  const bundle = await buildProjectBundle(projectId);
  downloadText(projectBundleToMarkdown(bundle), `${safeName(bundle.project.title)}.md`, 'text/markdown');
}

// 去除正文里的图片链接（![说明](url)），保证纯文字导出不含配图标记
function stripImageLinks(text: string): string {
  return text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
}

export type TxtMode = 'tidy' | 'format';

// 轻度规整（无害）：去行尾空格、连续空行压成单空行
function lightTidy(text: string): string {
  return text
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

// 判断一行是否为"章节/卷标题"，排版时需保留、不可并入正文段
function isHeadingLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^#{1,6}\s/.test(t)) return true;
  if (/^(第\s*[零一二三四五六七八九十百千\d]+\s*[章节卷回部篇])/.test(t)) return true;
  if (/^[卷回部篇]\s*[零一二三四五六七八九十百千\d]+/.test(t)) return true;
  return false;
}

// 段落排版：按空行分段，段内多余换行合并，但标题行前后强制保留空行、不并入上段
function paragraphFormat(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length === 0) return;
    out.push(buf.join('').replace(/\s+/g, ' ').trim());
    buf = [];
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/g, '');
    if (line.trim() === '') {
      flush();
      out.push('');
    } else if (isHeadingLine(line)) {
      flush();
      out.push('');
      out.push(line.trim());
      out.push('');
    } else {
      buf.push(line.trim());
    }
  }
  flush();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '');
}

// 纯文本正文管线：先去图链，再按 mode 轻度规整或段落排版
function toPlainBody(stepsContent: string[], mode: TxtMode): string {
  const cleaned = stepsContent.map((c) => stripImageLinks(c || ''));
  if (mode === 'format') {
    return cleaned
      .filter((c) => c.trim().length > 0)
      .map((c) => paragraphFormat(c))
      .join('\n\n');
  }
  return cleaned
    .filter((c) => c.trim().length > 0)
    .map((c) => lightTidy(c))
    .join('\n\n');
}

// TXT 仅导出正文内容（不含设定/角色/大纲/灵感），并剥离图片链接，保证纯文字。
export async function exportProjectText(projectId: string, mode: TxtMode = 'tidy'): Promise<void> {
  const bundle = await buildProjectBundle(projectId);
  const body = toPlainBody(bundle.steps.map((s) => s.content || ''), mode);
  const plain = lightTidy(`${bundle.project.title || '未命名项目'}\n\n${body}`);
  downloadText(plain, `${safeName(bundle.project.title)}.txt`, 'text/plain');
}

// 仅导出手稿书籍正文（不含设定/角色/工作台步骤），支持 Markdown / 纯文本。
export async function exportManuscriptBook(
  projectId: string,
  fmt: 'markdown' | 'txt' = 'txt',
  mode: TxtMode = 'tidy',
): Promise<void> {
  await useManuscriptStore.getState().load(projectId);
  const chapters = useManuscriptStore.getState().chapters
    .filter((c) => c.projectId === projectId)
    .sort((a, b) => a.index - b.index || a.updatedAt.localeCompare(b.updatedAt));
  const project = useProjectStore.getState().projects.find((p) => p.id === projectId);
  const title = project?.title || '未命名书籍';

  const md = [`# ${title}`, ''].concat(
    chapters.map((c) => [`## ${c.title}`, '', c.content, ''].join('\n')),
  ).join('\n');
  const txt = chapters
    .map((c) => {
      const heading = lightTidy(c.title);
      const body = mode === 'format'
        ? paragraphFormat(stripImageLinks(c.content))
        : lightTidy(stripImageLinks(c.content));
      return `${heading}\n\n${body}`;
    })
    .join('\n\n———\n\n');

  if (fmt === 'markdown') downloadText(md, `${safeName(title)}.md`, 'text/markdown');
  else downloadText(txt, `${safeName(title)}.txt`, 'text/plain');
}
