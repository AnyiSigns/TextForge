// src/components/layout/Sidebar.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  BookOpen, 
  Users, 
  Image, 
  Database, 
  Settings, 
  LogOut,
  Video,
  Key,
  Menu,
  Workflow,
  X,
  ChevronsLeft,
  PenLine
} from 'lucide-react';
import { useAuthStore } from '@/lib/stores/authStore';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { BackendBadge } from './BackendBadge';

const menuItems = [
  { icon: LayoutDashboard, label: '仪表盘', href: '/' },
  { icon: BookOpen, label: '项目管理', href: '/projects' },
  { icon: PenLine, label: '手稿', href: '/manuscript' },
  { icon: Users, label: '角色模拟', href: '/characters' },
  { icon: Image, label: 'AI绘画', href: '/assets' },
  { icon: Video, label: 'AI视频', href: '/tasks' },
  { icon: Database, label: '知识库', href: '/knowledge' },
  { icon: Workflow, label: '创作流程', href: '/workflow' },
  { icon: Key, label: '开放平台', href: '/api-keys' },
  { icon: Settings, label: '设置', href: '/settings' },
];

// 桌面端侧边栏
function DesktopSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const [collapsed, setCollapsed] = useState(
    typeof document !== 'undefined' && document.documentElement.classList.contains('sidebar-collapsed')
  );

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('sidebar-collapsed', next);
      return next;
    });
  };

  const handleLogout = async () => {
    await logout();
    // 硬导航：确保 cookie 已清除后再跳，绕开客户端路由守卫的竞态（避免退出后空白/转圈）
    window.location.href = '/login';
  };

  return (
    <aside className={cn(
      "hidden md:flex fixed left-0 top-0 z-40 h-screen flex-col items-center py-5 glass-sidebar transition-all duration-300",
      collapsed ? "w-[72px]" : "w-56"
    )}>
      <div className="mb-8 flex items-center justify-between w-full px-3">
        <span className={cn(
          "text-lg font-bold tracking-tight whitespace-nowrap overflow-hidden transition-all duration-300",
          collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
        )}>
          Text Forge
        </span>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
          aria-expanded={!collapsed}
          className={cn(
            "shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-ink-soft hover:bg-foreground/[0.05] hover:text-foreground transition-colors",
            collapsed && "mx-auto"
          )}
        >
          {collapsed ? <PenLine className="w-5 h-5" /> : <ChevronsLeft className="w-5 h-5" />}
        </button>
      </div>

      <nav className="flex-1 w-full space-y-0.5 px-2">
        {menuItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "nav-item-elegant",
                collapsed && "justify-center px-0",
                isActive ? "active" : "text-muted-foreground"
              )}
            >
              <item.icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.8} />
              <span className={cn(
                "text-[13px] whitespace-nowrap transition-all duration-300 overflow-hidden",
                collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="w-full px-2 border-t border-sidebar-border/60 pt-4 mt-2">
        <div className={cn("px-3 pb-2", collapsed && "hidden")}>
          <BackendBadge />
        </div>
        <div className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent/40 transition-colors cursor-pointer",
          collapsed && "justify-center px-0"
        )}>
          <Avatar className="w-8 h-8 shrink-0 ring-2 ring-primary/10">
            <AvatarImage src={user?.avatar} />
            <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">{user?.username?.slice(0, 2).toUpperCase() || 'U'}</AvatarFallback>
          </Avatar>
          <div className={cn(
            "flex-1 min-w-0 transition-all duration-300 overflow-hidden",
            collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
          )}>
            <p className="text-sm font-medium truncate">{user?.username || '未登录'}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email || ''}</p>
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          className={cn(
            "w-full text-muted-foreground hover:text-destructive mt-1 h-9",
            collapsed && "justify-center px-0"
          )}
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 shrink-0" strokeWidth={1.8} />
          <span className={cn(
            "text-[13px] transition-all duration-300 overflow-hidden",
            collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
          )}>
            退出
          </span>
        </Button>
      </div>
    </aside>
  );
}

// 移动端侧边栏（抽屉）
function MobileSidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm" className="md:hidden fixed top-4 left-4 z-50">
          <Menu className="w-5 h-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 glass-strong border-r border-sidebar-border/60">
        <div className="flex flex-col h-full p-5">
          <div className="flex items-center justify-between mb-8">
            <span className="text-lg font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Text Forge
            </span>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <nav className="flex-1 space-y-0.5">
            {menuItems.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "nav-item-elegant",
                    isActive ? "active" : "text-muted-foreground"
                  )}
                >
                  <item.icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.8} />
                  <span className="text-[13px] font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-sidebar-border/60 pt-4 mt-2">
            <div className="px-3 pb-2">
              <BackendBadge />
            </div>
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent/40 transition-colors">
              <Avatar className="w-8 h-8 shrink-0 ring-2 ring-primary/10">
                <AvatarImage src={user?.avatar} />
                <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">{user?.username?.slice(0, 2).toUpperCase() || 'U'}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.username || '未登录'}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email || ''}</p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full justify-start gap-3 px-3 text-muted-foreground hover:text-destructive mt-1 h-9"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4 shrink-0" strokeWidth={1.8} />
              <span className="text-[13px]">退出</span>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function Sidebar() {
  return (
    <>
      <DesktopSidebar />
      <MobileSidebar />
    </>
  );
}