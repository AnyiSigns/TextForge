// src/app/(dashboard)/projects/[id]/ProjectDialogs.tsx
// 项目工作台的两个弹窗：AI 生成结果应用、一句话开局。纯视图，状态来自 useWorkbench。
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Loader2 } from 'lucide-react';
import { useWorkbench } from '@/features/projects';

export function ProjectDialogs({ wb }: { wb: ReturnType<typeof useWorkbench> }) {
  const { aiDialog, setAiDialog, applyAiResult, seedOpen, setSeedOpen, seedPrompt, setSeedPrompt, handleSeed, isSeeding } = wb;
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

      <Dialog open={seedOpen} onOpenChange={setSeedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> 一句话开局</DialogTitle>
            <DialogDescription>输入一句话（如「一艘拾荒船打捞星海记忆的科幻故事」），自动生成世界观、角色与大纲，再进流水线写正文。</DialogDescription>
          </DialogHeader>
          <Input
            value={seedPrompt}
            onChange={(e) => setSeedPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSeed(); }}
            placeholder="用一句话描述你想写的小说…"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setSeedOpen(false)}>取消</Button>
            <Button size="sm" onClick={handleSeed} disabled={isSeeding || !seedPrompt.trim()}>
              {isSeeding ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
              {isSeeding ? '生成中…' : '开局'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
