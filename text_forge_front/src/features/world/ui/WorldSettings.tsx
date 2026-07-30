import { useState } from 'react';
import { LocationPanel } from './LocationPanel';
import { TimelinePanel } from './TimelinePanel';
import { ForeshadowingPanel } from './ForeshadowingPanel';
import { PlotThreadPanel } from './PlotThreadPanel';
import { Map, Clock, Eye, GitBranch } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type WorldTab = 'locations' | 'timeline' | 'foreshadowings' | 'plot-threads';

const TABS: { value: WorldTab; label: string; icon: typeof Map }[] = [
  { value: 'locations', label: '地点', icon: Map },
  { value: 'timeline', label: '时间线', icon: Clock },
  { value: 'foreshadowings', label: '伏笔', icon: Eye },
  { value: 'plot-threads', label: '情节脉络', icon: GitBranch },
];

interface WorldSettingsProps {
  bookId: number;
}

export function WorldSettings({ bookId }: WorldSettingsProps) {
  const [activeTab, setActiveTab] = useState<WorldTab>('locations');

  return (
    <Card>
      <CardHeader>
        <CardTitle>世界构建</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 border-b pb-2 mb-4">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.value}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeTab === tab.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                onClick={() => setActiveTab(tab.value)}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
        {activeTab === 'locations' && <LocationPanel bookId={bookId} />}
        {activeTab === 'timeline' && <TimelinePanel bookId={bookId} />}
        {activeTab === 'foreshadowings' && <ForeshadowingPanel bookId={bookId} />}
        {activeTab === 'plot-threads' && <PlotThreadPanel bookId={bookId} />}
      </CardContent>
    </Card>
  );
}