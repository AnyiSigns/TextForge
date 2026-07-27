'use client';

import { useState, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FolderOpen, FileText, Plus, ChevronRight, ChevronDown, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OutlineVolume } from '@/lib/storage/backup';
import { toast } from 'sonner';

interface MainTextTargetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  volumes: OutlineVolume[];
  mainText: string;
  onConfirm: (action: 'create_volume' | 'create_chapter' | 'overwrite_chapter', payload: { volumeId?: string; chapterId?: string; volumeTitle?: string; chapterTitle?: string }) => void;
}

export function MainTextTargetDialog({ open, onOpenChange, volumes, mainText, onConfirm }: MainTextTargetDialogProps) {
  const [selectedVolId, setSelectedVolId] = useState<string | null>(null);
  const [selectedChapId, setSelectedChapId] = useState<string | null>(null);
  const [expandedVols, setExpandedVols] = useState<Set<string>>(new Set());
  const [newVolName, setNewVolName] = useState('');
  const [newChapName, setNewChapName] = useState('');
  const [newVolDialogOpen, setNewVolDialogOpen] = useState(false);
  const [volError, setVolError] = useState('');

  const selectedVol = useMemo(() => volumes.find(v => v.id === selectedVolId) || null, [volumes, selectedVolId]);
  const selectedChap = useMemo(() => volumes.flatMap(v => v.chapters).find(c => c.id === selectedChapId) || null, [volumes, selectedChapId]);

  const reset = useCallback(() => {
    setSelectedVolId(null);
    setSelectedChapId(null);
    setExpandedVols(new Set());
    setNewVolName('');
    setNewChapName('');
    setVolError('');
  }, []);

  const handleOpenChange = useCallback((v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  }, [onOpenChange, reset]);

  const toggleVolume = useCallback((volId: string) => {
    setExpandedVols(prev => {
      const next = new Set(prev);
      if (next.has(volId)) { next.delete(volId); } else { next.add(volId); }
      return next;
    });
  }, []);

  const handleVolumeNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewVolName(e.target.value);
  }, []);

  const handleChapterNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewChapName(e.target.value);
  }, []);

  const handleCreateVolume = useCallback(() => {
    setNewVolDialogOpen(true);
  }, []);

  const handleConfirmCreateVolume = useCallback(() => {
    const name = newVolName.trim();
    if (!name) { setVolError('请输入卷名'); return; }
    const volumeTitle = `第${volumes.length + 1}卷·${name}`;
    onConfirm('create_volume', { volumeTitle });
    setNewVolName('');
    setVolError('');
    setNewVolDialogOpen(false);
  }, [newVolName, volumes, onConfirm]);

  const handleSave = useCallback(() => {
    if (selectedChap) {
      onConfirm('overwrite_chapter', { volumeId: selectedVolId!, chapterId: selectedChap.id });
      return;
    }
    if (selectedVol) {
      const name = newChapName.trim();
      if (!name) { toast.error('请输入章节名'); return; }
      const title = `第${selectedVol.chapters.length + 1}章·${name}`;
      onConfirm('create_chapter', { volumeId: selectedVol.id, chapterTitle: title });
      setNewChapName('');
      return;
    }
    toast.error('请先选择一卷');
  }, [selectedVol, selectedChap, selectedVolId, newChapName, onConfirm]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[80vh] flex flex-col glass-dialog">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>正文写入</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6">
          <div className="flex gap-4 py-4">
            <div className="w-64 shrink-0 space-y-2">
              <Label className="px-1">选择卷 / 章</Label>
              <ScrollArea className="h-[320px] rounded-lg border border-border/40 bg-muted/20">
                <div className="p-2 space-y-1">
                  {volumes.length === 0 && (
                    <p className="text-xs text-muted-foreground p-2">暂无大纲，请先新建一卷。</p>
                  )}
                  {volumes.map((vol) => {
                    const isExpanded = expandedVols.has(vol.id);
                    const isVolSelected = selectedVolId === vol.id;
                    return (
                      <div key={vol.id}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggleVolume(vol.id)}
                            className={cn(
                              'p-1 rounded hover:bg-accent/40 transition-colors',
                              isVolSelected ? 'text-primary' : 'text-muted-foreground'
                            )}
                          >
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </button>
                          <button
                            onClick={() => { setSelectedVolId(vol.id); setSelectedChapId(null); }}
                            className={cn(
                              'flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left',
                              isVolSelected ? 'bg-primary/10 text-primary' : 'hover:bg-accent/40'
                            )}
                          >
                            <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                            <span className="flex-1 truncate">{vol.title}</span>
                            <span className="text-[10px] text-muted-foreground">{vol.chapters.length}章</span>
                          </button>
                        </div>
                        {isExpanded && vol.chapters.map((chap) => {
                          const isChapSelected = selectedChapId === chap.id;
                          return (
                            <button
                              key={chap.id}
                              onClick={() => setSelectedChapId(chap.id)}
                              className={cn(
                                'w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs transition-colors ml-5',
                                isChapSelected ? 'bg-primary/10 text-primary' : 'hover:bg-accent/40'
                              )}
                            >
                            <FileText className="w-3 h-3 shrink-0" />
                            <span className="flex-1 text-left truncate">{chap.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            <div className="flex-1 space-y-4 min-w-0">
              <div className="space-y-2">
                <Label>操作</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Button size="sm" variant="outline" onClick={handleCreateVolume}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> 新建卷
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newChapName}
                      onChange={handleChapterNameChange}
                      placeholder="新章节名（如：星海初现）"
                      className="text-xs h-8"
                      onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                      disabled={!selectedVolId}
                    />
                    <Button size="sm" variant="default" onClick={handleSave} disabled={!selectedVolId}>
                      <Save className="w-3.5 h-3.5 mr-1" /> 保存
                    </Button>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  选中章节直接覆盖；选中卷且填写章节名则新建章节；未选择则提示。
                </p>
              </div>

              <div className="space-y-2">
                <Label>正文预览</Label>
                <textarea
                  value={mainText}
                  readOnly
                  className="h-[220px] w-full rounded-lg border border-border/40 bg-muted/20 p-2 text-xs whitespace-pre-wrap"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>取消</Button>
        </DialogFooter>

        <Dialog open={newVolDialogOpen} onOpenChange={setNewVolDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>新建卷</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>卷名</Label>
                <Input
                  value={newVolName}
                  onChange={(e) => { handleVolumeNameChange(e); setVolError(''); }}
                  placeholder="如：星海篇"
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirmCreateVolume()}
                />
                {volError && <p className="text-[10px] text-destructive">{volError}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewVolDialogOpen(false)}>取消</Button>
              <Button onClick={handleConfirmCreateVolume}>确定</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
