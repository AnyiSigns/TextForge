'use client';

import { useEffect, useState } from 'react';
import { Users, MapPin, ListTree, Lightbulb, PanelLeftClose, Workflow as WorkflowIcon, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { listWorkflows, type Workflow } from '@/shared/api/workflows';
import { updateBook } from '@/shared/api/books';
import { CharacterList } from './CharacterList';
import { LocationTree } from './LocationTree';
import { OutlineTree } from './OutlineTree';
import { EntityPanel } from './EntityPanel';

type Tab = 'characters' | 'locations' | 'outline' | 'plot';

interface SidePanelProps {
  onClose: () => void;
}

export function SidePanel({ onClose }: SidePanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('locations');
  const bookId = useEntityStore((s) => s.book?.id ?? 1);
  const book = useEntityStore((s) => s.book);

  // 书籍工作流绑定：下拉选择后保存到 book.workflow_id，Agent 执行工作流时默认使用它
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [boundWfId, setBoundWfId] = useState('');
  const [savingWf, setSavingWf] = useState(false);

  useEffect(() => {
    listWorkflows()
      .then(setWorkflows)
      .catch(() => toast.error('工作流列表加载失败'));
  }, []);

  useEffect(() => {
    setBoundWfId(book?.workflowId ?? '');
  }, [book?.workflowId]);

  const handleSaveWorkflow = async () => {
    if (!book) return;
    setSavingWf(true);
    try {
      await updateBook(book.id, { workflowId: boundWfId || undefined });
      toast.success(boundWfId ? '工作流绑定已保存' : '已解除工作流绑定');
    } catch {
      toast.error('工作流绑定保存失败');
    } finally {
      setSavingWf(false);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'characters', label: '角色', icon: <Users size={15} strokeWidth={1.5} /> },
    { id: 'locations', label: '地点', icon: <MapPin size={15} strokeWidth={1.5} /> },
    { id: 'outline', label: '大纲', icon: <ListTree size={15} strokeWidth={1.5} /> },
    { id: 'plot', label: '伏笔', icon: <Lightbulb size={15} strokeWidth={1.5} /> },
  ];

  return (
    <div className="h-full flex flex-col bg-card/95 backdrop-blur-md border-r border-border/60 shadow-xl">
      <div className="flex border-b border-border/30">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-2.5 text-[11px] font-medium bg-transparent border-none cursor-pointer transition-colors ${
              activeTab === tab.id
                ? 'text-foreground border-b-2 border-foreground/30'
                : 'text-muted-foreground/60 hover:text-muted-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* 书籍工作流绑定 */}
      <div className="px-3 py-2.5 border-b border-border/30">
        <label className="text-[10px] font-medium text-muted-foreground/70 block mb-1 flex items-center gap-1">
          <WorkflowIcon size={11} strokeWidth={1.5} /> 书籍工作流
        </label>
        <div className="flex items-center gap-1">
          <select
            value={boundWfId}
            onChange={(e) => setBoundWfId(e.target.value)}
            className="flex-1 h-7 min-w-0 px-2 rounded-md text-[11px] bg-background border border-border focus:outline-none focus:border-foreground/20"
          >
            <option value="">未绑定（Agent 自动选择）</option>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleSaveWorkflow}
            disabled={savingWf}
            className="h-7 px-2 rounded-md text-[11px] bg-foreground text-background font-medium border-none cursor-pointer hover:opacity-90 disabled:opacity-40 flex items-center gap-1 shrink-0"
          >
            <Check size={11} strokeWidth={2} />
            {savingWf ? '…' : '保存'}
          </button>
        </div>
        <p className="text-[9px] text-muted-foreground/50 mt-1 leading-relaxed">
          绑定后 Agent 执行工作流时默认使用此工作流
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'characters' && <CharacterList />}
        {activeTab === 'locations' && <LocationTree />}
        {activeTab === 'outline' && <OutlineTree bookId={bookId} />}
        {activeTab === 'plot' && <EntityPanel />}
      </div>

      <div className="border-t border-border/30 p-2">
        <button
          onClick={onClose}
          className="w-full flex items-center justify-center gap-1.5 h-8 rounded-md text-xs text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5 bg-transparent border-none cursor-pointer transition-colors"
        >
          <PanelLeftClose size={13} strokeWidth={1.5} />
          收起面板
        </button>
      </div>
    </div>
  );
}
