'use client';

import { useEffect, useState } from 'react';
import { Settings, User, Palette, Boxes, Eye, EyeOff, Mail, Wifi, Cpu } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import { Card } from '@/shared/ui/card';
import { cn } from '@/shared/lib/cn';
import * as userApi from '@/shared/api/user';
import * as modelApi from '@/shared/api/models';
import { EMBED_TIERS, downloadEmbedModel, deleteEmbedModel, cancelEmbedDownload } from '@/lib/rag/embed';
import { useEmbedDownloaded } from '@/hooks/useEmbedDownloaded';

const TEXT_ROLES: { key: string; label: string; desc: string }[] = [
  { key: 'main', label: '主模型', desc: '通用生成' },
  { key: 'audit', label: '审核模型', desc: '内容审核' },
  { key: 'router', label: '路由模型', desc: '任务分发' },
  { key: 'tool', label: '工具模型', desc: '工具调用' },
];

const PROVIDER_TEMPLATES: Record<string, { base_url: string; model_id: string; desc: string }[]> = {
  deepseek: [{ base_url: 'https://api.deepseek.com', model_id: 'deepseek-chat', desc: 'DeepSeek Chat' }],
  ollama: [{ base_url: 'http://localhost:11434/v1', model_id: 'llama3', desc: 'Llama3 (本地)' }],
  openai: [{ base_url: 'https://api.openai.com/v1', model_id: 'gpt-4o', desc: 'GPT-4o' }],
  gemini: [{ base_url: 'https://generativelanguage.googleapis.com/v1', model_id: 'gemini-2.0-flash', desc: 'Gemini 2.0 Flash' }],
  anthropic: [{ base_url: 'https://api.anthropic.com/v1', model_id: 'claude-3-5-sonnet-20240620', desc: 'Claude 3.5 Sonnet' }],
  zhipu: [{ base_url: 'https://open.bigmodel.cn/api/paas/v4', model_id: 'glm-4-plus', desc: 'GLM-4 Plus' }],
  moonshot: [{ base_url: 'https://api.moonshot.cn/v1', model_id: 'moonshot-v1-8k', desc: 'Moonshot v1 8K' }],
  qianfan: [{ base_url: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1', model_id: 'ernie-4.0', desc: 'ERNIE 4.0' }],
  dashscope: [
    { base_url: process.env.NEXT_PUBLIC_MODEL_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1', model_id: process.env.NEXT_PUBLIC_MODEL_ID || 'qwen-turbo', desc: '通义千问 (MaaS 配置)' },
    { base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model_id: 'qwen-turbo', desc: '通义千问 Turbo' },
  ],
};

const PROVIDER_LIST = Object.keys(PROVIDER_TEMPLATES);

// 默认模型配置：从 .env.local 注入（gitignored，不提交密钥）。
// dashscope adapter 后端映射 langchain_qwq.ChatQwQ，其内部走 OpenAI 兼容协议
// （DEFAULT_API_BASE 即 compatible-mode/v1），故 base_url 必须用兼容模式端点而非 /api/v1。
const MODEL_BASE_URL = process.env.NEXT_PUBLIC_MODEL_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const MODEL_API_KEY = process.env.NEXT_PUBLIC_MODEL_API_KEY || '';
const MODEL_ID = process.env.NEXT_PUBLIC_MODEL_ID || 'qwen-turbo';
const EMBEDDING_API_KEY = process.env.NEXT_PUBLIC_EMBEDDING_API_KEY || '';

const DEFAULT_TEXT_ROLES: Record<string, { adapter: string; base_url: string; api_key: string; model_id: string }> = {
  main: { adapter: 'dashscope', base_url: MODEL_BASE_URL, api_key: MODEL_API_KEY, model_id: MODEL_ID },
  audit: { adapter: 'dashscope', base_url: MODEL_BASE_URL, api_key: MODEL_API_KEY, model_id: MODEL_ID },
  router: { adapter: 'dashscope', base_url: MODEL_BASE_URL, api_key: MODEL_API_KEY, model_id: MODEL_ID },
  tool: { adapter: 'dashscope', base_url: MODEL_BASE_URL, api_key: MODEL_API_KEY, model_id: MODEL_ID },
};

const DEFAULT_EMBEDDING = { adapter: 'dashscope', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', api_key: EMBEDDING_API_KEY, model_id: 'text-embedding-v4' };
const DEFAULT_SEARCH = { provider: 'bocha', api_key: process.env.NEXT_PUBLIC_SEARCH_API_KEY || '' };
const DEFAULT_VISION = { adapter: 'openai', base_url: 'https://api.openai.com/v1', api_key: '', model_id: 'gpt-4o' };

const TABS = [
  { value: 'profile', label: '用户', icon: User },
  { value: 'appearance', label: '外观', icon: Palette },
  { value: 'model', label: '模型', icon: Boxes },
] as const;

type Tab = typeof TABS[number]['value'];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const [userName, setUserName] = useState('');
  const [email, setEmail] = useState('');
  const [originalEmail, setOriginalEmail] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [sendingEmailCode, setSendingEmailCode] = useState(false);

  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);

  const [emailPwdCode, setEmailPwdCode] = useState('');
  const [emailPwdNewPwd, setEmailPwdNewPwd] = useState('');
  const [sendingPwdCode, setSendingPwdCode] = useState(false);
  const [changingPwdByEmail, setChangingPwdByEmail] = useState(false);

  const [modelConfig, setModelConfig] = useState<Record<string, { adapter: string; base_url: string; api_key: string; model_id: string }>>({});
  const [embeddingModel, setEmbeddingModel] = useState<{ adapter: string; base_url: string; api_key: string; model_id: string }>(DEFAULT_EMBEDDING);
  const [visionModel, setVisionModel] = useState<{ adapter: string; base_url: string; api_key: string; model_id: string }>(DEFAULT_VISION);
  const [searchConfig, setSearchConfig] = useState(DEFAULT_SEARCH);
  const [testingRole, setTestingRole] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ adapter: '', base_url: '', api_key: '', model_id: '' });
  const [editingEmbedding, setEditingEmbedding] = useState(false);
  const [editingVision, setEditingVision] = useState(false);
  const [embedEditForm, setEmbedEditForm] = useState(DEFAULT_EMBEDDING);
  const [visionEditForm, setVisionEditForm] = useState(DEFAULT_VISION);

  const [embedDownloadId, setEmbedDownloadId] = useState<string | null>(null);
  const [embedDownloading, setEmbedDownloading] = useState(false);
  const [embedProgress, setEmbedProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [embedDeleting, setEmbedDeleting] = useState<string | null>(null);
  const downloadedIds = useEmbedDownloaded();

  useEffect(() => {
    setMounted(true);
    userApi.fetchProfile().then((p) => {
      setUserName(p.username || '');
      setEmail(p.email || '');
      setOriginalEmail(p.email || '');
    }).catch(() => {});
    modelApi.fetchModelConfig().then((cfg) => {
      setModelConfig(cfg.textRoleModels || {});
      if (cfg.embeddingModel) setEmbeddingModel(cfg.embeddingModel);
      if (cfg.visionModel) setVisionModel(cfg.visionModel);
      if (cfg.searchConfig) setSearchConfig(cfg.searchConfig);
    }).catch(() => {});
  }, []);

  const handleSaveProfile = async () => {
    if (!userName.trim()) { toast.error('用户名不能为空'); return; }
    if (email !== originalEmail && !emailCode) { toast.error('修改邮箱需输入验证码'); return; }
    setSavingProfile(true);
    try {
      await userApi.updateProfile({ username: userName.trim(), email: email.trim(), code: emailCode || undefined });
      setOriginalEmail(email);
      setEmailCode('');
      toast.success('已保存');
    } catch { toast.error('保存失败'); }
    finally { setSavingProfile(false); }
  };

  const handleChangePassword = async () => {
    if (!oldPwd || !newPwd) { toast.error('请输入旧密码和新密码'); return; }
    setChangingPwd(true);
    try {
      await userApi.changePassword(oldPwd, newPwd);
      toast.success('密码已修改');
      setOldPwd(''); setNewPwd('');
    } catch { toast.error('修改失败'); }
    finally { setChangingPwd(false); }
  };

  const handleSendPwdCode = async () => {
    setSendingPwdCode(true);
    try {
      await userApi.sendCode();
      toast.success('验证码已发送');
    } catch { toast.error('发送失败'); }
    finally { setSendingPwdCode(false); }
  };

  const handleChangePwdByEmail = async () => {
    if (!emailPwdCode || !emailPwdNewPwd) { toast.error('请输入验证码和新密码'); return; }
    setChangingPwdByEmail(true);
    try {
      await userApi.changePasswordByEmail(emailPwdCode, emailPwdNewPwd);
      toast.success('密码已修改');
      setEmailPwdCode(''); setEmailPwdNewPwd('');
    } catch { toast.error('修改失败'); }
    finally { setChangingPwdByEmail(false); }
  };

  const persistModelConfig = async (
    textRoleModels = modelConfig,
    embedModel = embeddingModel,
    vision = visionModel,
    search = searchConfig,
  ) => {
    try {
      await modelApi.saveModelConfig({ textRoleModels, embeddingModel: embedModel, visionModel: vision, searchConfig: search });
      toast.success('已保存');
    } catch {
      toast.error('保存失败');
    }
  };

  const startEditRole = (key: string) => {
    const existing = modelConfig[key] || DEFAULT_TEXT_ROLES[key];
    setEditForm({ adapter: existing.adapter, base_url: existing.base_url, api_key: existing.api_key, model_id: existing.model_id });
    setEditingRole(key);
  };

  const saveEditRole = () => {
    if (!editingRole) return;
    const newModelConfig = { ...modelConfig, [editingRole]: editForm };
    setModelConfig(newModelConfig);
    setEditingRole(null);
    persistModelConfig(newModelConfig);
  };

  const handleTestRole = async (key: string) => {
    const raw = modelConfig[key] || DEFAULT_TEXT_ROLES[key];
    const cfg = raw as { adapter: string; base_url: string; api_key: string; model_id: string };
    setTestingRole(key);
    try {
      const res = await modelApi.testModelConnection(cfg);
      if (res.ok) {
        toast.success('连接成功', { description: res.content?.slice(0, 60) });
      }
    } catch (e) {
      toast.error('连接失败');
    } finally {
      setTestingRole(null);
    }
  };

  const handleEmbedDownload = async (id: string) => {
    setEmbedDownloading(true);
    setEmbedDownloadId(id);
    setEmbedProgress(null);
    try {
      await downloadEmbedModel(id, (p) => setEmbedProgress(p));
      toast.success('本地检索模型已就绪，切换精度请前往知识库页面');
    } catch {
      toast.error('下载失败');
    } finally {
      setEmbedDownloading(false);
      setEmbedDownloadId(null);
      setEmbedProgress(null);
    }
  };

  const handleEmbedDelete = async (id: string) => {
    setEmbedDeleting(id);
    try {
      await deleteEmbedModel(id);
      toast.success('已删除');
    } catch {
      toast.error('删除失败');
    } finally {
      setEmbedDeleting(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex items-center gap-3 mb-6 px-6 pt-6">
        <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center">
          <Settings size={18} className="text-foreground/70" />
        </div>
        <div>
          <h1 className="text-base font-semibold">设置</h1>
          <p className="text-[11px] text-muted-foreground">管理你的个人资料、界面外观与模型配置</p>
        </div>
      </div>

      <div className="px-6">
        <div className="flex gap-1 mb-6">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  'relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap',
                  active ? 'text-foreground bg-foreground/5' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                {active && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground/60 rounded-full" />
                )}
                <Icon size={13} strokeWidth={1.8} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {activeTab === 'profile' && (
          <>
          <Card className="p-5 space-y-5">
            <div className="space-y-3">
              <label className="text-[11px] text-muted-foreground block">用户名</label>
              <input value={userName} onChange={(e) => setUserName(e.target.value)}
                className="w-full h-8 px-2.5 rounded-md text-xs bg-background border border-border focus:outline-none focus:border-foreground/30 transition-colors" />
            </div>
            <div className="space-y-3">
              <label className="text-[11px] text-muted-foreground block">邮箱</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full h-8 px-2.5 rounded-md text-xs bg-background border border-border focus:outline-none focus:border-foreground/30 transition-colors" />
              {email !== originalEmail && (
                <div className="flex items-center gap-2">
                  <button onClick={handleSaveProfile} disabled={savingProfile}
                    className="h-7 px-2.5 rounded-md text-[11px] bg-foreground text-background font-medium border-none cursor-pointer hover:opacity-90 disabled:opacity-50">
                    {savingProfile ? '保存中...' : '保存'}
                  </button>
                  <span className="text-[10px] text-muted-foreground">修改邮箱后需保存验证</span>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button onClick={handleSaveProfile} disabled={savingProfile}
                className="h-8 px-4 rounded-md bg-foreground text-background text-xs font-medium border-none cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity">
                {savingProfile ? '保存中...' : '保存个人资料'}
              </button>
            </div>

            <div className="pt-4 border-t border-border space-y-3">
              <label className="text-[11px] text-muted-foreground block">通过旧密码修改</label>
              <div className="relative">
                <input type={showOldPwd ? 'text' : 'password'} value={oldPwd} onChange={(e) => setOldPwd(e.target.value)}
                  placeholder="旧密码" autoComplete="off"
                  className="w-full h-8 pl-2.5 pr-8 rounded-md text-xs bg-background border border-border focus:outline-none focus:border-foreground/30 transition-colors" />
                <button type="button" onClick={() => setShowOldPwd(!showOldPwd)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-muted-foreground">
                  {showOldPwd ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
              <div className="relative">
                <input type={showNewPwd ? 'text' : 'password'} value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="新密码" autoComplete="new-password"
                  className="w-full h-8 pl-2.5 pr-8 rounded-md text-xs bg-background border border-border focus:outline-none focus:border-foreground/30 transition-colors" />
                <button type="button" onClick={() => setShowNewPwd(!showNewPwd)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-muted-foreground">
                  {showNewPwd ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
              <div className="flex justify-end">
                <button onClick={handleChangePassword} disabled={changingPwd}
                  className="h-8 px-4 rounded-md border border-border text-xs cursor-pointer bg-transparent hover:bg-muted disabled:opacity-50 transition-colors">
                  {changingPwd ? '修改中...' : '通过旧密码修改'}
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-border space-y-3">
              <label className="text-[11px] text-muted-foreground block">通过邮箱验证码修改（忘记密码时使用）</label>
              <div className="flex items-center gap-2">
                <button onClick={handleSendPwdCode} disabled={sendingPwdCode}
                  className="flex items-center gap-1 h-7 px-2.5 rounded-md text-[11px] border border-border cursor-pointer bg-transparent hover:bg-muted disabled:opacity-50 transition-colors">
                  <Mail size={10} /> {sendingPwdCode ? '发送中...' : '发送验证码'}
                </button>
                <input value={emailPwdCode} onChange={(e) => setEmailPwdCode(e.target.value)}
                  placeholder="验证码" maxLength={6}
                  className="w-24 h-7 px-2 rounded-md text-[11px] bg-background border border-border focus:outline-none focus:border-foreground/30 transition-colors" />
              </div>
              <input type="password" value={emailPwdNewPwd} onChange={(e) => setEmailPwdNewPwd(e.target.value)}
                placeholder="新密码" autoComplete="new-password"
                className="w-full h-8 px-2.5 rounded-md text-xs bg-background border border-border focus:outline-none focus:border-foreground/30 transition-colors" />
              <div className="flex justify-end">
                <button onClick={handleChangePwdByEmail} disabled={changingPwdByEmail}
                  className="h-8 px-4 rounded-md border border-border text-xs cursor-pointer bg-transparent hover:bg-muted disabled:opacity-50 transition-colors">
                  {changingPwdByEmail ? '修改中...' : '通过验证码修改'}
                </button>
              </div>
            </div>
          </Card>
          </>
        )}


        {activeTab === 'appearance' && (
          <Card className="p-5 space-y-5">
            <div className="space-y-2">
              <label className="text-[11px] text-muted-foreground block">主题模式</label>
              <div className="flex gap-2">
                {mounted ? (
                  ['light', 'dark', 'system'].map((t) => (
                    <button key={t} onClick={() => setTheme(t)}
                      className={cn(
                        'h-8 px-3 rounded-md text-xs border cursor-pointer bg-transparent transition-colors',
                        theme === t ? 'border-foreground bg-foreground/5 font-medium' : 'border-border hover:border-foreground/20',
                      )}>
                      {t === 'light' ? '浅色' : t === 'dark' ? '深色' : '跟随系统'}
                    </button>
                  ))
                ) : (
                  ['light', 'dark', 'system'].map((t) => (
                    <button key={t} disabled
                      className="h-8 px-3 rounded-md text-xs border border-border cursor-pointer bg-transparent transition-colors opacity-50">
                      {t === 'light' ? '浅色' : t === 'dark' ? '深色' : '跟随系统'}
                    </button>
                  ))
                )}
              </div>
            </div>
          </Card>
        )}

        {activeTab === 'model' && (
          <div className="space-y-5">
            <Card className="p-5 space-y-4">
              <div>
                <div className="text-xs font-medium">文本模型</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">各角色使用的 LLM 配置，生成前按角色取用，编辑保存后自动持久到本地</div>
              </div>
              <div className="space-y-2">
                {TEXT_ROLES.map((role) => {
                  const cfg = modelConfig[role.key] || DEFAULT_TEXT_ROLES[role.key];
                  const isEditing = editingRole === role.key;
                  return (
                    <div key={role.key} className="rounded-lg border border-border/60 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-medium">{role.label}</div>
                          <div className="text-[10px] text-muted-foreground">{role.desc} · {cfg.adapter} / {cfg.model_id}</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => handleTestRole(role.key)} disabled={testingRole === role.key}
                            className="h-6 px-2 rounded-md text-[10px] border border-border cursor-pointer bg-transparent hover:bg-muted disabled:opacity-50 transition-colors flex items-center gap-1">
                            <Wifi size={10} /> {testingRole === role.key ? '测试中...' : '测试'}
                          </button>
                          <button type="button" onClick={() => isEditing ? saveEditRole() : startEditRole(role.key)}
                            className="h-6 px-2 rounded-md text-[10px] border border-border cursor-pointer bg-transparent hover:bg-muted transition-colors">
                            {isEditing ? '保存' : '编辑'}
                          </button>
                        </div>
                      </div>
                      {isEditing && (
                        <div className="space-y-2">
                          <select value={editForm.adapter} onChange={(e) => {
                            const provider = e.target.value;
                            const templates = PROVIDER_TEMPLATES[provider] || [];
                            const tpl = templates[0] || { base_url: '', model_id: '' };
                            setEditForm({ ...editForm, adapter: provider, base_url: tpl.base_url, model_id: tpl.model_id });
                          }} className="w-full h-7 px-2 rounded-md text-[11px] bg-background border border-border focus:outline-none">
                            {PROVIDER_LIST.map((p) => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>
                          <div className="grid grid-cols-2 gap-2">
                            <input value={editForm.base_url} onChange={(e) => setEditForm({ ...editForm, base_url: e.target.value })}
                              placeholder="base_url" className="h-7 px-2 rounded-md text-[11px] bg-background border border-border focus:outline-none" />
                            <input value={editForm.model_id} onChange={(e) => setEditForm({ ...editForm, model_id: e.target.value })}
                              placeholder="model_id" className="h-7 px-2 rounded-md text-[11px] bg-background border border-border focus:outline-none" />
                            <input value={editForm.api_key} onChange={(e) => setEditForm({ ...editForm, api_key: e.target.value })}
                              placeholder="api_key" type="password" className="h-7 px-2 rounded-md text-[11px] bg-background border border-border focus:outline-none col-span-2" />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="p-5 space-y-4">
              <div className="text-xs font-medium">搜索配置</div>
              <div className="text-[11px] text-muted-foreground">用于 Agent 的实时网页搜索（检索外部资料辅助创作）</div>
              <div className="rounded-lg border border-border/60 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium">{searchConfig.provider || 'bocha'}</div>
                    <div className="text-[10px] text-muted-foreground">博查 Bocha · 网页搜索 API</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => {
                      if (searchConfig.api_key.trim()) {
                        persistModelConfig();
                        toast.success('搜索配置已保存');
                      } else {
                        toast.error('请输入搜索 API key');
                      }
                    }} className="h-6 px-2 rounded-md text-[10px] border border-border cursor-pointer bg-transparent hover:bg-muted transition-colors">
                      保存
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <input value={searchConfig.api_key} onChange={(e) => setSearchConfig({ ...searchConfig, api_key: e.target.value })}
                    placeholder="博查 api_key" type="password" className="w-full h-7 px-2 rounded-md text-[11px] bg-background border border-border focus:outline-none" />
                </div>
              </div>
            </Card>

            <Card className="p-5 space-y-4">
              <div className="text-xs font-medium">Embedding 模型</div>
              <div className="text-[11px] text-muted-foreground">用于个人文档向量检索，生成时自动调用</div>
              <div className="rounded-lg border border-border/60 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium">{embeddingModel.adapter}</div>
                    <div className="text-[10px] text-muted-foreground">{embeddingModel.base_url} · {embeddingModel.model_id}</div>
                  </div>
                  <button type="button" onClick={() => setEditingEmbedding(!editingEmbedding)}
                    className="h-6 px-2 rounded-md text-[10px] border border-border cursor-pointer bg-transparent hover:bg-muted transition-colors">
                    {editingEmbedding ? '保存' : '编辑'}
                  </button>
                </div>
                {editingEmbedding && (
                  <div className="space-y-2">
                    <select value={embedEditForm.adapter} onChange={(e) => {
                      const provider = e.target.value;
                      const templates = PROVIDER_TEMPLATES[provider] || [];
                      const tpl = templates[0] || { base_url: '', model_id: '' };
                      setEmbedEditForm({ ...embedEditForm, adapter: provider, base_url: tpl.base_url, model_id: tpl.model_id });
                    }} className="w-full h-7 px-2 rounded-md text-[11px] bg-background border border-border focus:outline-none">
                      {['dashscope', 'cohere', 'huggingface', 'baidu'].map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <input value={embedEditForm.model_id} onChange={(e) => setEmbedEditForm({ ...embedEditForm, model_id: e.target.value })}
                        placeholder="model_id" className="h-7 px-2 rounded-md text-[11px] bg-background border border-border focus:outline-none" />
                      <input value={embedEditForm.api_key} onChange={(e) => setEmbedEditForm({ ...embedEditForm, api_key: e.target.value })}
                        placeholder="api_key" type="password" className="h-7 px-2 rounded-md text-[11px] bg-background border border-border focus:outline-none" />
                    </div>
                    <p className="text-[10px] text-muted-foreground/60">Embedding 服务商端点固定，无需配置 base_url（dashscope/cohere/百度均由官方 SDK 直连）</p>
                    <button type="button" onClick={() => { setEmbeddingModel(embedEditForm); setEditingEmbedding(false); persistModelConfig(modelConfig, embedEditForm); }}
                      className="h-7 px-3 rounded-md text-[11px] bg-foreground text-background font-medium border-none cursor-pointer hover:opacity-90">
                      保存
                    </button>
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Cpu size={14} className="text-muted-foreground" />
                <div>
                  <div className="text-xs font-medium">本地检索模型</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">下载后保存在浏览器中，断网也能检索个人文档。精度切换请前往<span className="text-foreground font-medium">知识库</span>页面。</div>
                </div>
              </div>
              <div className="space-y-2">
                {EMBED_TIERS.map((t) => {
                  const active = embedDownloadId === t.id;
                  const isDownloaded = downloadedIds.includes(t.id);
                  return (
                    <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/30 px-3 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium truncate">{t.label}</p>
                          {isDownloaded && (
                            <span className="text-[10px] text-emerald-600 border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 rounded-full shrink-0">已下载</span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate">约 {t.sizeMB}MB · {t.desc}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isDownloaded && (
                          <button type="button" onClick={() => handleEmbedDelete(t.id)} disabled={embedDeleting === t.id}
                            className="h-7 px-2 rounded-md text-[10px] border border-border cursor-pointer bg-transparent hover:bg-muted disabled:opacity-50 transition-colors text-destructive">
                            {embedDeleting === t.id ? '删除中...' : '删除'}
                          </button>
                        )}
                        <button type="button" onClick={() => (active && embedDownloading ? cancelEmbedDownload() : handleEmbedDownload(t.id))}
                          disabled={(embedDownloading && !active) || (!active && embedDownloading)}
                          className="h-7 px-2.5 rounded-md text-[10px] border border-border cursor-pointer bg-transparent hover:bg-muted disabled:opacity-50 transition-colors">
                          {active && embedDownloading ? '取消' : isDownloaded ? '重新下载' : '下载'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {embedDownloading && embedDownloadId && (
                <div className="flex items-center gap-2 pt-1">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-foreground transition-all"
                      style={{ width: `${embedProgress && embedProgress.total > 0 ? Math.min(100, (embedProgress.loaded / embedProgress.total) * 100) : 0}%` }} />
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                    {embedProgress && embedProgress.total > 0
                      ? `${(embedProgress.loaded / 1024 / 1024).toFixed(1)} / ${(embedProgress.total / 1024 / 1024).toFixed(1)} MB`
                      : '准备中…'}
                  </span>
                </div>
              )}
            </Card>

            <Card className="p-5 space-y-4">
              <div className="text-xs font-medium">图像生成模型</div>
              <div className="text-[11px] text-muted-foreground">用于 AI 绘画，选择支持的图像生成服务</div>
              <div className="rounded-lg border border-border/60 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium">{visionModel.adapter}</div>
                    <div className="text-[10px] text-muted-foreground">{visionModel.base_url} · {visionModel.model_id}</div>
                  </div>
                  <button type="button" onClick={() => setEditingVision(!editingVision)}
                    className="h-6 px-2 rounded-md text-[10px] border border-border cursor-pointer bg-transparent hover:bg-muted transition-colors">
                    {editingVision ? '保存' : '编辑'}
                  </button>
                </div>
                {editingVision && (
                  <div className="space-y-2">
                    <select value={visionEditForm.adapter} onChange={(e) => {
                      const provider = e.target.value;
                      const templates = PROVIDER_TEMPLATES[provider] || [];
                      const tpl = templates[0] || { base_url: '', model_id: '' };
                      setVisionEditForm({ ...visionEditForm, adapter: provider, base_url: tpl.base_url, model_id: tpl.model_id });
                    }} className="w-full h-7 px-2 rounded-md text-[11px] bg-background border border-border focus:outline-none">
                      {['openai', 'stability', 'replicate', 'modelslab', 'pollinations'].map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <input value={visionEditForm.base_url} onChange={(e) => setVisionEditForm({ ...visionEditForm, base_url: e.target.value })}
                        placeholder="base_url" className="h-7 px-2 rounded-md text-[11px] bg-background border border-border focus:outline-none" />
                      <input value={visionEditForm.model_id} onChange={(e) => setVisionEditForm({ ...visionEditForm, model_id: e.target.value })}
                        placeholder="model_id" className="h-7 px-2 rounded-md text-[11px] bg-background border border-border focus:outline-none" />
                      <input value={visionEditForm.api_key} onChange={(e) => setVisionEditForm({ ...visionEditForm, api_key: e.target.value })}
                        placeholder="api_key" type="password" className="h-7 px-2 rounded-md text-[11px] bg-background border border-border focus:outline-none col-span-2" />
                    </div>
                    <button type="button" onClick={() => { setVisionModel(visionEditForm); setEditingVision(false); persistModelConfig(modelConfig, embeddingModel, visionEditForm); }}
                      className="h-7 px-3 rounded-md text-[11px] bg-foreground text-background font-medium border-none cursor-pointer hover:opacity-90">
                      保存
                    </button>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
