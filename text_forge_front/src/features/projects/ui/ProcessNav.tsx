// src/components/projects/ProcessNav.tsx
'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';

export interface ProcessTab {
  value: string;
  label: string;
  icon: LucideIcon;
  group?: string;
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
  const hasGroups = tabs.some((t) => t.group);

  const groupedTabs = useMemo(() => {
    if (!hasGroups) return [];
    const groups: Record<string, ProcessTab[]> = {};
    tabs.forEach((t) => {
      const g = t.group ?? '其他';
      if (!groups[g]) groups[g] = [];
      groups[g].push(t);
    });
    return Object.entries(groups);
  }, [tabs, hasGroups]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (name: string) => {
    setOpenGroups((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const nav = (
    <div className="relative z-50">
      {hasGroups ? (
        <div
          className="glass-surface rounded-2xl p-1.5 space-y-1"
          style={{ ['--surface-opacity' as string]: '0.18', ['--surface-blur' as string]: '12px' }}
        >
          {groupedTabs.map(([groupName, groupTabs]) => {
            const isOpen = openGroups[groupName] !== false;
            return (
              <div key={groupName}>
                <button
                  type="button"
                  onClick={() => toggleGroup(groupName)}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <motion.div
                    animate={{ rotate: isOpen ? 0 : -90 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.8} />
                  </motion.div>
                  {groupName}
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      className="flex flex-wrap gap-1 ml-2"
                    >
                      {groupTabs.map((t) => {
                        const active = value === t.value;
                        const Icon = t.icon;
                        return (
                          <button
                            key={t.value}
                            onClick={() => onValueChange(t.value)}
                            className={cn(
                              'relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm font-medium transition-all duration-300 whitespace-nowrap',
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
                            <span className="relative z-10">{t.label}</span>
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="glass-surface rounded-2xl p-1.5 flex w-full gap-1"
          style={{ ['--surface-opacity' as string]: '0.14', ['--surface-blur' as string]: '10px' }}
        >
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
      )}
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
