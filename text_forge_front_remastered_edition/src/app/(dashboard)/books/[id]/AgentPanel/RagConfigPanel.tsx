'use client';

/**
 * 个人知识库注入配置面板（检索入口）：
 * - 开关：发送消息时是否检索本地个人库并随回合注入 Agent
 * - topK：检索条数
 * - 范围：限定检索的文档（空 = 全部）
 * 配置持久化于 IndexedDB，跨会话生效。
 */
import { useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Switch } from '@/shared/ui/Switch';
import { ragClient } from '@/lib/knowledge';
import { getRagInjectionConfig, saveRagInjectionConfig, DEFAULT_RAG_INJECTION_CONFIG, type RagInjectionConfig } from '@/lib/rag/injectionConfig';

interface RagConfigPanelProps {
  onClose: () => void;
}

const TOPK_OPTIONS = [1, 2, 3, 5];

export function RagConfigPanel({ onClose }: RagConfigPanelProps) {
  const [cfg, setCfg] = useState<RagInjectionConfig | null>(null);
  const [docs, setDocs] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [c, d] = await Promise.all([
        getRagInjectionConfig(),
        ragClient.listPersonal().catch(() => []),
      ]);
      if (!alive) return;
      setCfg(c);
      setDocs(d);
    })();
    return () => { alive = false; };
  }, []);

  const apply = useMemo(
    () => (patch: Partial<RagInjectionConfig>) => {
      // 落盘副作用放在 updater 外（StrictMode 下 updater 可能执行两次，避免重复写入）
      setCfg((prev) => (prev ? { ...prev, ...patch } : prev));
      void saveRagInjectionConfig({
        ...(cfg ?? DEFAULT_RAG_INJECTION_CONFIG),
        ...patch,
      });
    },
    [cfg],
  );

  if (!cfg) return null;

  const toggleDoc = (id: string) => {
    const next = new Set(cfg.docIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply({ docIds: [...next] });
  };

  return (
    <div
      data-rag-config
      className="absolute right-0 top-full mt-1 z-20 w-72 rounded-xl border border-border/60 bg-card shadow-2xl overflow-hidden"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
        <span className="text-[11px] font-semibold">个人知识库注入</span>
        <button onClick={onClose} className="text-muted-foreground/60 hover:text-foreground bg-transparent border-none cursor-pointer text-[12px] leading-none">✕</button>
      </div>

      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] leading-tight">
            <div>发送时检索个人文档</div>
            <div className="text-[10px] text-muted-foreground/50">检索结果随回合注入 Agent 上下文</div>
          </div>
          <Switch checked={cfg.enabled} onChange={(v) => apply({ enabled: v })} aria-label="发送时检索个人文档" />
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground/80">注入条数</span>
          <div className="flex gap-1">
            {TOPK_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => apply({ topK: n })}
                className={cn(
                  'h-6 w-6 rounded text-[11px] border cursor-pointer bg-transparent transition-colors',
                  cfg.topK === n
                    ? 'border-foreground/40 bg-foreground/10 text-foreground font-medium'
                    : 'border-border text-muted-foreground/60 hover:border-foreground/30',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-muted-foreground/80 mb-1.5">检索范围（留空 = 全部文档）</div>
          <div className="max-h-36 overflow-y-auto space-y-0.5 pr-1">
            {docs.length === 0 && (
              <div className="text-[10px] text-muted-foreground/40">暂无个人文档，前往「知识库」页上传</div>
            )}
            {docs.map((d) => {
              const active = cfg.docIds.length === 0 || cfg.docIds.includes(d.id);
              return (
                <label key={d.id} className="flex items-center gap-1.5 cursor-pointer py-0.5">
                  <input
                    type="checkbox"
                    checked={active}
                    disabled={cfg.docIds.length === 0}
                    onChange={() => toggleDoc(d.id)}
                    className="accent-foreground"
                  />
                  <FileText size={11} className="text-muted-foreground/40 shrink-0" />
                  <span className={cn('text-[11px] truncate', active ? 'text-foreground/80' : 'text-muted-foreground/40 line-through')}>
                    {d.name}
                  </span>
                </label>
              );
            })}
            {docs.length > 0 && cfg.docIds.length > 0 && (
              <button
                onClick={() => apply({ docIds: [] })}
                className="mt-1 text-[10px] text-muted-foreground/50 hover:text-foreground bg-transparent border-none cursor-pointer"
              >
                清除限定，检索全部
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
