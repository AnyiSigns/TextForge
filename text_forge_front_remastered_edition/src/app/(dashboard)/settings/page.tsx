'use client';

import { useEffect, useState } from 'react';
import { Settings, User, Palette, Boxes, Cpu } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { PageContainer } from '@/shared/ui/PageContainer';
import { PageHeader } from '@/shared/ui/PageHeader';
import { ProfileTab } from '@/features/settings/components/ProfileTab';
import { AppearanceTab } from '@/features/settings/components/AppearanceTab';
import { ModelTab } from '@/features/settings/components/ModelTab';
import { AgentInsightsPanel } from '@/features/agent/AgentInsightsPanel';

const TABS = [
  { value: 'profile', label: '用户', icon: User },
  { value: 'appearance', label: '外观', icon: Palette },
  { value: 'model', label: '模型', icon: Boxes },
  { value: 'agent', label: 'Agent', icon: Cpu },
] as const;

type Tab = typeof TABS[number]['value'];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // SSR 水合一次性守卫：mounted 用于避免服务端/客户端渲染差异，非级联渲染来源
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  return (
    <PageContainer>
      <PageHeader
        icon={Settings}
        title="设置"
        description="管理你的个人资料、界面外观与模型配置"
      />

      <div className="px-6 py-5 flex gap-5 items-start">
        <nav className="w-40 shrink-0 flex flex-col gap-0.5" aria-label="设置分区">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  'flex items-center gap-2 px-3 h-9 rounded-lg text-[13px] font-medium transition-all duration-150 whitespace-nowrap cursor-pointer',
                  active
                    ? 'bg-foreground/5 text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <Icon size={15} strokeWidth={1.8} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex-1 min-w-0 space-y-5">
          {/* Tab 面板全部常驻挂载（CSS 隐藏而非卸载），保留未保存编辑态与加载数据，
              与原实现「state 提升到 SettingsPage 顶层」的保活行为一致 */}
          <div className={activeTab === 'profile' ? '' : 'hidden'}>
            <ProfileTab />
          </div>

          <div className={activeTab === 'appearance' ? '' : 'hidden'}>
            <AppearanceTab mounted={mounted} />
          </div>

          <div className={activeTab === 'model' ? '' : 'hidden'}>
            <ModelTab />
          </div>

          {/* 2.4：Agent 运行洞察（写操作审计 / 回合指标读取端点接入）
              面板自身有数据加载副作用且无编辑态，保持条件渲染（切到 Agent tab 才加载） */}
          {activeTab === 'agent' && <AgentInsightsPanel />}
        </div>
      </div>
    </PageContainer>
  );
}
