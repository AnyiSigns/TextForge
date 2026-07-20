// src/components/layout/Footer.tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Keyboard } from 'lucide-react';

const SHORTCUTS = [
  { key: 'Ctrl / Cmd + K', desc: '打开全局搜索（项目 / 角色）' },
  { key: 'Ctrl / Cmd + N', desc: '新建项目，跳转到创建页' },
  { key: 'Ctrl / Cmd + S', desc: '在工作台保存当前草稿（手稿为自动保存）' },
  { key: 'Ctrl / Cmd + Space', desc: '手稿写作区触发 AI 联想（@ 提及角色 / # 提及设定）' },
  { key: 'Ctrl / Cmd + Shift + E', desc: '导出整个工作区备份' },
  { key: 'Ctrl / Cmd + Shift + Delete', desc: '清空所有本地草稿（需二次确认）' },
  { key: 'Esc', desc: '关闭当前弹窗 / 搜索框' },
];

// 右下角贴边的键盘图标入口：悬浮显示提示，点击展开快捷键详情
export function Footer() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-3 right-3 z-30">
      <Dialog open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="键盘快捷键"
                onClick={() => setOpen(true)}
                className="grid place-items-center w-9 h-9 rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-foreground/5 transition-all"
              >
                <Keyboard className="w-[18px] h-[18px]" strokeWidth={1.5} />
              </button>
            }
          />
          <TooltipContent side="top">快捷键</TooltipContent>
        </Tooltip>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>快捷键列表</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {SHORTCUTS.map((s) => (
              <div key={s.key} className="flex justify-between items-center py-1.5 border-b border-border/40 last:border-0">
                <kbd className="px-2 py-1 text-xs bg-muted/60 rounded">{s.key}</kbd>
                <span className="text-sm text-muted-foreground">{s.desc}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
