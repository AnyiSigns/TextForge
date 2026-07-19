// src/components/shared/GlobalSearch.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCharacterStore } from '@/lib/stores/characterStore';
import { Search, Users, BookOpen, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHotkeys } from 'react-hotkeys-hook';
import apiClient from '@/lib/api/client';
import { logger } from '@/lib/logger';
import type { Project } from '@/types';

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  type: 'project' | 'character' | 'document';
  href: string;
  icon: React.ReactNode;
}

const PROJECT_STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  generating: '生成中',
  completed: '已完成',
  paused: '已暂停',
};

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const { characters } = useCharacterStore();

  // 🟢 加载项目列表用于搜索
  useEffect(() => {
    if (!open) return;
    const fetchProjects = async () => {
      try {
        const { data } = await apiClient.get('/api/projects');
        setProjects(data.projects || []);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('加载项目失败', err.message);
      }
    };
    fetchProjects();
  }, [open]);

  useHotkeys('ctrl+k, cmd+k', (e) => {
    e.preventDefault();
    setOpen(true);
    setQuery('');
    setSelectedIndex(0);
  });

  useHotkeys('esc', () => setOpen(false), { enabled: open });

  const results = useMemo<SearchResult[]>(() => {
    if (!query.trim()) return [];

    const q = query.toLowerCase().trim();
    const results: SearchResult[] = [];

    // 搜索项目
    projects.forEach((p) => {
      if (p.title.toLowerCase().includes(q)) {
        results.push({
          id: `project-${p.id}`,
          title: p.title,
          subtitle: `项目 · ${PROJECT_STATUS_LABEL[p.status || 'draft'] || '草稿'}`,
          type: 'project',
          href: `/projects/${p.id}`,
          icon: <BookOpen className="w-4 h-4 text-blue-500" />,
        });
      }
    });

    // 搜索角色（防止名称或描述为 undefined 导致异常）
    characters.forEach((c) => {
      const name = (c.name || '').toString();
      const desc = (c.description || '').toString();
      if (name.toLowerCase().includes(q) || desc.toLowerCase().includes(q)) {
        results.push({
          id: `character-${c.id}`,
          title: name || '未命名角色',
          subtitle: `角色 · ${desc ? (desc.length > 30 ? desc.slice(0, 30) + '...' : desc) : '无描述'}`,
          type: 'character',
          href: `/characters/${c.id}/chat`,
          icon: <Users className="w-4 h-4 text-purple-500" />,
        });
      }
    });

    return results.slice(0, 10);
  }, [query, projects, characters]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    router.push(result.href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        <div className="flex items-center border-b border-border/40 px-4">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索项目、角色、文档..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="border-0 shadow-none focus-visible:ring-0 text-base"
            autoFocus
          />
          <kbd className="text-xs text-muted-foreground px-2 py-1 bg-muted rounded border border-border">
            Esc
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {query.trim() && results.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              <p>没有找到相关结果</p>
            </div>
          )}

          {results.map((result, index) => (
            <button
              key={result.id}
              className={cn(
                "w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left",
                index === selectedIndex ? "bg-accent" : "hover:bg-accent/50"
              )}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="shrink-0 w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center">
                {result.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{result.title}</p>
                <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>

        {query.trim() && results.length > 0 && (
          <div className="border-t border-border/40 px-4 py-2 text-xs text-muted-foreground flex justify-between">
            <span>↑↓ 选择 · Enter 跳转</span>
            <span>找到 {results.length} 个结果</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}