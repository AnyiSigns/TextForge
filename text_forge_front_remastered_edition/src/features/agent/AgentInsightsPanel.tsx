'use client';

/**
 * 2.4：Agent 审计 / 指标读取面板（后端孤儿读取端点接入）。
 * 入口：设置页 Agent 标签 + 书籍详情页工具条（模态）。
 */
import { useCallback, useEffect, useState } from 'react';
import { X, ScrollText, BarChart3, RefreshCw } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import * as agentApi from '@/shared/api/agent';

interface AgentInsightsPanelProps {
  bookId?: number;
  onClose?: () => void;
}

type AuditRow = Record<string, unknown>;
type MetricRow = Record<string, unknown>;

function timeLabel(v: unknown): string {
  if (typeof v !== 'string') return '';
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    return d.toLocaleString('zh-CN', { hour12: false });
  } catch {
    return v;
  }
}

export function AgentInsightsPanel({ bookId, onClose }: AgentInsightsPanelProps) {
  const [tab, setTab] = useState<'audit' | 'metrics'>('audit');
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [a, m] = await Promise.all([
        agentApi.fetchWriteAudits(bookId, 50),
        agentApi.fetchTurnMetrics(bookId, 50),
      ]);
      setAudits(a);
      setMetrics(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    // setState 放微任务，规避 react-hooks/set-state-in-effect 同步 setState 告警
    queueMicrotask(() => { void load(); });
  }, [load]);

  const content = (
    <div className="w-full max-w-3xl max-h-[80vh] flex flex-col rounded-2xl border border-border/50 bg-card shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 h-12 border-b border-border/50 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Agent 运行洞察
          {bookId ? ` · 书籍 #${bookId}` : ''}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { void load(); }}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer"
            title="刷新"
          >
            <RefreshCw size={12} /> 刷新
          </button>
          {onClose && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 px-5 pt-3">
        {([
          { id: 'audit', label: '写操作审计', icon: ScrollText },
          { id: 'metrics', label: '回合指标', icon: BarChart3 },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium bg-transparent border-none cursor-pointer transition-colors',
              tab === t.id ? 'text-foreground bg-foreground/5' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <t.icon size={12} strokeWidth={1.8} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {loading && <div className="text-xs text-muted-foreground text-center py-6">加载中...</div>}
        {error && <div className="text-[11px] text-destructive/80 text-center py-6">{error}</div>}

        {!loading && !error && tab === 'audit' && (
          audits.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-6">暂无审计记录</div>
          ) : (
            <div className="space-y-2">
              {audits.map((r, i) => (
                <div key={i} className="rounded-lg border border-border/50 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-muted-foreground">{timeLabel(r.created_at)}</span>
                    <span className="px-1.5 py-px rounded bg-muted text-muted-foreground">{String(r.operation || '')}</span>
                    <span className="px-1.5 py-px rounded bg-muted text-muted-foreground">决策: {String(r.decision || '')}</span>
                    {r.result ? <span className="text-[10px] text-muted-foreground/70">结果: {String(r.result)}</span> : null}
                  </div>
                  <div className="text-[11px] text-foreground/80">工具: {String(r.tool_name || '')}</div>
                  {r.args_summary ? (
                    <div className="text-[10px] text-muted-foreground/70 break-all max-h-16 overflow-y-auto">
                      {String(r.args_summary)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )
        )}

        {!loading && !error && tab === 'metrics' && (
          metrics.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-6">暂无回合指标</div>
          ) : (
            <div className="space-y-2">
              {metrics.map((r, i) => (
                <div key={i} className="rounded-lg border border-border/50 p-3 flex items-center gap-4 text-[11px]">
                  <span className="text-muted-foreground shrink-0">{timeLabel(r.created_at)}</span>
                  <span className="px-1.5 py-px rounded bg-muted text-muted-foreground shrink-0">{String(r.subgraph || '')}</span>
                  <span className="tabular-nums">耗时 {Number(r.duration_ms || 0).toFixed(0)}ms</span>
                  <span className="tabular-nums">LLM {Number(r.llm_calls || 0)}</span>
                  <span className="tabular-nums">工具 {Number(r.tool_calls || 0)}</span>
                  <span className="tabular-nums text-emerald-600/80">成 {Number(r.tool_success || 0)}</span>
                  <span className="tabular-nums text-destructive/70">败 {Number(r.tool_fail || 0)}</span>
                  <span className="tabular-nums">审批 {Number(r.approval_count || 0)}</span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );

  if (onClose) {
    return (
      <div className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-6">
        {content}
      </div>
    );
  }
  return content;
}
