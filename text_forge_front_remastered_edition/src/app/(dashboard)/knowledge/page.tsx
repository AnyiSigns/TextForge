'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, FileText, Trash2, BookOpen, Globe2, FolderOpen, Search, Eye, Download, RefreshCw, AlertCircle, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/shared/ui/card';
import { cn } from '@/shared/lib/cn';
import { showApiError } from '@/shared/lib/apiError';
import { ragClient, type KbDocMeta } from '@/lib/knowledge';
import { EMBED_TIERS } from '@/lib/rag/embed';
import { resetForTier, reindexAll } from '@/lib/rag/vectorStore';
import { getAllKbDocs } from '@/lib/storage/indexedDB';
import { useEmbedDownloaded } from '@/hooks/useEmbedDownloaded';
import { useEmbedTier } from '@/hooks/useEmbedTier';
import { formatUtc } from '@/shared/lib/datetime';
import { PageContainer } from '@/shared/ui/PageContainer';
import { PageHeader } from '@/shared/ui/PageHeader';
import { ListRow } from '@/shared/ui/ListRow';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog } from '@/features/map/components/ConfirmDialog';
import { useAuthStore } from '@/shared/stores/authStore';

const fileIconClass = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'text-[#c05555]';
  if (ext === 'md' || ext === 'markdown') return 'text-[#5b7fb5]';
  if (ext === 'docx') return 'text-[#5b8db5]';
  return 'text-muted-foreground';
};

const statusBadge = (status: KbDocMeta['status']) => {
  if (status === 'indexed') return <span className="text-[10px] text-emerald-600 border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 rounded-full shrink-0">已整理</span>;
  if (status === 'indexing') return <span className="text-[10px] text-amber-500 border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 rounded-full shrink-0">待整理</span>;
  return <span className="text-[10px] text-destructive border border-destructive/20 bg-destructive/10 px-1.5 py-0.5 rounded-full shrink-0">失败</span>;
};

export default function KnowledgePage() {
  const [view, setView] = useState<'personal' | 'public'>('personal');
  const [personal, setPersonal] = useState<KbDocMeta[]>([]);
  const [publicDocs, setPublicDocs] = useState<KbDocMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewing, setViewing] = useState<{ name: string; content: string } | null>(null);
  const [personalSearch, setPersonalSearch] = useState('');
  const [publicSearch, setPublicSearch] = useState('');
  const [publicUploading, setPublicUploading] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const personalInputRef = useRef<HTMLInputElement>(null);
  const publicInputRef = useRef<HTMLInputElement>(null);

  // S12：公共库分页（后端每页上限 100，返回不足即到底）
  const PUBLIC_PAGE_SIZE = 100;
  const [publicPage, setPublicPage] = useState(1);
  const [publicHasMore, setPublicHasMore] = useState(false);
  // A26：用 ConfirmDialog 替代原生 confirm
  const [confirmTarget, setConfirmTarget] = useState<{ doc: KbDocMeta; scope: 'personal' | 'public' } | null>(null);

  const embedTierId = useEmbedTier();
  const downloadedIds = useEmbedDownloaded();

  const loadPublic = useCallback(async (page: number, append: boolean) => {
    const docs = await ragClient.listPublic(page, PUBLIC_PAGE_SIZE);
    setPublicHasMore(docs.length >= PUBLIC_PAGE_SIZE);
    setPublicDocs((prev) => (append ? [...prev, ...docs] : docs));
  }, []);

  const refresh = useCallback(async () => {
    const [p] = await Promise.all([ragClient.listPersonal(), (async () => {
      setPublicPage(1);
      try {
        await loadPublic(1, false);
      } catch (e) {
        showApiError(e, '公共文档库加载失败');
      }
    })()]);
    setPersonal(p);
  }, [loadPublic]);

  const refreshLocal = useCallback(async () => {
    const localDocs = await getAllKbDocs();
    setPersonal(localDocs.filter((d) => d.scope === 'personal'));
  }, []);

  // refresh 为纯异步加载（首个 await 之前无同步 setState），effect 仅触发请求，属合法数据获取模式
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);

  const pendingReindex = personal.filter((d) => d.status === 'indexing').length;

  const handleEmbedChange = async (id: string) => {
    if (!downloadedIds.includes(id)) {
      toast.error('该精度未下载，请前往设置 → 模型 下载', { duration: 4000 });
      return;
    }
    const t = EMBED_TIERS.find((x) => x.id === id);
    if (!t) return;
    try {
      const removed = await resetForTier(id);
      await refreshLocal();
      if (removed > 0) {
        toast.success(`已切换到「${t.label}」，${removed} 篇文档需重新整理`, { description: '点击下方「整理文档」' });
      } else {
        toast.success(`已切换到「${t.label}」`);
      }
    } catch {
      toast.error('切换失败，请重试');
    }
  };

  const handleReindex = async () => {
    if (reindexing) return;
    setReindexing(true);
    try {
      const { ok, failed } = await reindexAll();
      await refreshLocal();
      if (failed > 0) {
        toast.warning(`文档已重新整理：${ok} 篇成功，${failed} 篇失败`, { description: '失败的文档请在设置页检查本地检索模型配置后重试' });
      } else {
        toast.success('文档已重新整理，现在可以正常检索了');
      }
    } catch {
      toast.error('整理文档失败');
    } finally {
      setReindexing(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      // A50：从 authStore 取用户名补全上传者，使公共库 authorIds 过滤命中
      const userName = useAuthStore.getState().user?.username;
      await ragClient.uploadPersonal(file, undefined, userName);
      toast.success('上传成功');
      await refresh();
    } catch (e) {
      showApiError(e, '上传失败');
    } finally { setLoading(false); e.target.value = ''; }
  };

  const handleDelete = async (doc: KbDocMeta) => {
    setConfirmTarget({ doc, scope: 'personal' });
  };

  const preview = (doc: KbDocMeta) => {
    const raw = doc.content ?? '（暂无内容）';
    setViewing({ name: doc.name, content: raw.slice(0, 2000) });
  };

  const openPublic = async (doc: KbDocMeta) => {
    const content = await ragClient.getPublicContent(doc.id);
    setViewing({ name: doc.name, content: content ?? '（暂无内容）' });
  };

  const handlePublicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPublicUploading(true);
    try {
      const res = await ragClient.uploadPublic(file);
      // S14：区分「已存在」与「新上传」
      if (res.status === 'existed') {
        toast.info('该文档已存在，未重复入库');
      } else {
        toast.success('已上传到公共文档库');
      }
      await refresh();
    } catch (e) { showApiError(e, '上传失败'); }
    finally { setPublicUploading(false); e.target.value = ''; }
  };

  const handlePublicDelete = async (doc: KbDocMeta) => {
    setConfirmTarget({ doc, scope: 'public' });
  };

  const confirmDelete = async () => {
    const target = confirmTarget;
    setConfirmTarget(null);
    if (!target) return;
    try {
      if (target.scope === 'personal') {
        await ragClient.removePersonal(target.doc.id);
      } else {
        await ragClient.removePublic(target.doc.id);
      }
      toast.success('已删除');
      await refresh();
    } catch (e) { showApiError(e, '删除失败'); }
  };

  return (
    <PageContainer>
      <PageHeader
        icon={BookOpen}
        title="知识库"
        description="个人文档本地检索 / 公共文档库浏览"
      />

      <div className="px-6 py-5 space-y-4">
        <div className="flex gap-1 mb-2 border-b border-border">
          {([['personal', '个人文档', FolderOpen], ['public', '公共文档库', Globe2]] as const).map(([k, label, Icon]) => (
            <button key={k} onClick={() => setView(k)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-sm bg-transparent border-none border-b-2 cursor-pointer transition-colors',
                view === k ? 'border-foreground text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {view === 'personal' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">切换：</span>
                <select
                  value={embedTierId}
                  onChange={(e) => handleEmbedChange(e.target.value)}
                  className="text-xs border border-border rounded px-2 py-1 bg-background"
                >
                  {EMBED_TIERS.map((t) => (
                    <option key={t.id} value={t.id} disabled={!downloadedIds.includes(t.id)}>
                      {t.label} · {t.dim}维{t.sizeMB}MB
                    </option>
                  ))}
                </select>
                {downloadedIds.includes(embedTierId) ? (
                  <span className="text-[10px] text-emerald-600 border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">已就绪</span>
                ) : (
                  <span className="text-[10px] text-amber-500 border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 rounded-full">未就绪</span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Button variant="secondary" size="sm" onClick={() => personalInputRef.current?.click()} disabled={loading} className="flex items-center gap-1.5">
                  <Upload size={14} /> 上传文件
                </Button>
                <input ref={personalInputRef} type="file" accept=".txt,.md,.markdown" className="hidden" onChange={handleUpload} />
                <p className="text-[11px] text-muted-foreground hidden md:block">支持 TXT, Markdown，存于本地本机向量检索</p>
              </div>
              <div className="relative w-56 shrink-0">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={personalSearch} onChange={(e) => setPersonalSearch(e.target.value)}
                  placeholder="搜索文件名..." className="w-full h-8 pl-8 pr-2 rounded-md text-xs bg-background border border-border focus:outline-none" />
              </div>
            </div>

            {pendingReindex > 0 ? (
              <div className="flex flex-wrap items-center gap-3 p-4 rounded-lg border border-amber-500/30 bg-amber-500/10">
                <AlertCircle size={16} className="text-amber-500 shrink-0" />
                <p className="text-xs text-foreground/80 flex-1 min-w-0">
                  切换了检索精度，有 <span className="font-semibold">{pendingReindex}</span> 篇文档需要重新整理才能被检索到。
                </p>
                <Button variant="secondary" size="sm" onClick={handleReindex} disabled={reindexing} className="flex items-center gap-1 shrink-0">
                  <RefreshCw size={10} className={cn(reindexing && 'animate-spin')} />
                  {reindexing ? '整理中…' : '整理文档'}
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {personal.filter((d) => d.name.toLowerCase().includes(personalSearch.toLowerCase())).map((doc) => (
                  <ListRow key={doc.id} className="justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText size={16} className={cn('shrink-0', fileIconClass(doc.name))} />
                      <div className="min-w-0">
                        <p className="text-sm truncate">{doc.name}</p>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          {statusBadge(doc.status)}
                          {doc.createdAt ? <span className="shrink-0">{formatUtc(doc.createdAt, { year: 'numeric', month: '2-digit', day: '2-digit' })}</span> : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => preview(doc)} className="p-1.5 rounded hover:bg-muted bg-transparent border-none cursor-pointer text-muted-foreground"><Eye size={14} /></button>
                      <button onClick={() => handleDelete(doc)} className="p-1.5 rounded hover:bg-destructive/10 bg-transparent border-none cursor-pointer text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
                    </div>
                  </ListRow>
                ))}
                {personal.length === 0 && <div className="text-xs text-muted-foreground text-center py-8">暂无个人文档，上传文件以开始</div>}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-lg border border-border/40 bg-card text-xs text-muted-foreground">
              <ShieldAlert size={14} className="shrink-0 mt-0.5 text-muted-foreground" />
              公共文档库存于服务端，所有用户创作时均可检索引用。请勿上传违规内容。
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Button variant="secondary" size="sm" onClick={() => publicInputRef.current?.click()} disabled={publicUploading} className="flex items-center gap-1.5">
                  <Upload size={14} /> {publicUploading ? '上传中...' : '上传文档'}
                </Button>
                <input ref={publicInputRef} type="file" accept=".txt,.md,.markdown,.json,.csv" className="hidden" onChange={handlePublicUpload} />
                <p className="text-[11px] text-muted-foreground hidden md:block">支持 TXT, Markdown, JSON, CSV</p>
              </div>
              <div className="relative w-56 shrink-0">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={publicSearch} onChange={(e) => setPublicSearch(e.target.value)}
                  placeholder="搜索文档..." className="w-full h-8 pl-8 pr-2 rounded-md text-xs bg-background border border-border focus:outline-none" />
              </div>
            </div>

            <div className="space-y-1.5">
              {publicDocs.filter((d) => !publicSearch || d.name.toLowerCase().includes(publicSearch.toLowerCase())).map((doc) => (
                <ListRow key={doc.id} className="justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText size={16} className={cn('shrink-0', fileIconClass(doc.name))} />
                    <div className="min-w-0">
                      <p className="text-sm truncate">{doc.name}</p>
                      {doc.uploaderName && <p className="text-[10px] text-muted-foreground">上传者：{doc.uploaderName}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openPublic(doc)} className="p-1.5 rounded hover:bg-muted bg-transparent border-none cursor-pointer text-muted-foreground"><Eye size={14} /></button>
                    <button onClick={async () => {
                      try {
                        await ragClient.downloadPublic(doc.id, doc.name);
                      } catch (e) { showApiError(e, '下载失败'); }
                    }} className="p-1.5 rounded hover:bg-muted bg-transparent border-none cursor-pointer text-muted-foreground"><Download size={14} /></button>
                    <button onClick={() => handlePublicDelete(doc)} className="p-1.5 rounded hover:bg-destructive/10 bg-transparent border-none cursor-pointer text-muted-foreground hover:text-destructive"><Trash2 size={14} /></button>
                  </div>
                </ListRow>
              ))}
              {publicDocs.length === 0 && <div className="text-xs text-muted-foreground text-center py-8">暂无公共文档</div>}
              {publicHasMore && (
                <div className="flex justify-center pt-2">
                  <Button variant="secondary" size="sm" onClick={async () => {
                    try {
                      const next = publicPage + 1;
                      setPublicPage(next);
                      await loadPublic(next, true);
                    } catch (e) { showApiError(e, '加载更多失败'); }
                  }}>加载更多</Button>
                </div>
              )}
            </div>
          </div>
        )}

        {viewing && (
          <div className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-6" onClick={() => setViewing(null)}>
            <Card className="max-w-2xl w-full max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-border">
                <p className="font-medium text-sm flex items-center gap-2"><FileText size={14} /> {viewing.name}</p>
                <button onClick={() => setViewing(null)} className="text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer">关闭</button>
              </div>
              <pre className="flex-1 overflow-y-auto p-4 text-xs whitespace-pre-wrap text-muted-foreground">{viewing.content}</pre>
            </Card>
          </div>
        )}

        {confirmTarget && (
          <ConfirmDialog
            title={confirmTarget.scope === 'personal' ? '删除个人文档' : '删除公共文档'}
            message={`确定从${confirmTarget.scope === 'personal' ? '个人文档' : '公共文档库'}删除「${confirmTarget.doc.name}」吗？此操作不可撤销。`}
            confirmLabel="删除"
            onConfirm={confirmDelete}
            onCancel={() => setConfirmTarget(null)}
          />
        )}
      </div>
    </PageContainer>
  );
}
