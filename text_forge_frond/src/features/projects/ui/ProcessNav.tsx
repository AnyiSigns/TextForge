// src/components/projects/ProcessNav.tsx
'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface ProcessTab {
  value: string;
  label: string;
  icon: LucideIcon;
}

export function ProcessNav({
  tabs,
  value,
  onValueChange,
  children,
}: {
  tabs: ProcessTab[];
  value: string;
  onValueChange: (v: string) => void;
  children: React.ReactNode;
}) {
  const nav = (
    <div className="relative z-50">
      <div className="glass-surface rounded-2xl p-1.5 flex w-full gap-1" style={{ ['--surface-opacity' as string]: '0.14', ['--surface-blur' as string]: '10px' }}>
        {tabs.map((t) => {
          const active = value === t.value;
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              onClick={() => onValueChange(t.value)}
              className={cn(
                'relative flex-1 flex items-center justify-center gap-2 px-2 py-2 rounded-xl text-sm font-medium transition-all duration-300 whitespace-nowrap min-w-0',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              )}
            >
              {active && (
                <motion.span
                  layoutId="process-nav-active"
                  className="absolute inset-0 rounded-xl bg-primary/12 ring-1 ring-primary/20 shadow-sm"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <Icon className="w-4 h-4 relative z-10 shrink-0" strokeWidth={1.8} />
              <span className="relative z-10 truncate">{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const content = (
    <motion.div
      key={value}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );

  return (
    <div className="space-y-5">
      {nav}
      {content}
    </div>
  );
}
