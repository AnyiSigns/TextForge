'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, BookOpen, Users, Database, Settings,
  Workflow, PenLine, ChevronsLeft, LogOut, Bot,
  Wifi,
} from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useAuthStore } from '@/shared/stores/authStore';
import * as userApi from '@/shared/api/user';
import * as booksApi from '@/shared/api/books';
import * as systemApi from '@/shared/api/system';
import { useBookDetailStore } from './books/[id]/store';
import { AgentPanel } from './books/[id]/AgentPanel/AgentPanel';

const menuGroups = [
  {
    label: '创作区',
    items: [
      { icon: LayoutDashboard, label: '仪表盘', href: '/' },
      { icon: BookOpen, label: '书籍管理', href: '/books' },
      { icon: PenLine, label: '手稿', href: '/manuscript' },
      { icon: Users, label: '角色模拟', href: '/characters' },
      { icon: Workflow, label: '创作流程', href: '/workflow' },
      { icon: Database, label: '知识库', href: '/knowledge' },
    ],
  },
  {
    label: '设置',
    items: [
      { icon: Settings, label: '偏好设置', href: '/settings' },
    ],
  }
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [bookStats, setBookStats] = useState({ total: 0, currentWords: 0, goal: 0, type: '' });
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const [panelWidth, setPanelWidth] = useState(340);
  const [panelFullscreen, setPanelFullscreen] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleResizeDown = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startWidth: panelWidth };
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeUp);
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizeRef.current) return;
    const delta = resizeRef.current.startX - e.clientX;
    setPanelWidth(Math.max(260, Math.min(700, resizeRef.current.startWidth + delta)));
  };

  const handleResizeUp = () => {
    resizeRef.current = null;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeUp);
  };

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const ping = async () => {
      try {
        const { latencyMs } = await systemApi.fetchHealth();
        setLatencyMs(latencyMs ?? null);
      } catch {
        setLatencyMs(null);
      }
    };
    void ping();
    timer = setInterval(ping, 10000);
    return () => { if (timer) clearInterval(timer); };
  }, []);

  useEffect(() => {
    userApi.fetchProfile().then((p) => {
      setUserName(p.username || '');
      setUserEmail(p.email || '');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (pathname && pathname.startsWith('/books/') && pathname !== '/books') {
      setCollapsed(true);
    }
  }, [pathname]);

  useEffect(() => {
    const bookIdMatch = pathname?.match(/^\/books\/(\d+)/);
    if (bookIdMatch) {
      const bookId = parseInt(bookIdMatch[1], 10);
      booksApi.fetchBook(bookId).then((book) => {
        setBookStats({
          total: 1,
          currentWords: book.currentWordCount || 0,
          goal: book.totalWordGoal || 0,
          type: book.genre || '',
        });
      }).catch(() => {});
    } else {
      setBookStats({ total: 0, currentWords: 0, goal: 0, type: '' });
    }
  }, [pathname]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setUserMenuOpen(false); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [userMenuOpen]);

  const agentActive = useBookDetailStore((s) => s.agentOpen);

  const isBookDetail = pathname?.startsWith('/books/') && pathname !== '/books';

  const toggleAgent = () => {
    if (isBookDetail) {
      const store = useBookDetailStore.getState();
      store.setAgentOpen(!store.agentOpen);
    }
  };

  const toggleSidebar = () => {
    setCollapsed(!collapsed);
  };


  const progress = bookStats.goal > 0 ? Math.min(100, Math.round((bookStats.currentWords / bookStats.goal) * 100)) : 0;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background" style={{ paddingBottom: 24 }}>
      <div className="flex flex-1 min-h-0">
        {!panelFullscreen && (
          <>
            <aside className={cn('app-sidebar', collapsed && 'is-collapsed')}>
        <div className="app-sidebar-header">
          <span className="app-sidebar-brand">Text Forge</span>
          <button
            type="button"
            onClick={toggleSidebar}
            className="app-sidebar-toggle"
            aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            <ChevronsLeft size={18} className={cn('transition-transform', collapsed && 'rotate-180')} />
          </button>
        </div>

        <nav className="app-sidebar-nav">
          {menuGroups.map((group) => (
            <div key={group.label}>
              <div className="app-nav-group-label">{group.label}</div>
              {group.items.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href + '/'));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn('app-nav-item', isActive && 'is-active')}
                  >
                    <item.icon size={18} strokeWidth={1.8} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="app-sidebar-footer">
          <div className="app-user-row" onClick={() => setUserMenuOpen(!userMenuOpen)}>
            <div className="app-user-avatar">{userName ? userName.charAt(0).toUpperCase() : 'U'}</div>
            <div className="app-user-info">
              <div className="app-user-name">{userName || '用户名'}</div>
              <div className="app-user-email">{userEmail || 'user@email.com'}</div>
            </div>
          </div>
          {userMenuOpen && (
            <div ref={userMenuRef} className="app-user-popup" style={{ left: collapsed ? 60 : 228 }}>
              <div className="app-user-popup-item">
                <div className="app-user-avatar" style={{ width: 24, height: 24, fontSize: 10 }}>{userName ? userName.charAt(0).toUpperCase() : 'U'}</div>
                <div>
                  <div className="text-xs font-medium">{userName || '用户名'}</div>
                  <div className="text-[10px] text-muted-foreground">{userEmail || 'user@email.com'}</div>
                </div>
              </div>
              <div className="app-user-popup-sep" />
              <button className="app-user-popup-item is-danger" onClick={() => useAuthStore.getState().logout()}>
                <LogOut size={14} />
                <span>退出登录</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-hidden">{children}</main>
          </>
        )}

        {agentActive && (
          <div className="app-right-panel" style={{ width: panelFullscreen ? undefined : panelWidth, flex: panelFullscreen ? 1 : undefined }}>
            {!panelFullscreen && (
              <div
                className={cn('app-right-panel-handle', resizeRef.current && 'is-dragging')}
                onMouseDown={handleResizeDown}
              />
            )}
            <AgentPanel panelFullscreen={panelFullscreen} onToggleFullscreen={() => setPanelFullscreen(!panelFullscreen)} />
          </div>
        )}
      </div>

      <footer className="app-statusbar">
        <div className="app-statusbar-left">
          <span className="app-statusbar-item text-muted-foreground">
            书籍总数：<span className="font-medium text-foreground">{bookStats.total}</span>
          </span>
          <span className="app-statusbar-sep" />
          <span className="app-statusbar-item flex items-center gap-1" title="网络延迟">
            <Wifi size={10} className="text-foreground/60" />
            <span className="font-mono text-[10px]">{latencyMs !== null ? `${latencyMs}ms` : '--ms'}</span>
          </span>
          {isBookDetail && (
            <>
              <span className="app-statusbar-sep" />
              <span className="app-statusbar-item text-muted-foreground">
                当前书籍<span className="text-border mx-1">|</span><span className="text-foreground/80">{bookStats.type}</span>
              </span>
              <span className="app-statusbar-sep" />
              <span className="app-statusbar-item text-muted-foreground">目标 <span className="font-medium text-foreground">{bookStats.goal.toLocaleString()}</span></span>
              <span className="app-statusbar-sep" />
              <span className="app-statusbar-item text-muted-foreground">当前 <span className="font-medium text-foreground">{bookStats.currentWords.toLocaleString()}</span></span>
              <span className="app-statusbar-sep" />
              <span className="app-statusbar-item text-muted-foreground">进度 <span className="font-medium text-foreground">{progress}%</span></span>
            </>
          )}
        </div>
        <div className="app-statusbar-right">
          <span className="app-statusbar-item text-muted-foreground" style={{ fontFamily: 'var(--font-mono)' }}>
            {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button
            type="button"
            onClick={toggleAgent}
            className={cn('app-statusbar-btn', agentActive && 'is-active')}
          >
            <Bot size={11} />
            <span>AI</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
