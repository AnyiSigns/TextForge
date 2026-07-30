// src/app/(dashboard)/settings/page.tsx
'use client';

import { useState } from 'react';
import { ProcessNav } from '@/features/projects';
import { PageHeader } from '@/shared/components';
import { ModelsSettings } from '@/features/settings';
import { SlidersHorizontal, User, Palette, Sparkles, Boxes } from 'lucide-react';
import { ProfileSection } from './sections/ProfileSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { AiPrefSection } from './sections/AiPrefSection';
import { AdvancedSection } from './sections/AdvancedSection';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div className="page-shell">
      <PageHeader icon={SlidersHorizontal} title="设置" description="管理你的个人资料、界面外观、写作偏好与模型设置" />

      <ProcessNav
        tabs={[
          { value: 'profile', label: '个人信息', icon: User },
          { value: 'appearance', label: '外观', icon: Palette },
          { value: 'ai', label: 'AI 偏好', icon: Sparkles },
          { value: 'models', label: '模型', icon: Boxes },
          { value: 'advanced', label: '高级选项', icon: SlidersHorizontal },
        ]}
        value={activeTab}
        onValueChange={setActiveTab}
      >
        {activeTab === 'profile' && <ProfileSection />}
        {activeTab === 'appearance' && <AppearanceSection />}
        {activeTab === 'ai' && <AiPrefSection />}
        {activeTab === 'models' && <ModelsSettings />}
        {activeTab === 'advanced' && <AdvancedSection />}
      </ProcessNav>
    </div>
  );
}
