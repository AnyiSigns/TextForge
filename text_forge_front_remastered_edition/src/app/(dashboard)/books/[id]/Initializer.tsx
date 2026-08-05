'use client';

import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Check, Lock, RefreshCw, Plus } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useInitializerStore, STEP_LABELS } from '@/features/map/stores/initializerStore';
import { useEntityStore } from '@/features/map/stores/entityStore';

/* ─── Step-specific content components ─── */

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="px-4 py-3 border-b border-[#1c1b1a]/[0.06] flex-shrink-0">
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
                      background: isDone ? 'rgba(28,27,26,0.4)' : isCurrent ? 'linear-gradient(to right, rgba(28,27,26,0.4), rgba(28,27,26,0.1))' : 'rgba(28,27,26,0.06)',
                    }}
                  />
                )}
                <div
                  className={cn(
                    'rounded-full flex-shrink-0 transition-all duration-300',
                    isCurrent
                      ? 'w-[6px] h-[6px] bg-[#1c1b1a]/80 shadow-[0_0_0_4px_rgba(28,27,26,0.08)]'
                      : isDone
                        ? 'w-[4px] h-[4px] bg-[#1c1b1a]/40'
                        : 'w-[4px] h-[4px] bg-[#1c1b1a]/[0.08]',
                  )}
                />
              </div>
              <span
                className={cn(
                  'text-[8px] mt-0.5 transition-colors',
                  isCurrent ? 'text-[#1c1b1a]/70 font-semibold' : isDone ? 'text-[#1c1b1a]/25' : 'text-[#1c1b1a]/[0.10]',
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

function PulseIndicator() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="relative w-4 h-4">
        <div className="absolute inset-0 rounded-full bg-[#1c1b1a]/30 animate-pulse-outer" />
        <div className="absolute inset-[4px] rounded-full bg-[#1c1b1a]/40 animate-pulse-inner" />
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
        <label className="text-[10px] font-semibold text-[#1c1b1a]/40 uppercase tracking-wider block mb-1.5">方案名称</label>
        <input value={creativeForm.name} onChange={(e) => setCreativeForm({ name: e.target.value })} placeholder="星辰纪元"
          className="w-full h-8 px-3 rounded-md text-xs bg-[#fafaf8] border border-[#1c1b1a]/[0.08] focus:outline-none focus:border-[#1c1b1a]/[0.18]" />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-[#1c1b1a]/40 uppercase tracking-wider block mb-1.5">文风基调</label>
        <input value={creativeForm.tone} onChange={(e) => setCreativeForm({ tone: e.target.value })} placeholder="史诗奇幻、轻松幽默、黑暗残酷..."
          className="w-full h-8 px-3 rounded-md text-xs bg-[#fafaf8] border border-[#1c1b1a]/[0.08] focus:outline-none focus:border-[#1c1b1a]/[0.18]" />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-[#1c1b1a]/40 uppercase tracking-wider block mb-1.5">世界观</label>
        <textarea value={creativeForm.worldview} onChange={(e) => setCreativeForm({ worldview: e.target.value })} rows={5}
          placeholder="一个由星辰之力驱动的奇幻世界..."
          className="w-full px-3 py-2 rounded-md text-xs bg-[#fafaf8] border border-[#1c1b1a]/[0.08] focus:outline-none focus:border-[#1c1b1a]/[0.18] resize-none" />
      </div>
      <div>
        <label className="text-[10px] font-semibold text-[#1c1b1a]/40 uppercase tracking-wider block mb-1.5">写作禁忌</label>
        <textarea value={creativeForm.taboos} onChange={(e) => setCreativeForm({ taboos: e.target.value })} rows={3}
          className="w-full px-3 py-2 rounded-md text-xs bg-[#fafaf8] border border-[#1c1b1a]/[0.08] focus:outline-none focus:border-[#1c1b1a]/[0.18] resize-none" />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[10px] font-semibold text-[#1c1b1a]/40 uppercase tracking-wider">自定义字段</label>
          <button onClick={() => setCreativeForm({ customFields: [...creativeForm.customFields, { key: '', value: '' }] })}
            className="w-4 h-4 flex items-center justify-center rounded bg-transparent border border-[#1c1b1a]/[0.08] cursor-pointer text-[#1c1b1a]/20 hover:text-[#1c1b1a]/50">
            <Plus size={10} />
          </button>
        </div>
        {creativeForm.customFields.map((f, i) => (
          <div key={i} className="flex gap-1.5 mb-1.5">
            <input value={f.key}
              onChange={(e) => {
                const updated = creativeForm.customFields.map((x, j) => j === i ? { ...x, key: e.target.value } : x);
                setCreativeForm({ customFields: updated });
              }}
              placeholder="键" className="flex-1 h-7 px-2 rounded-md text-[11px] bg-[#fafaf8] border border-[#1c1b1a]/[0.08] focus:outline-none" />
            <input value={f.value}
              onChange={(e) => {
                const updated = creativeForm.customFields.map((x, j) => j === i ? { ...x, value: e.target.value } : x);
                setCreativeForm({ customFields: updated });
              }}
              placeholder="值" className="flex-[2] h-7 px-2 rounded-md text-[11px] bg-[#fafaf8] border border-[#1c1b1a]/[0.08] focus:outline-none" />
            <button onClick={() => setCreativeForm({ customFields: creativeForm.customFields.filter((_, j) => j !== i) })}
              className="w-5 h-7 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-[#1c1b1a]/15 hover:text-red-500/60">
              <X size={10} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Step 1: Location TreeView ─── */

function StepLocationTree() {
  const locations = useEntityStore((s) => s.locations);
  const roots = locations.filter((l) => l.parentId === null || l.parentId === 1);
  const getChildren = (parentId: number) => locations.filter((l) => l.parentId === parentId);

  const LocationRow = ({ id, depth = 0 }: { id: number; depth?: number }) => {
    const loc = locations.find((l) => l.id === id);
    if (!loc) return null;
    const children = getChildren(id);
    const [expanded, setExpanded] = useState(depth < 3);

    return (
      <div>
        <div
          className="flex items-center gap-1.5 py-1.5 hover:bg-[#1c1b1a]/[0.02] rounded transition-colors cursor-default"
          style={{ paddingLeft: 8 + depth * 20 }}
        >
          {children.length > 0 ? (
            <button onClick={() => setExpanded(!expanded)}
              className="w-4 h-4 flex items-center justify-center bg-transparent border-none cursor-pointer text-[#1c1b1a]/20">
              {expanded ? <ChevronRight size={10} className="rotate-90" /> : <ChevronRight size={10} />}
            </button>
          ) : <div className="w-4" />}
          <span className="text-[12px] text-[#1c1b1a]/70 truncate">{loc.name}</span>
          <span className="text-[8px] text-[#1c1b1a]/20 bg-[#1c1b1a]/[0.04] px-1.5 py-px rounded ml-auto shrink-0">
            {loc.type}
          </span>
        </div>
        {expanded && children.map((ch) => <LocationRow key={ch.id} id={ch.id} depth={depth + 1} />)}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-[#1c1b1a]/30 tabular-nums">{locations.length} 个地点</span>
      </div>
      {roots.map((r) => <LocationRow key={r.id} id={r.id} />)}
    </div>
  );
}

/* ─── Generic Card Grid (Steps 2,3,5,6) ─── */

function CardGridStep({ step }: { step: number }) {
  const { candidates, lockedIds, toggleLock } = useInitializerStore();
  const [editingField, setEditingField] = useState<string | null>(null);
  const items = candidates[step] ?? [];

  const handleFieldEdit = (cardId: string, fieldKey: string, newValue: string) => {
    // 直接修改 candidates 数组中的值
    const store = useInitializerStore.getState();
    const newCandidates = store.candidates.map((stepCandidates, si) => {
      if (si !== step) return stepCandidates;
      return stepCandidates.map((c) => {
        if (c.id !== cardId) return c;
        return {
          ...c,
          fields: c.fields.map((f) =>
            f.key === fieldKey ? { ...f, value: newValue } : f,
          ),
        };
      });
    });
    useInitializerStore.setState({ candidates: newCandidates });
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] text-[#1c1b1a]/30">点击锁定，已选 {items.filter((c) => lockedIds.has(c.id)).length}/{items.length}</span>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {items.map((c) => {
          const isLocked = lockedIds.has(c.id);
          const desc = c.fields.find((f) => f.key === '描述')?.value ?? '';
          const roleType = c.fields.find((f) => f.key === '角色类型')?.value ?? '';

          return (
            <div
              key={c.id}
              className={cn(
                'relative rounded-xl border p-3 transition-all duration-200',
                isLocked
                  ? 'border-[#1c1b1a]/[0.20] bg-[#1c1b1a]/[0.03] shadow-[0_2px_12px_rgba(28,27,26,0.04)]'
                  : 'border-[#1c1b1a]/[0.06] bg-[#fafaf8] hover:border-[#1c1b1a]/[0.14] hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(28,27,26,0.06)]',
              )}
            >
              <button
                onClick={() => toggleLock(step, c.id)}
                className={cn(
                  'absolute top-2 right-2 z-10 w-5 h-5 flex items-center justify-center rounded-full transition-all cursor-pointer border',
                  isLocked ? 'bg-[#1c1b1a]/[0.06] border-[#1c1b1a]/[0.18] text-[#1c1b1a]/60' : 'bg-transparent border-[#1c1b1a]/[0.06] text-[#1c1b1a]/15 hover:text-[#1c1b1a]/40',
                )}
              >
                <Lock size={10} strokeWidth={2} />
              </button>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-[#1c1b1a]/[0.06] flex items-center justify-center text-[#1c1b1a]/40 text-[10px] font-semibold shrink-0">
                  {c.title.charAt(0)}
                </div>
                <input
                  value={c.title}
                  onChange={(e) => {
                    const store = useInitializerStore.getState();
                    const newCandidates = store.candidates.map((stepCands, si) => {
                      if (si !== step) return stepCands;
                      return stepCands.map((x) =>
                        x.id === c.id ? { ...x, title: e.target.value } : x,
                      );
                    });
                    useInitializerStore.setState({ candidates: newCandidates });
                  }}
                  className="min-w-0 flex-1 text-[12px] font-semibold text-[#1c1b1a]/80 bg-transparent border-none outline-none p-0"
                />
                {roleType && <span className="text-[9px] text-[#1c1b1a]/30 shrink-0">{roleType}</span>}
              </div>

              {c.fields.map((f) => {
                const fieldId = `${c.id}-${f.key}`;
                const isEditing = editingField === fieldId;
                const isMultiline = (f.value?.length ?? 0) > 30;
                return (
                  <div key={f.key} className="mt-2">
                    <div className="text-[9px] text-[#1c1b1a]/25 mb-0.5">{f.key}</div>
                    {isEditing ? (
                      isMultiline ? (
                        <textarea
                          autoFocus
                          value={f.value}
                          onChange={(e) => handleFieldEdit(c.id, f.key, e.target.value)}
                          onBlur={() => setEditingField(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingField(null);
                          }}
                          rows={3}
                          className="w-full px-2 py-1.5 rounded-md text-[11px] leading-relaxed text-[#1c1b1a]/70 bg-[#fafaf8] border border-[#1c1b1a]/[0.12] focus:outline-none focus:border-[#1c1b1a]/[0.25] resize-none"
                        />
                      ) : (
                        <input
                          autoFocus
                          value={f.value}
                          onChange={(e) => handleFieldEdit(c.id, f.key, e.target.value)}
                          onBlur={() => setEditingField(null)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingField(null);
                          }}
                          className="w-full px-2 py-1.5 rounded-md text-[11px] text-[#1c1b1a]/70 bg-[#fafaf8] border border-[#1c1b1a]/[0.12] focus:outline-none focus:border-[#1c1b1a]/[0.25]"
                        />
                      )
                    ) : (
                      <div
                        onClick={() => setEditingField(fieldId)}
                        className="text-[11px] leading-relaxed text-[#1c1b1a]/50 cursor-text rounded px-2 py-1.5 -mx-2 hover:bg-[#1c1b1a]/[0.03] hover:text-[#1c1b1a]/65 transition-colors min-h-[1.5em]"
                      >
                        {f.value || <span className="text-[#1c1b1a]/15 italic">点击编辑...</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Step 4: Outline Document Preview ─── */

function StepOutlinePreview() {
  const volumes = useEntityStore((s) => s.volumes);
  const chapters = useEntityStore((s) => s.chapters);
  const [showConfig, setShowConfig] = useState(chapters.length === 0);
  const [volCount, setVolCount] = useState(2);
  const [chPerVol, setChPerVol] = useState('5,5');

  if (showConfig) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-[320px] space-y-4">
          <div className="text-center">
            <span className="text-[11px] font-semibold text-[#1c1b1a]/50">设定大纲参数</span>
          </div>
          <div>
            <label className="text-[10px] text-[#1c1b1a]/35 block mb-1">卷数 (1-10)</label>
            <input type="number" min={1} max={10} value={volCount}
              onChange={(e) => setVolCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
              className="w-full h-8 px-3 rounded-md text-xs bg-[#fafaf8] border border-[#1c1b1a]/[0.08] focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-[#1c1b1a]/35 block mb-1">每卷章数（逗号分隔）</label>
            <input value={chPerVol} onChange={(e) => setChPerVol(e.target.value)}
              placeholder="5,5" className="w-full h-8 px-3 rounded-md text-xs bg-[#fafaf8] border border-[#1c1b1a]/[0.08] focus:outline-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowConfig(false)}
              className="flex-1 h-8 rounded-md text-xs border border-[#1c1b1a]/[0.08] bg-transparent text-[#1c1b1a]/40 cursor-pointer">取消</button>
            <button onClick={() => setShowConfig(false)}
              className="flex-1 h-8 rounded-md text-xs bg-[#1c1b1a] text-[#f4f3f0] border-none cursor-pointer font-medium">确认生成</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {volumes.map((vol) => {
        const volChapters = chapters.filter((ch) => ch.volumeId === vol.id).sort((a, b) => a.sortOrder - b.sortOrder);
        return (
          <div key={vol.id} className="mb-4">
            <div className="text-[14px] font-bold text-[#1c1b1a]/80 mb-0.5">{vol.title}</div>
            {vol.summary && <div className="text-[10px] text-[#1c1b1a]/35 mb-2">{vol.summary}</div>}
            <div className="border-t border-[#1c1b1a]/[0.06] pt-2 space-y-1.5">
              {volChapters.map((ch) => (
                <div key={ch.id} className="flex items-start gap-2 pl-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#1c1b1a]/[0.12] mt-1.5 flex-shrink-0" />
                  <div>
                    <div className="text-[11px] font-medium text-[#1c1b1a]/70">{ch.title}</div>
                    {ch.summary && <div className="text-[10px] text-[#1c1b1a]/35">{ch.summary}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Main Initializer Component ─── */

export function Initializer() {
  const {
    isOpen, currentStep, lockedIds,
    close, nextStep, prevStep,
    regenerateCandidates, finish,
    saving, generating, error, clearError,
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
        className="fixed inset-0 z-40 bg-[#1c1b1a]/[0.02] backdrop-blur-[2px]"
        onClick={close}
      />

      <div
        className="fixed top-0 right-0 z-50 h-full w-[520px] bg-[#f4f3f0]/98 backdrop-blur-md border-l border-[#1c1b1a]/[0.06] shadow-2xl flex flex-col"
        style={{ animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-12 border-b border-[#1c1b1a]/[0.06] flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[#1c1b1a]/80">创作设定</span>
            <span className="text-[9px] text-[#1c1b1a]/25 bg-[#1c1b1a]/[0.04] px-1.5 py-0.5 rounded">
              {currentStep + 1}/7
            </span>
          </div>
          <button onClick={close}
            className="w-6 h-6 flex items-center justify-center rounded text-[#1c1b1a]/20 hover:text-[#1c1b1a]/50 bg-transparent border-none cursor-pointer">
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Step indicator */}
        <StepIndicator current={currentStep} total={7} />

        {/* Content area */}
        {generating && currentStep !== 0 ? (
          <div className="flex-1">
            <PulseIndicator />
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {currentStep === 0 && <StepCreativeSetting />}
            {currentStep === 1 && <CardGridStep step={1} />}
            {currentStep === 4 && <CardGridStep step={4} />}
            {[2, 3, 5].includes(currentStep) && <CardGridStep step={currentStep} />}
            {currentStep === 6 && <CardGridStep step={currentStep} />}
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-[#1c1b1a]/[0.06] flex-shrink-0">
          {error && (
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <span className="text-[10px] text-red-500/70 flex-1">{error}</span>
              <button onClick={clearError} className="text-[10px] text-[#1c1b1a]/30 hover:text-[#1c1b1a]/50 bg-transparent border-none cursor-pointer">关闭</button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {showRegenerate && (
                <button onClick={handleRegenerate}
                  disabled={saving || generating}
                  className="flex items-center gap-1 h-7 px-2.5 rounded-md text-[10px] text-[#1c1b1a]/40 hover:text-[#1c1b1a]/70 hover:bg-[#1c1b1a]/[0.03] bg-transparent border border-[#1c1b1a]/[0.06] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                  {generating ? (
                    <span className="w-3 h-3 border-2 border-[#1c1b1a]/20 border-t-[#1c1b1a]/40 rounded-full animate-spin" />
                  ) : (
                    <RefreshCw size={11} />
                  )}
                  {generating ? '生成中...' : '重新生成'}
                </button>
              )}
              <button onClick={close}
                disabled={saving}
                className="h-7 px-2.5 rounded-md text-[10px] text-[#1c1b1a]/30 hover:text-[#1c1b1a]/50 hover:bg-[#1c1b1a]/[0.03] bg-transparent border border-[#1c1b1a]/[0.06] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                跳过
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {!isFirstStep && (
                <button onClick={prevStep}
                  disabled={saving}
                  className="flex items-center gap-1 h-7 px-3 rounded-md text-[10px] text-[#1c1b1a]/40 hover:text-[#1c1b1a]/70 hover:bg-[#1c1b1a]/[0.03] bg-transparent border border-[#1c1b1a]/[0.06] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronLeft size={12} />
                  上一步
                </button>
              )}
              {isLastStep ? (
                <button onClick={handleFinish}
                  disabled={saving}
                  className="flex items-center gap-1 h-7 px-4 rounded-md text-[10px] font-medium bg-[#1c1b1a] text-[#f4f3f0] hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                  {saving ? (
                    <>
                      <span className="w-3 h-3 border-2 border-[#f4f3f0]/40 border-t-[#f4f3f0] rounded-full animate-spin" />
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
                  className="flex items-center gap-1 h-7 px-4 rounded-md text-[10px] font-medium bg-[#1c1b1a] text-[#f4f3f0] hover:opacity-90 transition-opacity border-none cursor-pointer">
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
        @keyframes pulse-outer {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.8); opacity: 0; }
        }
        @keyframes pulse-inner {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
        .animate-pulse-outer { animation: pulse-outer 1.2s ease-in-out infinite; }
        .animate-pulse-inner { animation: pulse-inner 1.2s ease-in-out infinite; }
      `}</style>
    </>
  );
}
