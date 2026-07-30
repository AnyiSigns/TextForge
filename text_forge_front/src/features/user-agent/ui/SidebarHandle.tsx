// src/features/user-agent/ui/SidebarHandle.tsx
// 侧边栏拖拽手柄：控制折叠/展开、宽度调整

'use client';

import { useRef, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarHandleProps {
  isOpen: boolean;
  onToggle: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
}

export function SidebarHandle({ isOpen, onToggle, onMouseDown }: SidebarHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const handleRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  
  // 拖拽调整宽度
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = startXRef.current - e.clientX;
    const newWidth = Math.max(300, Math.min(600, startWidthRef.current + deltaX));
    
    // 通过 CSS 变量控制宽度
    document.documentElement.style.setProperty('--agent-sidebar-width', `${newWidth}px`);
    
    // 保存到 localStorage
    localStorage.setItem('agentSidebarWidth', newWidth.toString());
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };
  
  const handleDragStart = (e: React.MouseEvent) => {
    if (!isOpen) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const handle = handleRef.current;
    if (!handle) return;
    
    const rect = handle.getBoundingClientRect();
    const sidebar = handle.parentElement;
    if (!sidebar) return;
    
    startXRef.current = e.clientX;
    startWidthRef.current = sidebar.offsetWidth;
    
    setIsDragging(true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // 防止选中文本
    document.body.style.userSelect = 'none';
  };
  
  // 清理
  useEffect(() => {
    return () => {
      document.body.style.userSelect = '';
    };
  }, []);
  
  // 从 localStorage 恢复宽度
  useEffect(() => {
    const savedWidth = localStorage.getItem('agentSidebarWidth');
    if (savedWidth) {
      document.documentElement.style.setProperty('--agent-sidebar-width', `${savedWidth}px`);
    }
  }, []);
  
  return (
    <div
      ref={handleRef}
      className={cn(
        'fixed top-0 right-0 h-full w-2 cursor-ew-resize z-50',
        'bg-gradient-to-l from-transparent via-border/30 to-transparent',
        'transition-all duration-200',
        isOpen ? 'right-0' : 'right-[380px]',
        isDragging && 'bg-primary/20 cursor-ew-resize',
        'hover:bg-primary/10'
      )}
      onMouseDown={handleDragStart}
      onMouseDownCapture={(e) => onMouseDown?.(e)}
      aria-label={isOpen ? '拖拽调整宽度，点击折叠' : '点击展开 Agent 面板'}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      {/* 折叠/展开指示器 */}
      <div className={cn(
        'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
        'w-6 h-6 rounded-full bg-background/80 backdrop-blur-sm',
        'flex items-center justify-center',
        'border border-border/50',
        'transition-transform duration-200',
        isOpen ? 'rotate-180' : 'rotate-0'
      )}>
        {isOpen ? (
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      
      {/* 拖拽提示 */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-[32px]">
        <GripVertical className="h-4 w-4 text-muted-foreground/50" />
      </div>
      
      {/* 展开时显示宽度提示 */}
      {isOpen && !isDragging && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground/60 whitespace-nowrap">
          拖拽调整宽度 (300-600px)
        </div>
      )}
    </div>
  );
}