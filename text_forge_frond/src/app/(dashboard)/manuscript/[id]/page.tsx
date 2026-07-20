// src/app/(dashboard)/manuscript/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Spinner } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/features/projects';
import { useManuscriptStore } from '@/features/manuscript';

// 编辑器单独成 chunk：其依赖较重（联想/导入/导出），懒加载可缩小首屏 chunk。
// 关键是带 loading fallback——避免因 dev/turbopack 偶发 chunk 失效导致 textarea 直接空白。
const ManuscriptEditor = dynamic(
  () => import('@/features/manuscript').then((m) => m.ManuscriptEditor),
  {
    loading: () => (
      <div className="flex flex-col items-center justify-center gap-3 h-[60vh] rounded-2xl border border-border/40 bg-background/40 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin opacity-70" strokeWidth={1.8} />
        <span className="text-sm">编辑器加载中…若长时间空白，刷新页面即可恢复</span>
      </div>
    ),
    ssr: false,
  },
);

export default function ManuscriptProjectPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const projects = useProjectStore((s) => s.projects);
  const loadProjects = useProjectStore((s) => s.load);
  const loadChapters = useManuscriptStore((s) => s.load);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadProjects().catch(() => {}).finally(() => setReady(true));
    loadChapters(projectId).catch(() => {});
  }, [projectId, loadProjects, loadChapters]);

  const project = projects.find((p) => p.id === projectId);

  if (!ready) return <Spinner label="正在加载手稿编辑器…" />;

  return (
    <div className="page-shell pb-8 h-full flex flex-col min-h-0 animate-ink-rise">
      <div className="flex items-center gap-3 mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/manuscript"><ArrowLeft className="w-4 h-4 mr-1.5" /> 返回手稿列表</Link>
        </Button>
        <span className="text-sm text-muted-foreground">项目：<span className="text-foreground font-medium">{project?.title ?? '未知项目'}</span></span>
      </div>
      <ManuscriptEditor projectId={projectId} />
    </div>
  );
}
