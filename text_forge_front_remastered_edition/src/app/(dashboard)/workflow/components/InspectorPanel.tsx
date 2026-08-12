'use client';

import { useEffect, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import type { WorkflowNode } from '@/shared/api/workflows';
import { apiClient } from '@/shared/api/client';

interface PublicDoc {
  id: string;
  name: string;
  uploaderName?: string | null;
}

// 模块级缓存（60s TTL）：编辑页多次打开/切换节点避免重复拉取公共库文档
let docsCache: PublicDoc[] | null = null;
let docsCacheAt = 0;
const DOCS_CACHE_TTL = 60_000;

// 拉取公共库全量文档（/knowledge/public 默认仅 20/页，翻页拉全供 docIds 多选）。
async function loadPublicDocs(): Promise<PublicDoc[]> {
  if (docsCache && Date.now() - docsCacheAt < DOCS_CACHE_TTL) return docsCache;
  const docs: PublicDoc[] = [];
  for (let page = 1; page <= 10; page++) {
    try {
      const { data } = await apiClient.get<{ documents: PublicDoc[] }>('/knowledge/public', {
        params: { page, page_size: 100 },
      });
      const items = Array.isArray(data?.documents) ? data.documents : [];
      docs.push(...items);
      if (items.length < 100) break;
    } catch {
      break;
    }
  }
  docsCache = docs;
  docsCacheAt = Date.now();
  return docs;
}

interface ContextFieldOption {
  key: string;
  label: string;
  desc: string;
}

const CONTEXT_GROUPS: { group: string; fields: ContextFieldOption[] }[] = [
  {
    group: '全局',
    fields: [
      { key: 'book_info', label: '书籍基本信息', desc: '本书书名、简介（前300字）与类型' },
      { key: 'setting', label: '创作设定', desc: '世界观、文风/基调、创作禁忌与自定义维度（全量注入）' },
      { key: 'characters', label: '角色档案', desc: '全书角色（可被书籍上下文池过滤），含别名/描述/类型/状态/自定义属性/当前地点' },
      { key: 'character_relationships', label: '角色关系', desc: '角色及其关系链（每条链最多8条）；本章场景全量里的场景角色链更聚焦，一般不需要再勾此项' },
      { key: 'locations', label: '地点设定', desc: '全书地点，含父地点链与直属子地点（不递归子孙）' },
      { key: 'foreshadowings', label: '伏笔列表', desc: '全书伏笔清单（按创建时间排序）；策略规划或审计"未回收伏笔"时使用' },
      { key: 'plot_threads', label: '剧情线索', desc: '全书情节线清单；策略规划或审计"未推进线索"时使用' },
      { key: 'branches', label: '角色支线', desc: '角色模拟沉淀的支线素材（设定/冲突/台词），写作时可直接融入正文' },
    ],
  },
  {
    group: '大纲',
    fields: [
      { key: 'outline_detail', label: '大纲全量', desc: '完整大纲树：目录 + 各卷摘要 + 各章摘要 + 本章场景全量' },
      { key: 'outline_detail.toc', label: '目录结构', desc: '大纲骨架：卷名 → 章名 → 事件标题（含时间标签）' },
      { key: 'outline_detail.volume_summaries', label: '卷摘要', desc: '目录 + 各卷摘要（全量）' },
      { key: 'outline_detail.chapter_summaries', label: '章摘要', desc: '目录 + 各章摘要（全量）' },
      { key: 'outline_detail.chapter_scene_event', label: '本章场景全量', desc: '目标章全部事件：标题/摘要/时间标签 + 场景地点（含父链与直属子地点）+ 出场角色及关系链（链角色只带基本信息，不追链）+ 事件绑定的情节线/伏笔' },
    ],
  },
  {
    group: '衔接',
    fields: [
      { key: 'previous_chapters', label: '上一章正文', desc: '目标章前最近一章的完整正文（上限8000字）；未指定目标章时取全书最近一章' },
    ],
  },
];

interface InspectorPanelProps {
  node: WorkflowNode | null;
  onChange: (patch: Partial<WorkflowNode>) => void;
  onClose: () => void;
}

export function InspectorPanel({ node, onChange, onClose }: InspectorPanelProps) {
  const [publicDocs, setPublicDocs] = useState<PublicDoc[]>([]);
  // 懒加载：仅当节点已启用知识库检索时才拉取公共库文档列表
  const ragEnabled = !!node?.ragFilter;

  useEffect(() => {
    if (!ragEnabled) return;
    let alive = true;
    loadPublicDocs().then((docs) => {
      if (alive) setPublicDocs(docs);
    });
    return () => {
      alive = false;
    };
  }, [ragEnabled]);

  if (!node) {
    return (
      <div className="w-[280px] shrink-0 border-l border-border bg-background p-6 flex items-center justify-center">
        <span className="text-[11px] text-foreground/30">选择一个节点编辑属性</span>
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

  // 作者集合：从已加载公共库文档按 uploaderName 去重推导（存量 NULL/空不计入）。
  const publicAuthors = Array.from(
    new Set(
      publicDocs
        .map((d) => d.uploaderName)
        .filter((n): n is string => typeof n === 'string' && n.length > 0),
    ),
  ).sort();

  return (
    <div className="w-[280px] shrink-0 border-l border-border bg-background overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/30">节点属性</span>
        <button onClick={onClose} className="w-5 h-5 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-foreground/20 hover:text-foreground/50">
          <X size={12} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <label className="text-[11px] text-foreground/50 block mb-1 font-medium">标签</label>
          <input
            value={node.label}
            onChange={(e) => onChange({ label: e.target.value })}
            className="w-full h-8 px-2 rounded-md text-xs bg-card border border-border focus:outline-none focus:border-foreground/20"
          />
        </div>

        <div>
          <label className="text-[11px] text-foreground/50 block mb-1 font-medium">执行器</label>
          <select
            value={node.executor || 'main'}
            onChange={(e) => onChange({ executor: e.target.value as WorkflowNode['executor'] })}
            className="w-full h-8 px-2 rounded-md text-xs bg-card border border-border focus:outline-none"
          >
            <option value="main">主模型（生成/创作）</option>
            <option value="audit">审计模型</option>
            <option value="router">路由模型（判断/决策）</option>
            <option value="tool">工具模型（结构化输出）</option>
          </select>
        </div>

        <div>
          <label className="text-[11px] text-foreground/50 block mb-1 font-medium">
            系统提示词
          </label>
          <textarea
            value={node.systemPrompt || ''}
            onChange={(e) => onChange({ systemPrompt: e.target.value })}
            placeholder="定义该角色节点的写作要求..."
            className="w-full h-28 px-2 py-1.5 rounded-md text-xs bg-card border border-border focus:outline-none focus:border-foreground/20 resize-none"
          />
        </div>

        <div>
          <label className="text-[11px] text-foreground/50 block mb-2 font-medium">
            上下文
          </label>
          <div className="space-y-3 max-h-[240px] overflow-y-auto">
            {CONTEXT_GROUPS.map((group) => (
              <div key={group.group}>
                <div className="text-[10px] font-medium text-foreground/30 mb-1">{group.group}</div>
                <div className="space-y-1">
                  {group.fields.map((field) => (
                    <label
                      key={field.key}
                      className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-foreground/[0.02]"
                    >
                      <input
                        type="checkbox"
                        checked={contextFields.includes(field.key)}
                        onChange={() => toggleField(field.key)}
                        className="w-3 h-3 rounded border-border"
                      />
                      <span className="text-[11px] text-foreground/60">
                        {field.label}
                      </span>
                      <span
                        role="img"
                        aria-label="说明"
                        title={field.desc}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        className="ml-auto text-foreground/25 hover:text-foreground/60 cursor-help shrink-0"
                      >
                        <HelpCircle size={11} />
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => onChange({ contextFields: [] })}
            title="清空当前节点已选的上下文字段（无法可靠自动推断，请按需手动勾选）"
            className="w-full mt-2 py-1 text-[10px] text-foreground/30 hover:text-foreground/50 bg-transparent border border-dashed border-border rounded cursor-pointer"
          >
            清空上下文
          </button>
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] text-foreground/50 block font-medium">
              节点知识库检索（公共库）
            </label>
            <input
              type="checkbox"
              checked={!!node.ragFilter}
              onChange={(e) => {
                if (e.target.checked) {
                  onChange({ ragFilter: { query: '' }, ragTopK: node.ragTopK ?? 3 });
                } else {
                  onChange({ ragFilter: undefined, ragTopK: undefined });
                }
              }}
              className="w-3 h-3 rounded border-border"
            />
          </div>
          <p className="text-[10px] text-foreground/30 mb-3">
            启用后，执行该节点时按条件检索公开知识库，结果以外部文档块注入节点上下文
          </p>

          {node.ragFilter && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-foreground/40 block mb-1">检索关键词</label>
                <input
                  value={node.ragFilter.query ?? ''}
                  onChange={(e) => onChange({ ragFilter: { ...node.ragFilter, query: e.target.value } })}
                  placeholder="留空自动使用系统提示词（前200字）"
                  className="w-full h-8 px-2 rounded-md text-xs bg-card border border-border focus:outline-none focus:border-foreground/20"
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] text-foreground/40 block mb-1">返回条数</label>
                  <select
                    value={node.ragTopK ?? 3}
                    onChange={(e) => onChange({ ragTopK: Number(e.target.value) })}
                    className="w-full h-8 px-2 rounded-md text-xs bg-card border border-border focus:outline-none"
                  >
                    {[1, 2, 3, 5, 8, 10].map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-foreground/40 block mb-1">文件名包含</label>
                  <input
                    value={node.ragFilter.sample ?? ''}
                    onChange={(e) => onChange({ ragFilter: { ...node.ragFilter, sample: e.target.value } })}
                    placeholder="可选"
                    className="w-full h-8 px-2 rounded-md text-xs bg-card border border-border focus:outline-none focus:border-foreground/20"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-foreground/40 block mb-1">
                  限定文档（{node.ragFilter.docIds?.length ?? 0}/{publicDocs.length}，空 = 全部）
                </label>
                <div className="max-h-[160px] overflow-y-auto border border-border rounded-md p-1 space-y-0.5">
                  {publicDocs.length === 0 ? (
                    <span className="text-[10px] text-foreground/30 px-1">公共库暂无文档</span>
                  ) : (
                    publicDocs.map((doc) => {
                      const checked = node.ragFilter?.docIds?.includes(doc.id) ?? false;
                      return (
                        <label
                          key={doc.id}
                          className="flex items-center gap-2 px-1 py-0.5 rounded cursor-pointer hover:bg-foreground/[0.02]"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const cur = node.ragFilter?.docIds ?? [];
                              const next = checked ? cur.filter((x) => x !== doc.id) : [...cur, doc.id];
                              onChange({ ragFilter: { ...node.ragFilter, docIds: next } });
                            }}
                            className="w-3 h-3 rounded border-border"
                          />
                          <span className="text-[11px] text-foreground/60 truncate">{doc.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div>
                <label className="text-[10px] text-foreground/40 block mb-1">
                  限定作者（{node.ragFilter.authorIds?.length ?? 0}，空 = 不限）
                </label>
                {publicAuthors.length === 0 ? (
                  <span className="text-[10px] text-foreground/30 px-1">暂无作者数据</span>
                ) : (
                  <div className="max-h-[160px] overflow-y-auto border border-border rounded-md p-1 space-y-0.5">
                    {publicAuthors.map((author) => {
                      const checked = node.ragFilter?.authorIds?.includes(author) ?? false;
                      return (
                        <label
                          key={author}
                          className="flex items-center gap-2 px-1 py-0.5 rounded cursor-pointer hover:bg-foreground/[0.02]"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const cur = node.ragFilter?.authorIds ?? [];
                              const next = checked ? cur.filter((x) => x !== author) : [...cur, author];
                              onChange({ ragFilter: { ...node.ragFilter, authorIds: next } });
                            }}
                            className="w-3 h-3 rounded border-border"
                          />
                          <span className="text-[11px] text-foreground/60 truncate">{author}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
