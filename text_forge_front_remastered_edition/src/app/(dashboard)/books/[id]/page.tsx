'use client';

import { useState } from 'react';
import { Card } from '@/shared/ui/card';
import { cn } from '@/shared/lib/cn';
import { FileText, Users, Search, ChevronRight } from 'lucide-react';

export default function BookDetailPage() {
  const [activePanel, setActivePanel] = useState('outline');
  const [activeTab, setActiveTab] = useState(0);

  const tabs = ['概览', '大纲', '设定', '统计', '卡片'];

  const outline = [
    { id: 'v1', title: '第一卷 · 开端', chs: 3, chapters: ['第1章 · 流放者的日常', '第2章 · 未知信号', '第3章 · 抉择'] },
    { id: 'v2', title: '第二卷 · 对抗', chs: 5, chapters: ['第4章 · 黑域空间站', '第5章 · 舰长的日志', '第6章 · 帝国追兵'] },
    { id: 'v3', title: '第三卷 · 真相', chs: 4, chapters: ['第9章 · 柯伊伯之眼', '第10章 · 信号解密', '第11章 · 舰长的遗言', '第12章 · 新黎明'] },
  ];

  return (
    <div className="ide-grid ide-grid--tabbar ide-grid--sidebar ide-grid--agent">
      {/* 标签栏 */}
      <div className="ide-tabbar">
        {tabs.map((label, i) => (
          <button
            key={label}
            onClick={() => setActiveTab(i)}
            className={cn('ide-tab border-none bg-transparent cursor-pointer', activeTab === i && 'is-active')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Activity Bar */}
      <div className="ide-activity">
        {[
          { id: 'outline', icon: FileText, label: '大纲' },
          { id: 'characters', icon: Users, label: '角色' },
          { id: 'search', icon: Search, label: '搜索' },
        ].map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setActivePanel(id)}
            className={cn('ide-activity-btn', activePanel === id && 'is-active')}
            title={label}
          >
            <Icon size={18} strokeWidth={1.5} />
          </button>
        ))}
      </div>
      <aside className="ide-sidebar">
        <div className="ide-sidebar-header">
          大纲
          <button className="text-muted-foreground text-xs hover:text-foreground cursor-pointer bg-transparent border-none">+</button>
        </div>
        <div className="ide-sidebar-body p-1">
          {outline.map((vol) => (
            <div key={vol.id}>
              <div className="ide-outline-row ide-outline-row--volume">
                <ChevronRight size={12} className="ol-twistie text-muted-foreground shrink-0" />
                <span className="ol-label">{vol.title}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{vol.chs} 章</span>
              </div>
              {vol.chapters?.map((ch) => (
                <div key={ch} className="ide-outline-row ide-outline-row--chapter" role="button" tabIndex={0}>
                  <span className="ol-label">{ch}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="ide-sidebar-footer space-y-0.5">
          <div className="ide-sidebar-stat"><span>总卷数</span><span>3</span></div>
          <div className="ide-sidebar-stat"><span>总章节</span><span>12</span></div>
          <div className="ide-sidebar-stat"><span>总字数</span><span>87,342</span></div>
        </div>
      </aside>

      {/* 工作区 */}
      <main className="ide-editor">
        <div className="ide-editor-body">
          <div className="mb-6">
            <h1 className="text-xl font-semibold mb-1">星辰的回响</h1>
            <p className="text-xs text-muted-foreground">阿斯特拉在流放中收到来自柯伊伯带深处的神秘信号，一场跨越星海的冒险就此展开……</p>
          </div>

          <div className="grid grid-cols-4 gap-3 mb-6">
            {[['12', '章节'], ['87,342', '总字数'], ['8', '角色'], ['87%', '进度']].map(([v, l]) => (
              <Card key={l} className="p-3 text-center">
                <div className="text-lg font-semibold tabular-nums">{v}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{l}</div>
              </Card>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-[var(--sidebar-hover)] rounded-lg px-3 py-2 mb-6">
            <span className="shrink-0">流程</span>
            {[
              { l: '策划', c: 'text-foreground/80' },
              { l: '写手', c: 'text-muted-foreground' },
              { l: '校对', c: 'text-foreground' },
            ].map(({ l, c }, i) => (
              <span key={l} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={10} className="text-border" />}
                <span className={cn('text-[11px] font-medium', c)}>{l}</span>
              </span>
            ))}
            <span className="ml-auto text-foreground text-[10px] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-foreground" />就绪
            </span>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">最近章节</div>
            <div className="space-y-1.5">
              {[
                { o: 12, t: '新黎明', s: '阿斯特拉将星图碎片嵌入校准仪，金属卡槽发出沉闷的咔嗒声，全息投影中浮现出一条通往未知星域的航线……', vol: '第三卷', w: '2,847', d: '2小时前' },
                { o: 11, t: '舰长的遗言', s: '舰长留下的加密坐标指向帝国隐藏的信号中转站，阿斯特拉意识到自己卷入的远比想象中更大……', vol: '第三卷', w: '3,120', d: '3天前' },
              ].map((ch) => (
                <div key={ch.o} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-foreground/10 cursor-pointer transition-all">
                  <span className="text-xs text-muted-foreground w-5 text-center shrink-0 tabular-nums">{ch.o}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{ch.t}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">{ch.s}</div>
                    <div className="text-[11px] text-muted-foreground mt-1 flex gap-3">
                      <span>{ch.vol}</span>
                      <span>{ch.d}</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">{ch.w} 字</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
