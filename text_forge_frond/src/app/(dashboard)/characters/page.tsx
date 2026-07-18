'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CharacterCard } from '@/components/characters/CharacterCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Drama, ArrowDownAz, Clock, LayoutGrid, List, MessageCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { Spinner, EmptyState } from '@/components/shared/states';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useProjectStore } from '@/lib/stores/projectStore';
import { useCharacterStore } from '@/lib/stores/characterStore';
import { NO_PROJECT } from '@/components/shared/ProjectPicker';
import type { Character } from '@/types';

type SortKey = 'recent' | 'name';
type ViewMode = 'grid' | 'list';

const ROLE_LABEL: Record<string, string> = {
  protagonist: '主角',
  heroine: '女主',
  supporting: '配角',
  antagonist: '反派',
};

export default function CharactersPage() {
  const characters = useCharacterStore((s) => s.characters);
  const syncFromBackend = useCharacterStore((s) => s.syncFromBackend);
  const removeCharacter = useCharacterStore((s) => s.removeCharacter);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [projectFilter, setProjectFilter] = useState<string>(NO_PROJECT);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [isLoading, setIsLoading] = useState(true);
  const { projects } = useProjectStore();

  useEffect(() => {
    syncFromBackend()
      .catch(e => toast.error('加载失败', { description: e instanceof Error ? e.message : '未知错误' }))
      .finally(() => setIsLoading(false));
  }, [syncFromBackend]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个角色吗？')) return;
    try {
      await removeCharacter(id);
      toast.success('已删除');
    } catch (e) {
      toast.error('删除失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
  };

  const filtered = characters
    .filter(c => (c.name ?? '').includes(searchTerm) || (c.description ?? '').includes(searchTerm))
    .filter(c => projectFilter === NO_PROJECT ? true : (c.projectId ?? null) === projectFilter)
    .sort((a, b) => sortKey === 'name'
      ? (a.name ?? '').localeCompare(b.name ?? '', 'zh')
      : (b.createdAt || '').localeCompare(a.createdAt || ''));

  if (isLoading) return <Spinner label="正在加载角色..." />;

  return (
    <div className="page-shell">
      <PageHeader
        icon={Drama}
        title="角色模拟"
        description="与小说中的角色进行 AI 对话，完善人物设定"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border/40 overflow-hidden">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setViewMode('grid')}
                aria-label="网格视图"
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setViewMode('list')}
                aria-label="列表视图"
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
            <Button asChild>
              <Link href="/characters/create"><Plus className="w-4 h-4 mr-2" /> 创建角色</Link>
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索角色名或设定..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={projectFilter} onValueChange={(v) => setProjectFilter(v ?? NO_PROJECT)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="关联项目">
              {(v: string) => {
                if (v === NO_PROJECT) return '全部项目';
                return projects.find((p) => p.id === v)?.title ?? '全部项目';
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_PROJECT}>全部项目</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-36"><SelectValue>{(value) => (value === 'name' ? '名称排序' : '最近创建')}</SelectValue></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent"><Clock className="w-4 h-4 mr-2 inline" /> 最近创建</SelectItem>
            <SelectItem value="name"><ArrowDownAz className="w-4 h-4 mr-2 inline" /> 名称排序</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Drama}
          title={characters.length === 0 ? '还没有角色' : '没有匹配的角色'}
          description={characters.length === 0 ? '点击「创建角色」开始设定你的第一个 AI 角色' : '试试别的关键词或筛选条件'}
          action={characters.length === 0 ? (
            <Button asChild size="sm">
              <Link href="/characters/create"><Plus className="w-4 h-4 mr-2" /> 创建角色</Link>
            </Button>
          ) : undefined}
        />
      ) : viewMode === 'list' ? (
        <div className="space-y-2 stagger">
          {filtered.map(char => (
            <CharacterRow
              key={char.id}
              character={char}
              projectTitle={char.projectId ? projects.find((p) => p.id === char.projectId)?.title : undefined}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          {filtered.map(char => (
            <CharacterCard key={char.id} character={char} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function CharacterRow({
  character,
  projectTitle,
  onDelete,
}: {
  character: Character;
  projectTitle?: string;
  onDelete: (id: string) => void;
}) {
  const role = character.role ? (ROLE_LABEL[character.role] ?? character.role) : undefined;
  return (
    <div className="flex items-center gap-3 p-2 border border-border/40 rounded-lg bg-background/30">
      <Avatar className="w-9 h-9 border border-border shrink-0">
        <AvatarImage src={character.avatar} />
        <AvatarFallback className="text-sm">{character.name.slice(0, 2)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate">{character.name}</p>
          {role && <span className="text-xs text-muted-foreground shrink-0">· {role}</span>}
        </div>
        <p className="text-xs text-muted-foreground truncate">{projectTitle ? `关联项目：${projectTitle}` : '未关联项目'}</p>
      </div>
      <Button asChild size="sm" variant="ghost" className="h-7 px-2 shrink-0">
        <Link href={`/characters/${character.id}/chat`}>
          <MessageCircle className="w-4 h-4 mr-1.5" /> 对话
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => onDelete(character.id)}
        aria-label="删除角色"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
