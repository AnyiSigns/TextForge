'use client';

import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Check, RefreshCw, Plus } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useInitializerStore, STEP_LABELS } from '@/features/map/stores/initializerStore';
import { useEntityStore } from '@/features/map/stores/entityStore';

/* ─── Step-specific content components ─── */

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="px-4 py-3 border-b border-border flex-shrink-0">
      <div className="flex items-end gap-0">
        {Array.from({ length: total }).map((_, i) => {
          const isDone = i < current;
          const isCurrent = i === current;
          return (
            <div key={i} className="flex-1 flex flex-col items-center min-w-0">
              <div className="flex items-center w-full">
                {i > 0 && (
                  <div
                    className="flex-1 h-0.5 transition-colors duration-500"
                    style={{
                      background: isDone ? 'color-mix(in srgb, var(--foreground) 40%, transparent)' : isCurrent ? 'linear-gradient(to right, color-mix(in srgb, var(--foreground) 40%, transparent), color-mix(in srgb, var(--foreground) 10%, transparent))' : 'color-mix(in srgb, var(--foreground) 6%, transparent)',
                    }}
                  />
                )}
                <div
                  className={cn(
                    'rounded-full flex-shrink-0 transition-all duration-300',
                    isCurrent
                      ? 'w-[6px] h-[6px] bg-foreground/80 ring-4 ring-foreground/10'
                      : isDone
                        ? 'w-[4px] h-[4px] bg-foreground/40'
                        : 'w-[4px] h-[4px] bg-foreground/[0.08]',
                  )}
                />
              </div>
              <span
                className={cn(
                  'text-[8px] mt-0.5 transition-colors',
                  isCurrent ? 'text-foreground/70 font-semibold' : isDone ? 'text-foreground/25' : 'text-foreground/10',
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

/* ─── Step 0: Creative Setting Form ─── */

function StepCreativeSetting() {
  const creativeForm = useInitializerStore((s) => s.creativeForm);
  const setCreativeForm = useInitializerStore((s) => s.setCreativeForm);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <div>
        <label className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wider block mb-1.5">方案名称</label>
        <input value={creativeForm.name} onChange={(e) => setCreativeForm({ name: e.target.value })} placeholder="星辰纪元"
          className="w-full h-8 px-3 rounded-md text-xs bg-card border border-border focus:outline-none focus:border-foreground/20" />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wider block mb-1.5">文风基调</label>
        <input value={creativeForm.tone} onChange={(e) => setCreativeForm({ tone: e.target.value })} placeholder="史诗奇幻、轻松幽默、黑暗残酷..."
          className="w-full h-8 px-3 rounded-md text-xs bg-card border border-border focus:outline-none focus:border-foreground/20" />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wider block mb-1.5">世界观</label>
        <textarea value={creativeForm.worldview} onChange={(e) => setCreativeForm({ worldview: e.target.value })} rows={5}
          placeholder="一个由星辰之力驱动的奇幻世界..."
          className="w-full px-3 py-2 rounded-md text-xs bg-card border border-border focus:outline-none focus:border-foreground/20 resize-none" />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wider block mb-1.5">写作禁忌</label>
        <textarea value={creativeForm.taboos} onChange={(e) => setCreativeForm({ taboos: e.target.value })} rows={3}
          className="w-full px-3 py-2 rounded-md text-xs bg-card border border-border focus:outline-none focus:border-foreground/20 resize-none" />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[10px] font-semibold text-foreground/40 uppercase tracking-wider">自定义字段</label>
          <button onClick={() => setCreativeForm({ customFields: [...creativeForm.customFields, { key: '', value: '', _uid: crypto.randomUUID() }] })}
            className="w-4 h-4 flex items-center justify-center rounded bg-transparent border border-border cursor-pointer text-foreground/20 hover:text-foreground/50">
            <Plus size={10} />
          </button>
        </div>
        {creativeForm.customFields.map((f, i) => (
          <div key={f._uid ?? i} className="flex gap-1.5 mb-1.5">
            <input value={f.key}
              onChange={(e) => {
                const updated = creativeForm.customFields.map((x, j) => j === i ? { ...x, key: e.target.value } : x);
                setCreativeForm({ customFields: updated });
              }}
              placeholder="键" className="flex-1 h-7 px-2 rounded-md text-[11px] bg-card border border-border focus:outline-none" />
            <input value={f.value}
              onChange={(e) => {
                const updated = creativeForm.customFields.map((x, j) => j === i ? { ...x, value: e.target.value } : x);
                setCreativeForm({ customFields: updated });
              }}
              placeholder="值" className="flex-[2] h-7 px-2 rounded-md text-[11px] bg-card border border-border focus:outline-none" />
            <button onClick={() => setCreativeForm({ customFields: creativeForm.customFields.filter((_, j) => j !== i) })}
              className="w-5 h-7 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-foreground/15 hover:text-red-500/60">
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
  const { stepText, streaming, generating, saving, regenerateCandidates } = useInitializerStore();
  const text = stepText[step] ?? '';
  const hasText = !!text.trim();

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {!hasText && !streaming ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-10 h-10 rounded-full bg-foreground/[0.04] flex items-center justify-center mb-3">
            <RefreshCw size={16} className="text-foreground/25" />
          </div>
          <p className="text-[12px] font-medium text-foreground/50 mb-1">还没有{title}方案</p>
          <p className="text-[10px] text-foreground/30 max-w-[260px] leading-relaxed mb-3">
            点击下方按钮，AI 将根据前序设定生成一份完整的{title}方案
          </p>
          <button
            onClick={() => void regenerateCandidates()}
            disabled={saving || generating}
            className="flex items-center gap-1.5 h-8 px-4 rounded-md text-[11px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-50"
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
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] text-foreground/30">
              {streaming ? '正在生成...' : '生成完毕后点击"下一步"确认落库'}
            </span>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/60 bg-card border border-border rounded-lg p-3">
            {text || '...'}
          </pre>
        </>
      )}
    </div>
  );
}

/* ─── Step 4: Outline Document Preview（流式，按卷生成） ─── */

function StepOutlinePreview() {
  const volumes = useEntityStore((s) => s.volumes);
  const chapters = useEntityStore((s) => s.chapters);
  const { stepText, streaming, generating, saving, regenerateCandidates } = useInitializerStore();
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
          <div className="text-center">
            <span className="text-[11px] font-semibold text-foreground/50">设定大纲参数</span>
          </div>
          <div>
            <label className="text-[10px] text-foreground/35 block mb-1">卷数 (1-10)</label>
            <input type="number" min={1} max={10} value={volCount}
              onChange={(e) => setVolCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
              className="w-full h-8 px-3 rounded-md text-xs bg-card border border-border focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-foreground/35 block mb-1">每卷章数（逗号分隔）</label>
            <input value={chPerVol} onChange={(e) => setChPerVol(e.target.value)}
              placeholder="5,5" className="w-full h-8 px-3 rounded-md text-xs bg-card border border-border focus:outline-none" />
          </div>
          <button onClick={handleGenerate} disabled={generating || saving}
            className="w-full h-9 rounded-md text-xs bg-foreground text-background border-none cursor-pointer font-medium disabled:opacity-50">
            {generating ? '生成中...' : 'AI 生成大纲方案'}
          </button>
          <p className="text-[10px] text-foreground/30 text-center leading-relaxed">
            按指定卷章数流式生成单份大纲，含卷摘要、章摘要、场景节点（时间/角色/情节线）
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
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

      <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/60 bg-card border border-border rounded-lg p-3">
        {text || '...'}
      </pre>

      {/* 已保存卷/章预览 */}
      {volumes.length > 0 && (
        <div className="mt-2 pt-3 border-t border-border">
          <div className="text-[10px] font-semibold text-foreground/35 uppercase tracking-wider mb-2">已生成大纲</div>
          {volumes.map((vol) => {
            const volChapters = chapters.filter((ch) => ch.volumeId === vol.id).sort((a, b) => a.sortOrder - b.sortOrder);
            return (
              <div key={vol.id} className="mb-3">
                <div className="text-[13px] font-bold text-foreground/80">{vol.title}</div>
                {vol.summary && <div className="text-[10px] text-foreground/35 mb-1">{vol.summary}</div>}
                <div className="border-t border-border pt-1.5 space-y-1">
                  {volChapters.map((ch) => (
                    <div key={ch.id} className="flex items-start gap-2 pl-2">
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
    isOpen, currentStep,
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
        className="fixed top-0 right-0 z-50 h-full w-[520px] bg-background/95 backdrop-blur-md border-l border-border shadow-2xl flex flex-col theme-surface"
        style={{ animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-foreground/80">创作设定</span>
            <span className="text-[9px] text-foreground/25 bg-foreground/[0.04] px-1.5 py-0.5 rounded">
              {currentStep + 1}/7
            </span>
          </div>
          <button onClick={close}
            className="w-6 h-6 flex items-center justify-center rounded text-foreground/20 hover:text-foreground/50 bg-transparent border-none cursor-pointer">
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Step indicator */}
        <StepIndicator current={currentStep} total={7} />

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
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <span className="text-[10px] text-red-500/70 flex-1">{error}</span>
              <button onClick={clearError} className="text-[10px] text-foreground/30 hover:text-foreground/50 bg-transparent border-none cursor-pointer">关闭</button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {showRegenerate && (
                <button onClick={handleRegenerate}
                  disabled={saving || generating}
                  className="flex items-center gap-1 h-7 px-2.5 rounded-md text-[10px] text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.03] bg-transparent border border-border cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
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
                className="h-7 px-2.5 rounded-md text-[10px] text-foreground/30 hover:text-foreground/50 hover:bg-foreground/[0.03] bg-transparent border border-border cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                跳过
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {!isFirstStep && (
                <button onClick={prevStep}
                  disabled={saving || generating || streaming}
                  className="flex items-center gap-1 h-7 px-3 rounded-md text-[10px] text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.03] bg-transparent border border-border cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronLeft size={12} />
                  上一步
                </button>
              )}
              {isLastStep ? (
                <button onClick={handleFinish}
                  disabled={saving}
                  className="flex items-center gap-1 h-7 px-4 rounded-md text-[10px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                  {saving ? (
                    <>
                      <span className="w-3 h-3 border-2 border-background/40 border-t-background rounded-full animate-spin" />
                      保存中...
                    </>
                  ) : (
                    <>
                      <Check size={12} />
                      完成初始化
                    </>
                  )}
                </button>
              ) : (
                <button onClick={handleNextStep}
                  disabled={saving || generating || streaming}
                  className="flex items-center gap-1 h-7 px-4 rounded-md text-[10px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
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
