'use client';

import { X } from 'lucide-react';
import type { WorkflowNode } from '@/shared/api/workflows';

const CONTEXT_FIELD_LABELS: Record<string, string> = {
  book_info: '书籍基本信息',
  creative_settings: '创意设定',
  characters: '角色档案',
  locations: '地点列表',
  chapter_summaries: '章节摘要',
  recent_chapters: '近期章节',
  chapter_content: '章节正文',
  outline_structure: '大纲结构',
  scene_events: '场景事件',
  foreshadowings: '伏笔列表',
  plot_threads: '剧情线索',
};

const ALL_CONTEXT_FIELDS = Object.keys(CONTEXT_FIELD_LABELS);

interface InspectorPanelProps {
  node: WorkflowNode | null;
  onChange: (patch: Partial<WorkflowNode>) => void;
  onClose: () => void;
}

export function InspectorPanel({ node, onChange, onClose }: InspectorPanelProps) {
  if (!node) {
    return (
      <div className="w-[280px] shrink-0 border-l border-[#1c1b1a]/[0.08] bg-[#f4f3f0] p-6 flex items-center justify-center">
        <span className="text-[11px] text-[#1c1b1a]/30">选择一个节点编辑属性</span>
      </div>
    );
  }

  const contextFields = node.contextFields || [];
  const toggleField = (field: string) => {
    const next = contextFields.includes(field)
      ? contextFields.filter((f) => f !== field)
      : [...contextFields, field];
    onChange({ contextFields: next });
  };

  return (
    <div className="w-[280px] shrink-0 border-l border-[#1c1b1a]/[0.08] bg-[#f4f3f0] overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1c1b1a]/[0.06]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#1c1b1a]/30">节点属性</span>
        <button onClick={onClose} className="w-5 h-5 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-[#1c1b1a]/20 hover:text-[#1c1b1a]/50">
          <X size={12} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <label className="text-[11px] text-[#1c1b1a]/50 block mb-1 font-medium">标签</label>
          <input
            value={node.label}
            onChange={(e) => onChange({ label: e.target.value })}
            className="w-full h-8 px-2 rounded-md text-xs bg-white border border-[#1c1b1a]/[0.10] focus:outline-none focus:border-[#1c1b1a]/[0.20]"
          />
        </div>

        <div>
          <label className="text-[11px] text-[#1c1b1a]/50 block mb-1 font-medium">执行器</label>
          <select
            value={node.executor || 'main'}
            onChange={(e) => onChange({ executor: e.target.value as WorkflowNode['executor'] })}
            className="w-full h-8 px-2 rounded-md text-xs bg-white border border-[#1c1b1a]/[0.10] focus:outline-none"
          >
            <option value="main">主生成模型</option>
            <option value="audit">审计模型</option>
          </select>
        </div>

        <div>
          <label className="text-[11px] text-[#1c1b1a]/50 block mb-1 font-medium">
            系统提示词
          </label>
          <textarea
            value={node.systemPrompt || ''}
            onChange={(e) => onChange({ systemPrompt: e.target.value })}
            placeholder="定义该角色节点的写作要求..."
            className="w-full h-28 px-2 py-1.5 rounded-md text-xs bg-white border border-[#1c1b1a]/[0.10] focus:outline-none focus:border-[#1c1b1a]/[0.20] resize-none"
          />
        </div>

        <div>
          <label className="text-[11px] text-[#1c1b1a]/50 block mb-2 font-medium">
            上下文
          </label>
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {ALL_CONTEXT_FIELDS.map((field) => (
              <label
                key={field}
                className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-[#1c1b1a]/[0.02]"
              >
                <input
                  type="checkbox"
                  checked={contextFields.includes(field)}
                  onChange={() => toggleField(field)}
                  className="w-3 h-3 rounded border-[#1c1b1a]/[0.15]"
                />
                <span className="text-[11px] text-[#1c1b1a]/60">
                  {CONTEXT_FIELD_LABELS[field] || field}
                </span>
              </label>
            ))}
          </div>
          <button
            onClick={() => onChange({ contextFields: [] })}
            className="w-full mt-2 py-1 text-[10px] text-[#1c1b1a]/30 hover:text-[#1c1b1a]/50 bg-transparent border border-dashed border-[#1c1b1a]/[0.08] rounded cursor-pointer"
          >
            自动匹配
          </button>
        </div>
      </div>
    </div>
  );
}
