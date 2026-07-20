// src/lib/utils/bookImport.ts
// 把一本 txt 书稿按章节标题拆分。支持常见中文/数字章节标记：
//   第一章：星海初现 / 第1章 星海初现 / 第一章 星海初现 / 1. 星海初现 / 卷一
// 拆分不出章节时整体作为「导入全书」单章返回。

export interface ParsedChapter {
  title: string;
  content: string;
}

const CHAPTER_RE =
  /^\s*(第[一二三四五六七八九十百千零\d]+[章回节卷集部篇]|[卷卷]?[一二三四五六七八九十百千零\d]+\s*[、.．]|^\s*\d+[.、．])\s*[:：]?\s*(.*)$/;

export function parseBookText(text: string): ParsedChapter[] {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, ''));
  const chapters: ParsedChapter[] = [];
  let current: ParsedChapter | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (current) {
      current.content = buf.join('\n').replace(/^\n+/, '').replace(/\n+$/, '').trim();
      if (current.content) chapters.push(current);
    }
    buf = [];
  };

  for (const line of lines) {
    const m = line.match(CHAPTER_RE);
    if (m) {
      flush();
      const title = (m[2] || m[1] || '未命名章节').trim() || '未命名章节';
      current = { title, content: '' };
    } else {
      buf.push(line);
      // 首段无章节标记：归入"导入全书"
      if (!current && chapters.length === 0 && line.trim()) {
        current = { title: '导入全书', content: '' };
      }
    }
  }
  flush();

  return chapters.length ? chapters : [{ title: '导入全书', content: text.trim() }];
}

