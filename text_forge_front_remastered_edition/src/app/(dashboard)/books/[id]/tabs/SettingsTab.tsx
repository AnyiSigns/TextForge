'use client';

import Link from 'next/link';
import { Card } from '@/shared/ui/card';
import { useBookDetailStore } from '../store';
import { Lock, MapPin, Clock, Eye, GitBranch, ArrowUpRight } from 'lucide-react';

export function SettingsTab() {
  const characters = useBookDetailStore((s) => s.characters);
  const locations = useBookDetailStore((s) => s.locations);
  const timelineEvents = useBookDetailStore((s) => s.timelineEvents);
  const foreshadowings = useBookDetailStore((s) => s.foreshadowings);
  const plotThreads = useBookDetailStore((s) => s.plotThreads);
  const creativeSetting = useBookDetailStore((s) => s.creativeSetting);
  const setActivePanel = useBookDetailStore((s) => s.setActivePanel);

  const worldStats = [
    { label: '地点', count: locations.length, icon: MapPin, locked: locations.filter((l) => l.locked).length },
    { label: '事件', count: timelineEvents.length, icon: Clock, locked: timelineEvents.filter((e) => e.locked).length },
    { label: '伏笔', count: foreshadowings.length, icon: Eye, locked: foreshadowings.filter((f) => f.locked).length },
    { label: '线索', count: plotThreads.length, icon: GitBranch, locked: plotThreads.filter((p) => p.locked).length },
  ];

  const allLocked = [
    ...characters.filter((c) => c.locked).map((c) => ({ id: c.id, label: c.name, type: '角色' as const, href: `/characters/${c.id}` })),
    ...locations.filter((l) => l.locked).map((l) => ({ id: l.id, label: l.name, type: '地点' as const, href: '' })),
    ...timelineEvents.filter((e) => e.locked).map((e) => ({ id: e.id, label: e.name, type: '事件' as const, href: '' })),
    ...foreshadowings.filter((f) => f.locked).map((f) => ({ id: f.id, label: f.description.slice(0, 20), type: '伏笔' as const, href: '' })),
    ...plotThreads.filter((p) => p.locked).map((p) => ({ id: p.id, label: p.name, type: '线索' as const, href: '' })),
  ];

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">角色</div>
          <Link href="/characters" className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground no-underline">
            查看全部 <ArrowUpRight size={10} />
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {characters.slice(0, 6).map((ch) => (
            <Link key={ch.id} href={`/characters/${ch.id}`} className="no-underline">
              <Card className="p-3 flex items-center gap-3 cursor-pointer hover:border-foreground/10 transition-all text-foreground">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0">
                  {ch.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{ch.name}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    {ch.roleType && <span className="bg-muted px-1 rounded">{ch.roleType}</span>}
                    {ch.relationshipChain?.length ? <span>{ch.relationshipChain.length}关系</span> : null}
                    {Object.keys(ch.customFields || {}).length > 0 && (
                      <span>{Object.keys(ch.customFields).length}属性</span>
                    )}
                  </div>
                </div>
                {ch.locked && <Lock size={12} className="text-muted-foreground shrink-0" />}
              </Card>
            </Link>
          ))}
          {characters.length === 0 && (
            <div className="col-span-3 text-xs text-muted-foreground p-3 text-center">暂无角色</div>
          )}
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">世界构建</div>
          <button
            onClick={() => setActivePanel('world')}
            className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer"
          >
            打开世界面板 <ArrowUpRight size={10} />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {worldStats.map(({ label, count, icon: Icon, locked }) => (
            <Card key={label} className="p-3 text-center cursor-pointer hover:border-foreground/10 transition-all"
              onClick={() => setActivePanel('world')}>
              <Icon size={16} className="text-muted-foreground mx-auto mb-1" />
              <div className="text-lg font-semibold tabular-nums">{count}</div>
              <div className="text-[11px] text-muted-foreground flex items-center justify-center gap-1">
                {label}
                {locked > 0 && <Lock size={9} className="text-muted-foreground" />}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {creativeSetting && (
        <div className="mb-6">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">创作设定</div>
          <Card className="p-4 space-y-3 text-sm">
            {creativeSetting.tone && (
              <div><span className="text-muted-foreground">文风：</span>{creativeSetting.tone}</div>
            )}
            {creativeSetting.worldview && (
              <div><span className="text-muted-foreground">世界观：</span>{creativeSetting.worldview}</div>
            )}
            {creativeSetting.writingTaboos && (
              <div><span className="text-muted-foreground">写作禁忌：</span>{creativeSetting.writingTaboos}</div>
            )}
            {Object.keys(creativeSetting.customDimensions || {}).length > 0 && (
              <div><span className="text-muted-foreground">自定义维度：</span>
                {Object.entries(creativeSetting.customDimensions).map(([k, v]) => (
                  <span key={k} className="ml-1 bg-muted px-1 rounded text-xs">{k}: {String(v)}</span>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {allLocked.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">锁定概览</div>
          <div className="space-y-1">
            {allLocked.map((item) => (
              <div key={`${item.type}-${item.id}`} className="flex items-center gap-2 text-xs p-1.5 rounded bg-card border border-border">
                <Lock size={10} className="text-muted-foreground shrink-0" />
                <span className="text-muted-foreground shrink-0">{item.type}</span>
                <span className="font-medium truncate">{item.label}</span>
                {item.href ? (
                  <Link href={item.href} className="ml-auto text-muted-foreground hover:text-foreground no-underline">
                    <ArrowUpRight size={10} />
                  </Link>
                ) : (
                  <ArrowUpRight size={10} className="ml-auto text-muted-foreground cursor-pointer" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
