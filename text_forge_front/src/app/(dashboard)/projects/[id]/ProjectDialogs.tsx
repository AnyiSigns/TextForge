// src/app/(dashboard)/projects/[id]/ProjectDialogs.tsx
// 项目工作台的弹窗：AI 生成结果应用。纯视图，状态来自 useWorkbench。
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useWorkbench } from '@/features/projects';

export function ProjectDialogs({ wb }: { wb: ReturnType<typeof useWorkbench> }) {
  const { aiDialog, setAiDialog, applyAiResult } = wb;
  return (
    <>
      <Dialog open={aiDialog.open} onOpenChange={(open) => setAiDialog((d) => ({ ...d, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>AI 生成结果</DialogTitle>
            <DialogDescription>选择如何应用到该步骤正文</DialogDescription>
          </DialogHeader>
          <div className="max-h-48 overflow-auto rounded-lg border border-border/40 bg-muted/30 p-3 text-xs whitespace-pre-wrap">
            {aiDialog.result}
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => applyAiResult('copy')}>复制</Button>
            <Button size="sm" variant="outline" onClick={() => applyAiResult('append')}>追加</Button>
            <Button size="sm" onClick={() => applyAiResult('replace')}>替换</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
