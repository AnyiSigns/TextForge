'use client';

import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { useEntityStore } from '@/features/map/stores/entityStore';

interface CreativeSettingSidebarProps {
  bookId: number;
  onClose: () => void;
}

export function CreativeSettingSidebar({ onClose }: CreativeSettingSidebarProps) {
  const [tone, setTone] = useState('');
  const [worldview, setWorldview] = useState('');
  const [writingTaboos, setWritingTaboos] = useState('');
  const [customFields, setCustomFields] = useState<Array<{ key: string; value: string }>>([]);
  const [saving, setSaving] = useState(false);
  const creativeSetting = useEntityStore((s) => s.creativeSetting);
  const updateCreativeSetting = useEntityStore((s) => s.updateCreativeSetting);

  // 实体数据异步到达时同步本地编辑状态（渲染期间调整，React 会立即重渲染）
  const [prevCreativeSetting, setPrevCreativeSetting] = useState(creativeSetting);
  if (creativeSetting && prevCreativeSetting !== creativeSetting) {
    setPrevCreativeSetting(creativeSetting);
    setTone(creativeSetting.tone || '');
    setWorldview(creativeSetting.worldview || '');
    setWritingTaboos(creativeSetting.writingTaboos || '');
    if (creativeSetting.customDimensions && typeof creativeSetting.customDimensions === 'object') {
      const fields = Object.entries(creativeSetting.customDimensions).map(([key, value]) => ({
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
      }));
      setCustomFields(fields);
    } else {
      setCustomFields([]);
    }
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const dimensions: Record<string, unknown> = {};
      for (const { key, value } of customFields) {
        if (!key.trim()) continue;
        try { dimensions[key] = JSON.parse(value); } catch { dimensions[key] = value; }
      }
      await updateCreativeSetting({
        tone: tone || '',
        worldview: worldview || '',
        writingTaboos: writingTaboos || '',
        customDimensions: dimensions,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-[260px] h-full flex flex-col bg-card/98 backdrop-blur-md border-l border-border/60 shadow-xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">创作设定</span>
        <button onClick={onClose} className="w-5 h-5 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-muted-foreground/40 hover:text-foreground/60">
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider block mb-1.5">调性/文风</label>
          <textarea
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            rows={3}
            className="w-full px-2.5 py-1.5 rounded-md text-xs bg-background border border-border/60 focus:outline-none focus:border-foreground/20 resize-none"
            placeholder="史诗奇幻、轻松幽默..."
          />
        </div>

        <div>
          <label className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider block mb-1.5">世界观</label>
          <textarea
            value={worldview}
            onChange={(e) => setWorldview(e.target.value)}
            rows={5}
            className="w-full px-2.5 py-1.5 rounded-md text-xs bg-background border border-border/60 focus:outline-none focus:border-foreground/20 resize-none"
            placeholder="宇宙的起源，力量的体系..."
          />
        </div>

        <div>
          <label className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider block mb-1.5">写作禁忌</label>
          <textarea
            value={writingTaboos}
            onChange={(e) => setWritingTaboos(e.target.value)}
            rows={3}
            className="w-full px-2.5 py-1.5 rounded-md text-xs bg-background border border-border/60 focus:outline-none focus:border-foreground/20 resize-none"
            placeholder="禁止出现的内容..."
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">自定义维度</label>
            <button
              onClick={() => setCustomFields((prev) => [...prev, { key: '', value: '' }])}
              className="w-4 h-4 flex items-center justify-center rounded bg-transparent border border-border/40 cursor-pointer text-muted-foreground/40 hover:text-foreground/60"
            >
              <Plus size={10} />
            </button>
          </div>
          <div className="space-y-1.5">
            {customFields.map((field, i) => (
              <div key={i} className="flex gap-1.5">
                <input
                  value={field.key}
                  onChange={(e) => setCustomFields((prev) => prev.map((f, j) => j === i ? { ...f, key: e.target.value } : f))}
                  placeholder="键"
                  className="flex-1 h-7 px-2 rounded-md text-xs bg-background border border-border/60 focus:outline-none"
                />
                <input
                  value={field.value}
                  onChange={(e) => setCustomFields((prev) => prev.map((f, j) => j === i ? { ...f, value: e.target.value } : f))}
                  placeholder="值"
                  className="flex-[2] h-7 px-2 rounded-md text-xs bg-background border border-border/60 focus:outline-none"
                />
                <button
                  onClick={() => setCustomFields((prev) => prev.filter((_, j) => j !== i))}
                  className="w-5 h-7 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-muted-foreground/30 hover:text-destructive"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-border/30 p-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-8 rounded-md bg-foreground text-background text-xs font-medium border-none cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}
