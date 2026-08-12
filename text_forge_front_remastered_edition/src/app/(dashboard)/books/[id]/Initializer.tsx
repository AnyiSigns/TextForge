'use client';

import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Check, RefreshCw, Plus, Sparkles, Layers, BookOpen } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useInitializerStore, STEP_LABELS } from '@/features/map/stores/initializerStore';
import { useEntityStore } from '@/features/map/stores/entityStore';

/* ─── 模式徽标：初始化 / 追加（追加不覆盖已有数据） ─── */

function ModeBadge({ mode }: { mode: 'init' | 'append' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold tracking-wide border',
        mode === 'append'
          ? 'text-emerald-400/90 border-emerald-400/25 bg-emerald-400/[0.08]'
          : 'text-amber-400/90 border-amber-400/25 bg-amber-400/[0.08]',
      )}
    >
      {mode === 'append' ? <Layers size={9} /> : <Sparkles size={9} />}
      {mode === 'append' ? '追加模式' : '初始化'}
    </span>
  );
}

/* ─── 步骤指示器：数字徽章 + 连线，完成打勾 ─── */

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="px-4 py-3 border-b border-border flex-shrink-0 bg-gradient-to-b from-transparent to-foreground/[0.02]">
      <div className="flex items-start gap-0">
        {Array.from({ length: total }).map((_, i) => {
          const isDone = i < current;
          const isCurrent = i === current;
          return (
            <div key={i} className="flex-1 flex flex-col items-center min-w-0">
              <div className="flex items-center w-full">
                {i > 0 && (
                  <div
                    className={cn('h-px flex-1 transition-colors duration-500', isDone || isCurrent ? 'bg-foreground/25' : 'bg-foreground/[0.06]')}
                  />
                )}
                <div
                  className={cn(
                    'w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-300',
                    isCurrent
                      ? 'bg-foreground text-background shadow-[0_0_12px_rgba(0,0,0,0.25)] scale-110'
                      : isDone
                        ? 'bg-foreground/70 text-background'
                        : 'bg-foreground/[0.06] text-foreground/25 border border-foreground/[0.08]',
                  )}
                >
                  {isDone ? (
                    <Check size={10} strokeWidth={3} />
                  ) : (
                    <span className={cn('text-[8px] font-bold', isCurrent ? 'text-background' : 'text-foreground/30')}>{i + 1}</span>
                  )}
                </div>
              </div>
              <span
                className={cn(
                  'text-[8px] mt-1 transition-colors whitespace-nowrap',
                  isCurrent ? 'text-foreground/80 font-semibold' : isDone ? 'text-foreground/40' : 'text-foreground/15',
                )}
              >
                {STEP_LABELS[i]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── 前置校验警告条（meta.warnings） ─── */

function WarningsBanner() {
  const warnings = useInitializerStore((s) => s.warnings);
  if (warnings.length === 0) return null;
  return (
    <div className="px-4 py-2 border-b border-amber-400/20 bg-amber-400/[0.06]">
      {warnings.map((w) => (
        <p key={w} className="text-[10px] leading-relaxed text-amber-500/80">
          {w}
        </p>
      ))}
    </div>
  );
}

/* ─── Step 0: Creative Setting Form（分组卡片） ─── */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wider block mb-1.5">{children}</label>
  );
}

function StepCreativeSetting() {
  const creativeForm = useInitializerStore((s) => s.creativeForm);
  const setCreativeForm = useInitializerStore((s) => s.setCreativeForm);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <div className="flex items-center gap-1.5 mb-1">
        <BookOpen size={12} className="text-foreground/35" />
        <span className="text-[11px] font-semibold text-foreground/60">方案概要</span>
      </div>

      <div className="rounded-xl border border-border bg-card p-3.5 space-y-3.5 shadow-sm">
        <div>
          <FieldLabel>方案名称</FieldLabel>
          <input value={creativeForm.name} onChange={(e) => setCreativeForm({ name: e.target.value })} placeholder="星辰纪元"
            className="w-full h-8 px-3 rounded-lg text-xs bg-background border border-border focus:outline-none focus:border-foreground/25 focus:ring-2 focus:ring-foreground/[0.06] transition-all" />
        </div>
        <div>
          <FieldLabel>文风基调</FieldLabel>
          <input value={creativeForm.tone} onChange={(e) => setCreativeForm({ tone: e.target.value })} placeholder="史诗奇幻、轻松幽默、黑暗残酷..."
            className="w-full h-8 px-3 rounded-lg text-xs bg-background border border-border focus:outline-none focus:border-foreground/25 focus:ring-2 focus:ring-foreground/[0.06] transition-all" />
        </div>
        <div>
          <FieldLabel>世界观</FieldLabel>
          <textarea value={creativeForm.worldview} onChange={(e) => setCreativeForm({ worldview: e.target.value })} rows={5}
            placeholder="一个由星辰之力驱动的奇幻世界..."
            className="w-full px-3 py-2 rounded-lg text-xs bg-background border border-border focus:outline-none focus:border-foreground/25 focus:ring-2 focus:ring-foreground/[0.06] transition-all resize-none" />
        </div>
        <div>
          <FieldLabel>写作禁忌</FieldLabel>
          <textarea value={creativeForm.taboos} onChange={(e) => setCreativeForm({ taboos: e.target.value })} rows={3}
            placeholder="禁止现代科技；禁止降智反派..."
            className="w-full px-3 py-2 rounded-lg text-xs bg-background border border-border focus:outline-none focus:border-foreground/25 focus:ring-2 focus:ring-foreground/[0.06] transition-all resize-none" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
        <div className="flex items-center justify-between mb-2.5">
          <FieldLabel>自定义字段</FieldLabel>
          <button onClick={() => setCreativeForm({ customFields: [...creativeForm.customFields, { key: '', value: '', _uid: crypto.randomUUID() }] })}
            className="flex items-center gap-1 h-6 px-2 rounded-md text-[10px] text-foreground/50 hover:text-foreground bg-foreground/[0.04] border border-border cursor-pointer transition-colors">
            <Plus size={10} />
            添加
          </button>
        </div>
        {creativeForm.customFields.length === 0 && (
          <p className="text-[10px] text-foreground/30">暂无自定义字段，可添加如战力体系、势力等</p>
        )}
        {creativeForm.customFields.map((f, i) => (
          <div key={f._uid ?? i} className="flex gap-1.5 mb-1.5 last:mb-0">
            <input value={f.key}
              onChange={(e) => {
                const updated = creativeForm.customFields.map((x, j) => j === i ? { ...x, key: e.target.value } : x);
                setCreativeForm({ customFields: updated });
              }}
              placeholder="键" className="flex-1 h-7 px-2 rounded-lg text-[11px] bg-background border border-border focus:outline-none" />
            <input value={f.value}
              onChange={(e) => {
                const updated = creativeForm.customFields.map((x, j) => j === i ? { ...x, value: e.target.value } : x);
                setCreativeForm({ customFields: updated });
              }}
              placeholder="值" className="flex-[2] h-7 px-2 rounded-lg text-[11px] bg-background border border-border focus:outline-none" />
            <button onClick={() => setCreativeForm({ customFields: creativeForm.customFields.filter((_, j) => j !== i) })}
              className="w-5 h-7 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-foreground/15 hover:text-red-500/60 transition-colors">
              <X size={10} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 3/5/6: Markdown 单份方案（流式生成 + 预览） ─── */

function StepMarkdownStep({ step, title }: { step: number; title: string }) {
  const { stepText, streaming, generating, saving, regenerateCandidates, mode } = useInitializerStore();
  const text = stepText[step] ?? '';
  const hasText = !!text.trim();

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {!hasText && !streaming ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-foreground/[0.08] to-foreground/[0.02] border border-foreground/[0.06] flex items-center justify-center mb-3.5 shadow-inner">
            <Sparkles size={16} className="text-foreground/30" />
          </div>
          <p className="text-[12px] font-semibold text-foreground/60 mb-1">还没有{title}方案</p>
          <p className="text-[10px] text-foreground/30 max-w-[260px] leading-relaxed mb-4">
            {mode === 'append'
              ? `AI 将基于已有设定为书籍补充${title}素材，不会覆盖已有内容`
              : `点击下方按钮，AI 将根据前序设定生成一份完整的${title}方案`}
          </p>
          <button
            onClick={() => void regenerateCandidates()}
            disabled={saving || generating}
            className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-[11px] font-medium bg-foreground text-background hover:opacity-90 active:scale-[0.98] transition-all border-none cursor-pointer disabled:opacity-50 shadow-md shadow-foreground/10"
          >
            {generating ? (
              <span className="w-3 h-3 border-2 border-background/40 border-t-background rounded-full animate-spin" />
            ) : (
              <RefreshCw size={11} />
            )}
            {generating ? '生成中...' : `AI 生成${title}`}
          </button>
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between px-0.5">
            <span className="text-[10px] text-foreground/30 flex items-center gap-1.5">
              {streaming && (
                <span className="flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '120ms' }} />
                  <span className="w-1 h-1 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '240ms' }} />
                </span>
              )}
              {streaming ? '正在生成...' : '生成完毕后点击"下一步"确认落库'}
            </span>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/60 bg-card border border-border rounded-xl p-3.5 shadow-sm">
            {text || '...'}
          </pre>
        </>
      )}
    </div>
  );
}

/* ─── Step 4: Outline Document Preview（流式，按卷生成 + 进度条） ─── */

function StepOutlinePreview() {
  const volumes = useEntityStore((s) => s.volumes);
  const chapters = useEntityStore((s) => s.chapters);
  const { stepText, streaming, generating, saving, regenerateCandidates, volumeProgress } = useInitializerStore();
  const [volCount, setVolCount] = useState(2);
  const [chPerVol, setChPerVol] = useState('5,5');

  const text = stepText[4] ?? '';
  const hasText = !!text.trim();
  // 尚未生成且未在流式时显示参数配置表单
  const showConfig = !streaming && !hasText;

  const handleGenerate = () => {
    // 将卷数/每卷章数约束传给后端（extraInstruction），按卷流式生成
    const extra = `卷数=${volCount} 每卷章数=${chPerVol}`;
    void regenerateCandidates(extra);
  };

  const handleResetParams = () => {
    useInitializerStore.setState((s) => ({ stepText: { ...s.stepText, 4: '' } }));
  };

  if (showConfig) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-[320px] space-y-4">
          <div className="text-center flex flex-col items-center gap-1.5">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-foreground/[0.08] to-foreground/[0.02] border border-foreground/[0.06] flex items-center justify-center">
              <Layers size={15} className="text-foreground/30" />
            </div>
            <span className="text-[11px] font-semibold text-foreground/55">设定大纲参数</span>
            <span className="text-[10px] text-foreground/30 max-w-[240px] leading-relaxed">按指定卷章数流式生成单份大纲，含卷摘要、章摘要、场景节点（时间/地点/角色/情节线）</span>
          </div>
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-3 shadow-sm">
            <div>
              <label className="text-[10px] text-foreground/35 block mb-1">卷数 (1-10)</label>
              <input type="number" min={1} max={10} value={volCount}
                onChange={(e) => setVolCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                className="w-full h-8 px-3 rounded-lg text-xs bg-background border border-border focus:outline-none focus:border-foreground/25" />
            </div>
            <div>
              <label className="text-[10px] text-foreground/35 block mb-1">每卷章数（逗号分隔）</label>
              <input value={chPerVol} onChange={(e) => setChPerVol(e.target.value)}
                placeholder="5,5" className="w-full h-8 px-3 rounded-lg text-xs bg-background border border-border focus:outline-none focus:border-foreground/25" />
            </div>
            <button onClick={handleGenerate} disabled={generating || saving}
              className="w-full h-9 rounded-lg text-xs bg-foreground text-background border-none cursor-pointer font-medium disabled:opacity-50 hover:opacity-90 active:scale-[0.99] transition-all shadow-md shadow-foreground/10">
              {generating ? '生成中...' : 'AI 生成大纲方案'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      <div className="mb-2 flex items-center justify-between px-0.5">
        <span className="text-[10px] text-foreground/30">
          {streaming ? '正在按卷生成大纲...' : '生成完毕后点击"下一步"确认落库'}
        </span>
        {!streaming && (
          <button
            onClick={handleResetParams}
            className="text-[10px] text-foreground/30 hover:text-foreground/60 bg-transparent border-none cursor-pointer underline underline-offset-2"
          >
            修改参数
          </button>
        )}
      </div>

      {/* 按卷生成进度条（消费 volume_end 事件） */}
      {volumeProgress && volumeProgress.total > 1 && (
        <div className="mb-2.5 rounded-lg border border-border bg-card px-3 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-foreground/40">卷生成进度</span>
            <span className="text-[10px] font-semibold text-foreground/60">
              {volumeProgress.done}/{volumeProgress.total}
            </span>
          </div>
          <div className="h-1 rounded-full bg-foreground/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-foreground/60 transition-all duration-500"
              style={{ width: `${(volumeProgress.done / volumeProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/60 bg-card border border-border rounded-xl p-3.5 shadow-sm">
        {text || '...'}
      </pre>

      {/* 已保存卷/章预览 */}
      {volumes.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[10px] font-semibold text-foreground/35 uppercase tracking-wider mb-2">已生成大纲</div>
          {volumes.map((vol) => {
            const volChapters = chapters.filter((ch) => ch.volumeId === vol.id).sort((a, b) => a.sortOrder - b.sortOrder);
            return (
              <div key={vol.id} className="mb-3 rounded-xl border border-border bg-card p-3">
                <div className="text-[13px] font-bold text-foreground/80">{vol.title}</div>
                {vol.summary && <div className="text-[10px] text-foreground/35 mb-1.5">{vol.summary}</div>}
                <div className="pt-1.5 space-y-1">
                  {volChapters.map((ch) => (
                    <div key={ch.id} className="flex items-start gap-2 pl-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-foreground/[0.12] mt-1.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-foreground/70">{ch.title}</div>
                        {ch.summary && <div className="text-[10px] text-foreground/35">{ch.summary}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Main Initializer Component ─── */

export function Initializer() {
  const {
    isOpen, currentStep, mode,
    close, nextStep, prevStep,
    regenerateCandidates, finish,
    saving, generating, streaming, error, clearError,
  } = useInitializerStore();

  const isLastStep = currentStep >= 6;
  const isFirstStep = currentStep <= 0;

  const handleRegenerate = () => {
    void regenerateCandidates();
  };

  const handleNextStep = () => {
    void nextStep();
  };

  const handleFinish = () => {
    void finish();
  };

  // 所有步骤显示"重新生成"
  const showRegenerate = true;

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
        onClick={close}
      />

      <div
        className="fixed top-0 right-0 z-50 h-full w-[560px] bg-background/95 backdrop-blur-md border-l border-border shadow-2xl flex flex-col theme-surface"
        style={{ animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold text-foreground/80">创作设定</span>
              <span className="text-[9px] text-foreground/25 bg-foreground/[0.04] px-1.5 py-0.5 rounded">
                {currentStep + 1}/7
              </span>
            </div>
            <ModeBadge mode={mode} />
          </div>
          <button onClick={close}
            className="w-6 h-6 flex items-center justify-center rounded text-foreground/20 hover:text-foreground/50 bg-transparent border-none cursor-pointer transition-colors">
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Step indicator */}
        <StepIndicator current={currentStep} total={7} />

        {/* 前置校验警告 */}
        <WarningsBanner />

        {/* Content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {currentStep === 0 && <StepCreativeSetting />}
          {currentStep === 1 && <StepMarkdownStep step={1} title="地点" />}
          {currentStep === 2 && <StepMarkdownStep step={2} title="角色" />}
          {currentStep === 3 && <StepMarkdownStep step={3} title="情节线" />}
          {currentStep === 4 && <StepOutlinePreview />}
          {currentStep === 5 && <StepMarkdownStep step={5} title="事件" />}
          {currentStep === 6 && <StepMarkdownStep step={6} title="伏笔" />}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border flex-shrink-0">
          {error && (
            <div className="flex items-center gap-1.5 mb-2 px-2.5 py-1.5 rounded-lg bg-red-500/[0.07] border border-red-500/15">
              <span className="text-[10px] text-red-500/80 flex-1">{error}</span>
              <button onClick={clearError} className="text-[10px] text-foreground/30 hover:text-foreground/50 bg-transparent border-none cursor-pointer">关闭</button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {showRegenerate && (
                <button onClick={handleRegenerate}
                  disabled={saving || generating}
                  className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[10px] text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.03] bg-transparent border border-border cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  {generating ? (
                    <span className="w-3 h-3 border-2 border-foreground/20 border-t-foreground/40 rounded-full animate-spin" />
                  ) : (
                    <RefreshCw size={11} />
                  )}
                  {generating ? '生成中...' : '重新生成'}
                </button>
              )}
              <button onClick={close}
                disabled={saving}
                className="h-7 px-2.5 rounded-lg text-[10px] text-foreground/30 hover:text-foreground/50 hover:bg-foreground/[0.03] bg-transparent border border-border cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                跳过
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {!isFirstStep && (
                <button onClick={prevStep}
                  disabled={saving || generating || streaming}
                  className="flex items-center gap-1 h-7 px-3 rounded-lg text-[10px] text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.03] bg-transparent border border-border cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeft size={12} />
                  上一步
                </button>
              )}
              {isLastStep ? (
                <button onClick={handleFinish}
                  disabled={saving}
                  className="flex items-center gap-1 h-7 px-4 rounded-lg text-[10px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-foreground/10">
                  {saving ? (
                    <>
                      <span className="w-3 h-3 border-2 border-background/40 border-t-background rounded-full animate-spin" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <Check size={12} />
                      完成{mode === 'append' ? '追加' : '初始化'}
                    </>
                  )}
                </button>
              ) : (
                <button onClick={handleNextStep}
                  disabled={saving || generating || streaming}
                  className="flex items-center gap-1 h-7 px-4 rounded-lg text-[10px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-foreground/10">
                  下一步
                  <ChevronRight size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
