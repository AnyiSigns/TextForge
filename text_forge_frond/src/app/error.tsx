// src/app/error.tsx
'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/monitoring';

type ErrorLike = { name?: string; message?: string; digest?: string };

function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const e = err as ErrorLike;
  if (e.name === 'ChunkLoadError') return true;
  if (e.message && /chunk|loading|import\(\)|failed to fetch/i.test(e.message)) return true;
  if (typeof e.digest === 'string' && /ChunkLoadError|chunk/i.test(e.digest)) return true;
  return false;
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isChunk, setIsChunk] = useState(false);

  useEffect(() => {
    const chunk = isChunkLoadError(error);
    setIsChunk(chunk);
    logger.error(chunk ? 'Chunk load error (dev/turbopack 偶发)' : 'Global error', error);
    captureException(error, { source: 'app/error.tsx', isChunk });
  }, [error]);

  const handleReset = () => {
    if (isChunk) {
      // chunk 失效几乎总是刷新即可恢复，直接整页 reload 最稳。
      window.location.reload();
      return;
    }
    try {
      reset();
    } catch {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-2" />
          <CardTitle>{isChunk ? '页面资源加载失败' : '出了点小问题'}</CardTitle>
          <CardDescription>
            {isChunk
              ? '部分页面资源（chunk）加载失败，通常是开发环境偶发问题。刷新页面即可恢复，内容不会丢失。'
              : '页面没能正常显示。你可以先重试一下；如果还是不行，刷新页面通常就能恢复。'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button onClick={handleReset} className="flex-1">
              {isChunk ? '刷新页面' : '重试'}
            </Button>
            {!isChunk && (
              <Button variant="outline" onClick={() => window.location.reload()} className="flex-1">
                刷新页面
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
