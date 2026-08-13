'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen, Database, Settings,
  Workflow, ChevronsLeft, LogOut, Menu, X,
} from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useAuthStore } from '@/shared/stores/authStore';
import * as userApi from '@/shared/api/user';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useBookDetailStore } from './books/[id]/store';
import { AgentPanel } from './books/[id]/AgentPanel/AgentPanel';

// 布局尺寸常量（统一命名，避免散落魔数）
const SIDEBAR_MIN_WIDTH = 56;
const SIDEBAR_MAX_WIDTH = 400;
const SIDEBAR_COLLAPSED_WIDTH = 56;
const SIDEBAR_DEFAULT_WIDTH = 224;
const SIDEBAR_AUTO_COLLAPSE_THRESHOLD = 120;
const PANEL_MIN_WIDTH = 260;
const PANEL_MAX_WIDTH = 700;
const PANEL_DEFAULT_WIDTH = 340;
const PANEL_POPUP_OFFSET = 228;
const PANEL_POPUP_OFFSET_COLLAPSED = 60;

const menuGroups = [
  {
    label: '',
    items: [
      { icon: BookOpen, label: '书籍', href: '/books' },
      { icon: Workflow, label: '工作流', href: '/workflow' },
      { icon: Database, label: '知识库', href: '/knowledge' },
      { icon: Settings, label: '设置', href: '/settings' },
    ],
  },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { hasHydrated } = useAuthStore();

  // 移动端（<768px）：侧边栏变为抽屉，默认收起；桌面端沿用可折叠/可拖拽宽度
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // 用户信息直接订阅 authStore（登录/刷新/登出后自动同步），不再手动拷贝到本地 state
  const authUser = useAuthStore((s) => s.user);
  // 兜底：store 无 user 但会话仍有效时（如持久层被清但 cookie 仍在）回退 fetchProfile
  const [profileFallback, setProfileFallback] = useState<{ username: string; email: string } | null>(null);
  const userName = authUser?.username ?? profileFallback?.username ?? '';
  const userEmail = authUser?.email ?? profileFallback?.email ?? '';
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_WIDTH);
  const [panelFullscreen, setPanelFullscreen] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [panelDragging, setPanelDragging] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [sidebarDragging, setSidebarDragging] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);
  const agentActive = useBookDetailStore((s) => s.agentOpen);

  useEffect(() => {
    // 优先使用 authStore 中已恢复的完整 profile；缺失时回退 fetchProfile。
    if (authUser) return;
    userApi.fetchProfile().then((p) => {
      setProfileFallback({ username: p.username || '', email: p.email || '' });
    }).catch(() => {});
  }, [authUser]);

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

  // 移动端抽屉：路由切换后自动关闭；切回桌面端时复位（渲染期调整，同下方 prevPathname 模式）
  if (!isMobile && mobileSidebarOpen) {
    setMobileSidebarOpen(false);
  }

  // 移动端抽屉打开时锁定页面滚动（DOM 外部系统同步，非级联渲染）
  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = mobileSidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobile, mobileSidebarOpen]);

  if (!hasHydrated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-sm text-muted-foreground">加载中...</div>
      </div>
    );
  }

  const handleResizeDown = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startWidth: panelWidth };
    setPanelDragging(true);
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeUp);
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizeRef.current) return;
    const delta = resizeRef.current.startX - e.clientX;
    setPanelWidth(Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, resizeRef.current.startWidth + delta)));
  };

  const handleResizeUp = () => {
    resizeRef.current = null;
    setPanelDragging(false);
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeUp);
  };

  const handleSidebarResizeDown = (e: React.MouseEvent) => {
    if (collapsed) return;
    e.preventDefault();
    setSidebarDragging(true);
    sidebarResizeRef.current = { startX: e.clientX, startWidth: sidebarWidth };
    document.addEventListener('mousemove', handleSidebarResizeMove);
    document.addEventListener('mouseup', handleSidebarResizeUp);
  };

  const handleSidebarResizeMove = (e: MouseEvent) => {
    if (!sidebarResizeRef.current) return;
    const newWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, sidebarResizeRef.current.startWidth + (e.clientX - sidebarResizeRef.current.startX)));
    setSidebarWidth(newWidth);
  };

  const handleSidebarResizeUp = () => {
    sidebarResizeRef.current = null;
    setSidebarDragging(false);
    document.removeEventListener('mousemove', handleSidebarResizeMove);
    document.removeEventListener('mouseup', handleSidebarResizeUp);
    setSidebarWidth((current) => {
      if (current < SIDEBAR_AUTO_COLLAPSE_THRESHOLD) {
        setCollapsed(true);
        return SIDEBAR_COLLAPSED_WIDTH;
      } else {
        setCollapsed(false);
        return current;
      }
    });
  };

  // 进入书籍详情页时自动折叠侧边栏（渲染期间调整，React 会立即重渲染）；
  // 移动端路由切换后自动收起抽屉
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (pathname && pathname.startsWith('/books/') && pathname !== '/books') {
      setCollapsed(true);
    }
    if (isMobile) {
      setMobileSidebarOpen(false);
    }
  }

  const toggleSidebar = () => {
    if (collapsed) {
      setSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
      setCollapsed(false);
    } else {
      setSidebarWidth(SIDEBAR_COLLAPSED_WIDTH);
      setCollapsed(true);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background dashboard-main">
      {isMobile && (
        <div className="app-mobile-topbar">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            className="app-mobile-menu-btn"
            aria-label={mobileSidebarOpen ? '关闭侧边栏' : '打开侧边栏'}
          >
            {mobileSidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <span className="app-mobile-brand">Text Forge</span>
        </div>
      )}
      <div className="flex flex-1 min-h-0">
        {!panelFullscreen && (
          <>
            {isMobile && mobileSidebarOpen && (
              <div className="app-sidebar-backdrop" onClick={() => setMobileSidebarOpen(false)} />
            )}
            <aside
              className={cn(
                'app-sidebar',
                !isMobile && collapsed && 'is-collapsed',
                isMobile && mobileSidebarOpen && 'is-open',
              )}
              style={isMobile ? undefined : { width: collapsed ? 56 : sidebarWidth }}
            >
        <div className="app-sidebar-header">
          <span className="app-sidebar-brand">Text Forge</span>
          {!isMobile ? (
            <button
              type="button"
              onClick={toggleSidebar}
              className="app-sidebar-toggle"
              aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
            >
              <ChevronsLeft size={18} className={cn('transition-transform', collapsed && 'rotate-180')} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              className="app-sidebar-toggle"
              aria-label="关闭侧边栏"
            >
              <X size={18} />
            </button>
          )}
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
                    title={collapsed && !isMobile ? item.label : undefined}
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
              <div ref={userMenuRef} className="app-user-popup" style={{ left: collapsed ? PANEL_POPUP_OFFSET_COLLAPSED : PANEL_POPUP_OFFSET }}>
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

            <div
              className={cn(
                'hidden lg:block w-[4px] h-full cursor-ew-resize transition-colors hover:bg-foreground/[0.06] flex-shrink-0',
                sidebarDragging && 'bg-foreground/[0.08]',
                collapsed && 'pointer-events-none',
              )}
              onMouseDown={handleSidebarResizeDown}
            />

      <main className="flex-1 overflow-hidden"
        style={{ pointerEvents: sidebarDragging ? 'none' : 'auto' }}
      >{children}</main>
          </>
        )}

        {agentActive && (
          <div
            className="app-right-panel"
            style={isMobile ? undefined : { width: panelFullscreen ? undefined : panelWidth, flex: panelFullscreen ? 1 : undefined }}
          >
            {!panelFullscreen && !isMobile && (
              <div
                className={cn('app-right-panel-handle', panelDragging && 'is-dragging')}
                onMouseDown={handleResizeDown}
              />
            )}
            <AgentPanel panelFullscreen={panelFullscreen} onToggleFullscreen={() => setPanelFullscreen(!panelFullscreen)} />
          </div>
        )}
      </div>
    </div>
  );
}
