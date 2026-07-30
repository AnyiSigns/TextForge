// src/features/user-agent/ui/SelectionToolbar.tsx
// 选中感知浮动工具栏：编辑器中选中文字时浮现

'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Sparkles,
  Wand2,
  Expand,
  Shrink,
  SearchCheck,
} from 'lucide-react';

interface SelectionToolbarProps {
  selectedText: string;
  position: { x: number; y: number };
  onAction: (action: string) => void;
  onHide: () => void;
}

const ACTIONS = [
  { id: 'polish', label: '润色', icon: Sparkles },
  { id: 'expand', label: '扩展', icon: Expand },
  { id: 'rephrase', label: '改视角', icon: Wand2 },
  { id: 'check', label: '检查一致性', icon: SearchCheck },
];

export function SelectionToolbar({
  selectedText,
  position,
  onAction,
  onHide,
}: SelectionToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        toolbarRef.current &&
        !toolbarRef.current.contains(e.target as Node)
      ) {
        onHide();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onHide]);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div
      ref={toolbarRef}
      className={cn(
        'fixed z-50 flex items-center gap-1 px-2 py-1 bg-background/95 backdrop-blur-sm border border-border/50 rounded-lg shadow-lg',
        'animate-in fade-in slide-in-from-bottom-2'
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y - 40}px`,
        transform: 'translateX(-50%)',
      }}
    >
      <span className="text-[10px] text-muted-foreground mr-1 max-w-[120px] truncate">
        {selectedText}
      </span>
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <Button
            key={action.id}
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] gap-1"
            onClick={() => onAction(action.id)}
          >
            <Icon className="h-3 w-3" />
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}