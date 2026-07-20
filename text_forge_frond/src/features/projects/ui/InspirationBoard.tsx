// src/components/projects/InspirationBoard.tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, Plus, Trash2, Lightbulb, FileInput } from 'lucide-react';
import { cn } from '@/lib/utils';
import { loadInspiration, saveInspiration, type InspirationItem } from '@/lib/storage/backup';
import { dispatchInsertStep } from '@/lib/events/projectEvents';
import { toast } from 'sonner';

export function InspirationBoard({ projectId }: { projectId: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [items, setItems] = useState<InspirationItem[]>([]);
  const [newContent, setNewContent] = useState('');

  useEffect(() => {
    let active = true;
    loadInspiration(projectId).then((s) => { if (active) setItems(s); }).catch(() => {});
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    saveInspiration(projectId, items).catch(() => {});
  }, [items, projectId]);

  const addItem = () => {
    if (!newContent.trim()) return;
    setItems([...items, {
      id: `ins-${Date.now()}`,
      type: 'text',
      content: newContent.trim(),
      createdAt: new Date().toISOString(),
    }]);
    setNewContent('');
  };

  const deleteItem = (id: string) => setItems(items.filter(i => i.id !== id));

  return (
    <Card className="glass-card mt-6">
      <CardHeader className="cursor-pointer select-none" onClick={() => setIsExpanded(v => !v)}>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-primary" />
            灵感剪藏
          </span>
          <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
        </CardTitle>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="记录灵感..." onKeyDown={e => e.key === 'Enter' && addItem()} />
            <Button size="sm" onClick={addItem}><Plus className="w-4 h-4" /></Button>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {items.map(item => (
              <div key={item.id} className="rounded-xl border border-border/40 p-3 text-xs flex justify-between">
                <p className="flex-1 truncate">{item.content}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  title="作为章节插入工作台"
                  onClick={() => {
                    dispatchInsertStep({ projectId, title: '灵感', content: item.content });
                    toast.success('已发送到工作台');
                  }}
                >
                  <FileInput className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => deleteItem(item.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>

          {items.length > 0 && (
            <p className="text-xs text-center text-muted-foreground">已自动保存</p>
          )}
        </CardContent>
        )}
    </Card>
  );
}