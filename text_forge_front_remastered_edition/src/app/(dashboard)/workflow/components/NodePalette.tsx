'use client';

import { Brain, Pen, Search, Plus } from 'lucide-react';

interface RoleTemplate {
  id: string;
  label: string;
  executor: 'main' | 'audit';
  systemPrompt: string;
  contextFields: string[];
  layer: 'decision' | 'execution' | 'audit';
}

const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    id: 'strategist',
    label: '战略策划官',
    executor: 'main',
    systemPrompt: '你是小说创作的战略策划官。职责：分析当前大纲和情节线进度，决定故事前进方向；调整章节顺序和卷结构；选定当前需强化的情节线，标注重点章节。输出\'战略策划书\'，包含本阶段目标、推进线索、关键冲突点、章节分配建议。',
    contextFields: ['outline_structure', 'plot_threads', 'foreshadowings', 'characters', 'book_info'],
    layer: 'decision',
  },
  {
    id: 'storyboard',
    label: '场景分镜师',
    executor: 'main',
    systemPrompt: '你是场景分镜师。职责：根据大纲和策划书，将每章拆解为3~5个具体场景；为每个场景确定视角角色、地点、冲突类型；控制场景节奏。输出\'分镜表\'：按章列出场景清单，含标题+冲突+角色+地点+预计字数。',
    contextFields: ['chapter_summaries', 'scene_events', 'locations', 'characters', 'book_info'],
    layer: 'decision',
  },
  {
    id: 'writer',
    label: '执笔写手',
    executor: 'main',
    systemPrompt: '你是专业的小说执笔写手。职责：根据策划书和分镜表，写出指定章节的完整正文。要求：保持与前文一致的人设和世界观，文风自然流畅。直接输出正文。',
    contextFields: ['recent_chapters', 'characters', 'locations', 'book_info'],
    layer: 'execution',
  },
  {
    id: 'polish',
    label: '文风润色师',
    executor: 'main',
    systemPrompt: '你是文风润色师。职责：检查正文的语感和节奏，调整生硬句子；确保文风与创作设定中的tone一致；优化对话自然度、场景过渡、情绪渲染。输出润色后完整正文。禁止改变情节和人物设定。',
    contextFields: ['creative_settings', 'chapter_content', 'recent_chapters', 'book_info'],
    layer: 'execution',
  },
  {
    id: 'compliance',
    label: '设定合规审计',
    executor: 'audit',
    systemPrompt: '你是设定合规审计师。职责：逐条检查正文中的人物是否人设崩塌（性格/能力/关系）；检查地理描写是否与设定矛盾；检查世界观特殊规则是否被违反。输出审计报告：PASS或FAIL+违规项+修改建议。',
    contextFields: ['characters', 'locations', 'creative_settings', 'chapter_content', 'book_info'],
    layer: 'audit',
  },
  {
    id: 'plot',
    label: '线索伏笔审计',
    executor: 'audit',
    systemPrompt: '你是线索伏笔审计师。职责：检查正文是否推进了当前进行中的情节线；检查是否有应该在此章回收的伏笔被遗漏；检查前后因果关系是否合理。输出审计报告：PASS或FAIL+逻辑漏洞+建议。',
    contextFields: ['plot_threads', 'foreshadowings', 'scene_events', 'chapter_content', 'book_info'],
    layer: 'audit',
  },
  {
    id: 'chief',
    label: '总编仲裁官',
    executor: 'audit',
    systemPrompt: '你是总编仲裁官。职责：阅读执行层和审计层的全部输出，做出最终裁决。当审计发现冲突时判断是否需要重写；当两条审计结果矛盾时做出取舍。输出：APPROVED/REVISE，含裁决理由。',
    contextFields: ['book_info'],
    layer: 'audit',
  },
];

const LAYER_GROUPS = [
  { key: 'decision', label: '决策层', icon: Brain },
  { key: 'execution', label: '执行层', icon: Pen },
  { key: 'audit', label: '审计层', icon: Search },
] as const;

interface NodePaletteProps {
  onDragStart: (event: React.DragEvent, template: RoleTemplate) => void;
}

export function NodePalette({ onDragStart }: NodePaletteProps) {
  return (
    <div className="w-[200px] shrink-0 border-r border-border bg-background p-3 space-y-4 overflow-y-auto">
      {LAYER_GROUPS.map(({ key, label, icon: Icon }) => {
        const roles = ROLE_TEMPLATES.filter((t) => t.layer === key);
        if (roles.length === 0) return null;
        return (
          <div key={key}>
            <div className="flex items-center gap-1.5 mb-2">
              <Icon size={12} className="text-foreground/30" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/30">
                {label}
              </span>
            </div>
            <div className="space-y-1">
              {roles.map((role) => (
                <div
                  key={role.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, role)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-grab border border-dashed border-border hover:border-foreground/[0.15] hover:bg-foreground/[0.02] transition-colors"
                >
                  <Plus size={10} className="text-foreground/25" />
                  <span className="text-[11px] font-medium text-foreground/60 truncate">
                    {role.label}
                  </span>
                  <span className="ml-auto text-[8px] text-foreground/25 shrink-0">
                    {role.executor === 'audit' ? '审计' : '主模型'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
