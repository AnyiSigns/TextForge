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
  const [agentOpen, setAgentOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (pathname && pathname.startsWith('/books/') && pathname !== '/books') {
      setCollapsed(true);
    }
  }, [pathname]);

  const toggleAgent = () => {
    setAgentOpen(!agentOpen);
  };

  const toggleSidebar = () => {
    setCollapsed(!collapsed);
  };

  const getStatusbarContext = () => {
    if (pathname?.startsWith('/books/') && pathname !== '/books') {
      return { label: '当前书籍', type: '书籍类型', goal: '字数目标', currentWords: '0', progress: '0%', books: 0, latency: '0ms' };
    }
    return { label: 'TextForge', type: '', goal: '', currentWords: '', progress: '', books: 0, latency: '0ms' };
  };

  const statusbarCtx = getStatusbarContext();
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const isBookDetail = pathname?.startsWith('/books/') && pathname !== '/books';

  return (
    <div className="flex h-screen overflow-hidden bg-background">
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
            <div className="app-user-avatar">U</div>
            <div className="app-user-info">
              <div className="app-user-name">用户名</div>
              <div className="app-user-email">user@email.com</div>
            </div>
          </div>
          {userMenuOpen && (
            <div ref={userMenuRef} className="app-user-popup" style={{ left: collapsed ? 60 : 228 }}>
              <div className="app-user-popup-item">
                <div className="app-user-avatar" style={{ width: 24, height: 24, fontSize: 10 }}>U</div>
                <div>
                  <div className="text-xs font-medium">用户名</div>
                  <div className="text-[10px] text-muted-foreground">user@email.com</div>
                </div>
              </div>
              <div className="app-user-popup-sep" />
              <button className="app-user-popup-item is-danger">
                <LogOut size={14} />
                <span>退出登录</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-hidden transition-all duration-300" style={{ paddingBottom: 24, marginRight: agentOpen ? 340 : 0 }}>{children}</main>

      {/* 全局状态栏 */}
      <footer className="app-statusbar">
        <div className="app-statusbar-left">
          <span className="app-statusbar-item text-muted-foreground">
            书籍总数：<span className="font-medium text-foreground">{statusbarCtx.books}</span>
          </span>
          <span className="app-statusbar-sep" />
          <span className="app-statusbar-item flex items-center gap-1" title={`网络延迟 ${statusbarCtx.latency}`}>
            <Wifi size={10} className="text-foreground/60" />
            <span className="font-mono text-[10px]">{statusbarCtx.latency}</span>
          </span>
          {isBookDetail && (
            <>
              <span className="app-statusbar-sep" />
              <span className="app-statusbar-item text-muted-foreground">
                {statusbarCtx.label}<span className="text-border mx-1">|</span><span className="text-foreground/80">{statusbarCtx.type}</span>
              </span>
              <span className="app-statusbar-sep" />
              <span className="app-statusbar-item text-muted-foreground">{statusbarCtx.goal}</span>
              <span className="app-statusbar-sep" />
              <span className="app-statusbar-item text-muted-foreground">当前 <span className="font-medium text-foreground">{statusbarCtx.currentWords}</span></span>
              <span className="app-statusbar-sep" />
              <span className="app-statusbar-item text-muted-foreground">进度 <span className="font-medium text-foreground">{statusbarCtx.progress}</span></span>
            </>
          )}
        </div>
        <div className="app-statusbar-right">
          <span className="app-statusbar-item text-muted-foreground" style={{ fontFamily: 'var(--font-mono)' }}>{timeStr}</span>
          <button
            type="button"
            onClick={toggleAgent}
            className={cn('app-statusbar-btn', agentOpen && 'is-active')}
          >
            <Bot size={11} />
            <span>AI</span>
          </button>
        </div>
      </footer>

      {/* Agent 会话浮层 */}
      {agentOpen && (
        <aside className="app-agent-panel">
          <div className="app-agent-header">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">AI 助手</span>
            <span className="text-[10px] text-foreground/60 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-foreground/60" />就绪
            </span>
          </div>
          <div className="app-agent-body">
            <div className="text-xs text-muted-foreground text-center mt-8">暂无消息</div>
          </div>
          <div className="app-agent-input-row">
            <input
              type="text"
              placeholder="输入指令..."
              className="flex-1 h-8 px-3 rounded-md text-xs bg-background border border-border focus:outline-none"
            />
            <button className="h-8 px-3 rounded-md bg-foreground text-background text-xs font-medium border-none cursor-pointer hover:opacity-90 transition-opacity">
              发送
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
