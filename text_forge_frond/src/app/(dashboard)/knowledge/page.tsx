// src/app/(dashboard)/knowledge/page.tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileText, Trash2, BookOpen, Globe2, FolderOpen, Sparkles, ShieldAlert, Eye, Download, Search, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/states';
import { ProcessNav } from '@/features/projects';
import { useAuthStore } from '@/lib/stores/authStore';
import { useSettingsStore } from '@/features/settings';
import { ragClient, type KbDocMeta } from '@/lib/knowledge';
import { initDownloadedTiers, isTierDownloaded } from '@/lib/rag/embed';
import { EMBED_TIERS } from '@/lib/rag/embed';
import { reindexAll } from '@/lib/rag/vectorStore';

const FORBIDDEN_NOTE = '请勿上传包含血腥、暴力、色情或任何其他违反法律法规的内容。违规内容将被系统拦截并追责。';

export default function KnowledgePage() {
  const { user } = useAuthStore();
  const [view, setView] = useState<'personal' | 'public'>('personal');
  const [publicFilter, setPublicFilter] = useState<'all' | 'mine'>('all');
  const [personal, setPersonal] = useState<KbDocMeta[]>([]);
  const [publicDocs, setPublicDocs] = useState<KbDocMeta[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewing, setViewing] = useState<{ name: string; content: string } | null>(null);
  const [personalSearch, setPersonalSearch] = useState('');
  const [publicSearch, setPublicSearch] = useState('');
  const [personalPage, setPersonalPage] = useState(1);
  const PER_PAGE = 8;
  const personalInputRef = useRef<HTMLInputElement>(null);
  const publicInputRef = useRef<HTMLInputElement>(null);

  const myId = user?.id;
  const embedTierId = useSettingsStore((s) => s.embedTierId);

  // 个人库本地向量检索所用量化精度（与「AI 偏好」中选中的精度一致）
  const [embedTierLabel, setEmbedTierLabel] = useState('');
  const [embedTierDim, setEmbedTierDim] = useState(0);
  const [embedDownloaded, setEmbedDownloaded] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  useEffect(() => {
    initDownloadedTiers().then(() => {
      const t = EMBED_TIERS.find((x) => x.id === embedTierId);
      setEmbedTierLabel(t?.label ?? '');
      setEmbedTierDim(t?.dim ?? 0);
      setEmbedDownloaded(isTierDownloaded(embedTierId));
    });
  }, [embedTierId]);

  // 待重建文档数（切换精度后旧文档被标记为 indexing）
  const pendingReindex = personal.filter((d) => d.status === 'indexing').length;

  const handleReindex = async () => {
    if (reindexing) return;
    setReindexing(true);
    try {
      await reindexAll();
      await refresh();
      toast.success('已重新建库，现在可以正常检索了');
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      toast.error('重新建库失败', { description: err.message });
    } finally {
      setReindexing(false);
    }
  };

  const refresh = useCallback(async () => {
    const [p, pub] = await Promise.all([ragClient.listPersonal(), ragClient.listPublic()]);
    setPersonal(p);
    setPublicDocs(pub);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handlePersonalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    try {
      await ragClient.uploadPersonal(file, myId, user?.username);
      toast.success('上传成功，已索引（本地）');
      await refresh();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      toast.error('上传失败', { description: err.message });
    } finally {
      setIsLoading(false);
      e.target.value = '';
    }
  };

  const handlePublishToPublic = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm(`发布到公共文档库提醒：\n${FORBIDDEN_NOTE}\n\n确认发布「${file.name}」到公共文档库？`)) {
      e.target.value = '';
      return;
    }
    // 后端就绪后真正上传；mock 期仅提示（公共库内容由服务端托管，前端不存）
    toast.info('已提交发布（后端就绪后写入公共库）');
    e.target.value = '';
  };

  const handleDelete = useCallback(async (doc: KbDocMeta) => {
    if (!confirm('确定要删除该文档吗？删除后相关索引也会移除。')) return;
    try {
      if (doc.scope === 'public') {
        toast.info('公共文档删除需后端支持（已记录意图）');
      } else {
        await ragClient.removePersonal(doc.id);
        toast.success('已删除');
        await refresh();
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      toast.error('删除失败', { description: err.message });
    }
  }, [refresh]);

  const openPublic = async (doc: KbDocMeta) => {
    const content = await ragClient.getPublicContent(doc.id);
    setViewing({ name: doc.name, content: content ?? '（暂无内容）' });
  };

  // 个人文档预览：展示前 1000 字（完整内容用于本地检索，不在此全部展开）
  const previewPersonal = (doc: KbDocMeta) => {
    const raw = doc.content ?? '（暂无内容）';
    const limit = 1000;
    const preview = raw.length > limit ? `${raw.slice(0, limit)}\n\n…（预览仅显示前 ${limit} 字，完整内容已用于本地检索）` : raw;
    setViewing({ name: doc.name, content: preview });
  };

  const getStatusBadge = (status: KbDocMeta['status']) => {
    switch (status) {
      case 'indexing': return <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">待重建</Badge>;
      case 'indexed': return <Badge variant="default">已索引</Badge>;
      case 'failed': return <Badge variant="destructive">失败</Badge>;
    }
  };

  const docRow = (doc: KbDocMeta, deletable: boolean) => (
    <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-background/40 hover:bg-background/70 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <span className="grid place-items-center w-8 h-8 rounded-lg bg-primary/10 text-primary shrink-0">
          <FileText className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm truncate">{doc.name}</p>
          {doc.scope === 'public' && doc.uploaderName && (
            <p className="text-xs text-muted-foreground truncate">上传者：{doc.uploaderName}</p>
          )}
        </div>
        {getStatusBadge(doc.status)}
      </div>
      <div className="flex items-center gap-1">
        {doc.scope === 'personal' && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => previewPersonal(doc)} title="预览">
            <Eye className="w-4 h-4" />
          </Button>
        )}
        {doc.scope === 'public' && (
          <>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => openPublic(doc)}>
              <Eye className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => ragClient.downloadPublic(doc.id, doc.name)}>
              <Download className="w-4 h-4" />
            </Button>
          </>
        )}
        {deletable && (
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(doc)}>
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="page-shell">
      <PageHeader
        icon={BookOpen}
        title="知识库"
        description="管理个人文档（本地检索），或检索公共文档库（服务端）供 RAG 引用"
      />

      <ProcessNav
        tabs={[
          { value: 'personal', label: '个人文档', icon: FolderOpen },
          { value: 'public', label: '公共文档库', icon: Globe2 },
        ]}
        value={view}
        onValueChange={(v) => setView(v as 'personal' | 'public')}
      >
        <Card className="glass-card overflow-hidden">
          <CardContent className="p-5 space-y-5 animate-fade-scale" key={view}>
          {view === 'personal' ? (
            <>
              {pendingReindex > 0 && (
                <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                  <p className="text-sm text-amber-700 dark:text-amber-300 flex-1 min-w-0">
                    你切换了检索精度，有 <span className="font-semibold">{pendingReindex}</span> 篇文档需要重新建库才能被检索到（切换前已上传的文档不会丢失）。
                  </p>
                  <Button size="sm" variant="outline" onClick={handleReindex} disabled={reindexing} className="shrink-0">
                    <RefreshCw className={`w-4 h-4 mr-1.5 ${reindexing ? 'animate-spin' : ''}`} />
                    {reindexing ? '重建中…' : '重新建库'}
                  </Button>
                </div>
              )}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="outline" onClick={() => personalInputRef.current?.click()} disabled={isLoading} className="glass-surface">
                    <Upload className="w-4 h-4 mr-2" /> 上传文件
                  </Button>
                  <input
                    ref={personalInputRef}
                    type="file"
                    accept=".txt,.pdf,.md,.docx"
                    className="hidden"
                    onChange={handlePersonalUpload}
                  />
                </div>
                <p className="text-xs text-muted-foreground">支持 TXT, PDF, Markdown 格式，个人文档存于本地、用本机向量检索，仅你本人可检索</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>当前检索精度：</span>
                  <Badge variant={embedDownloaded ? 'secondary' : 'outline'} className={embedDownloaded ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : ''}>
                    {embedTierLabel || '—'}{embedTierDim ? ` · ${embedTierDim} 维` : ''}
                  </Badge>
                  {embedTierLabel && (
                    <span className={embedDownloaded ? 'text-emerald-600' : 'text-amber-500'}>
                      {embedDownloaded ? '已就绪（离线可用）' : '尚未下载，检索前将自动下载'}
                    </span>
                  )}
                </div>
              </div>

              <hr className="ink-divider" />

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-muted-foreground">个人文档列表</h3>
                  <div className="relative w-56 max-w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={personalSearch}
                      onChange={(e) => { setPersonalSearch(e.target.value); setPersonalPage(1); }}
                      placeholder="搜索文件名…"
                      className="pl-9 h-8 text-sm"
                    />
                  </div>
                </div>
                {personal.length === 0 ? (
                  <EmptyState icon={FileText} title="暂无文档" description="上传文件以开始" />
                ) : (() => {
                  const filtered = personal.filter((d) => d.name.toLowerCase().includes(personalSearch.trim().toLowerCase()));
                  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
                  const page = Math.min(personalPage, totalPages);
                  const shown = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
                  return (
                    <div className="space-y-2">
                      {filtered.length === 0 ? (
                        <EmptyState icon={FileText} title="无匹配文档" description="换个关键词试试" />
                      ) : (
                        shown.map((d) => docRow(d, true))
                      )}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-1">
                          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPersonalPage(page - 1)}>上一页</Button>
                          <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
                          <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPersonalPage(page + 1)}>下一页</Button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-xl border border-dashed border-primary/20 bg-primary/5">
                <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  公共文档库存于服务端（pgvector），所有用户创作时均可检索引用。点击查看或下载文档内容。你发布的内容会显示「删除」按钮，仅你可撤回。
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={() => publicInputRef.current?.click()} className="glass-surface">
                  <Upload className="w-4 h-4 mr-2" /> 发布文档到公共库
                </Button>
                <Select value={publicFilter} onValueChange={(v) => setPublicFilter(v as 'all' | 'mine')}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="文档范围">
                      {(value) => (value === 'mine' ? '仅看我上传的' : '全部文档')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部文档</SelectItem>
                    <SelectItem value="mine">仅看我上传的</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative w-56 max-w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={publicSearch}
                    onChange={(e) => setPublicSearch(e.target.value)}
                    placeholder="搜索公共文档名 / 上传者…"
                    className="pl-9 h-8 text-sm"
                  />
                </div>
                <input
                  ref={publicInputRef}
                  type="file"
                  accept=".txt,.pdf,.md,.docx"
                  className="hidden"
                  onChange={handlePublishToPublic}
                />
              </div>
              <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300">
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-xs">{FORBIDDEN_NOTE}</p>
              </div>

              {(() => {
                const kw = publicSearch.trim().toLowerCase();
                const base = publicFilter === 'mine'
                  ? publicDocs.filter((d) => d.uploaderId === myId)
                  : publicDocs;
                const shown = kw
                  ? base.filter((d) =>
                      d.name.toLowerCase().includes(kw) ||
                      (d.uploaderName ?? '').toLowerCase().includes(kw),
                    )
                  : base;
                return shown.length === 0 ? (
                  <EmptyState icon={Globe2} title={publicFilter === 'mine' ? '你还没有上传公共文档' : '公共文档库暂无内容'} description={publicFilter === 'mine' ? '发布你的第一个共享资料' : '发布你的第一个共享资料'} />
                ) : (
                  <div className="space-y-2">
                    {shown.map((d) => docRow(d, d.uploaderId === myId))}
                  </div>
                );
              })()}
            </div>
          )}
        </CardContent>
      </Card>
      </ProcessNav>

      {viewing && (
        <Card className="glass-card">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium flex items-center gap-2"><FileText className="w-4 h-4" /> {viewing.name}</p>
              <Button size="sm" variant="outline" onClick={() => setViewing(null)}>关闭</Button>
            </div>
            <pre className="text-xs whitespace-pre-wrap text-muted-foreground max-h-80 overflow-y-auto">{viewing.content}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

