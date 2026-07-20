// src/components/projects/CharacterDetailSheet.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { CircleDot, Eye, Pencil, Link2, Images, Lock, Unlock } from 'lucide-react';
import Image from 'next/image';
import { Character, CharacterRole } from '@/types';

interface CharacterDetailSheetProps {
  detailChar: Character | null;
  detailRole: string;
  detailCustomRole: string;
  charNameById: (id: string) => string;
  rolePresets: { value: CharacterRole; label: string }[];
  roleLabel: (char: Character | { role?: string; customRole?: string }) => string | null;
  statusBadge: (status?: string) => React.ReactNode;
  onOpenStatus: (c: Character) => void;
  onOpenDetailRoleEdit: (c: Character) => void;
  onDetailRole: (v: string) => void;
  onDetailCustomRole: (v: string) => void;
  onSaveDetailRole: () => void;
  onSaveCurrentProfile: () => void;
  onOpenRelations: (c: Character) => void;
  onSetDetailChar: (c: Character | null) => void;
  toggleReferenceImage: (img: string) => void;
  exportImages: () => void;
}

export function CharacterDetailSheet(props: CharacterDetailSheetProps) {
  const {
    detailChar, detailRole, detailCustomRole, charNameById, rolePresets, roleLabel, statusBadge,
    onOpenStatus, onOpenDetailRoleEdit, onDetailRole, onDetailCustomRole, onSaveDetailRole,
    onSaveCurrentProfile, onOpenRelations, onSetDetailChar, toggleReferenceImage, exportImages,
  } = props;

  return (
    <Sheet open={!!detailChar} onOpenChange={(o) => !o && onSetDetailChar(null)}>
      <SheetContent side="right" className="glass-sheet w-full sm:max-w-[22rem] overflow-y-auto rounded-l-3xl">
        {detailChar && (
          <>
            <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/30">
              <SheetTitle className="flex items-center gap-3 text-xl">
                <Avatar className="w-11 h-11 ring-1 ring-border/40">
                  <AvatarImage src={detailChar.avatar} />
                  <AvatarFallback className="text-base">{detailChar.name.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <span className="tracking-tight">{detailChar.name}</span>
              </SheetTitle>
              <SheetDescription className="text-[13px]">角色设定、当前状态与图库</SheetDescription>
            </SheetHeader>

            <div className="mt-5 px-5 space-y-5">
              <div className="flex items-center gap-2 flex-wrap">
                {roleLabel(detailChar) && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium tracking-wide">{roleLabel(detailChar)}</span>
                )}
                {statusBadge(detailChar.status)}
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => onOpenStatus(detailChar)}>
                  <CircleDot className="w-3.5 h-3.5 mr-1" /> 设置状态
                </Button>
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => onOpenDetailRoleEdit(detailChar)}>
                  <Pencil className="w-3.5 h-3.5 mr-1" /> 编辑定位
                </Button>
              </div>

              {(detailRole !== '' || detailChar.role) && (
                <div className="space-y-1.5 rounded-xl border border-border/40 p-3">
                  <label className="text-xs text-muted-foreground">故事定位</label>
                  <select
                    value={detailRole}
                    onChange={(e) => onDetailRole(e.target.value)}
                    className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
                  >
                    <option value="">未设定</option>
                    {rolePresets.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  {detailRole === 'custom' && (
                    <Input
                      value={detailCustomRole}
                      onChange={(e) => onDetailCustomRole(e.target.value)}
                      placeholder="自定义定位，如：亦正亦邪的军师"
                      className="mt-1.5 h-9 rounded-xl text-sm"
                    />
                  )}
                  <Button size="sm" className="rounded-xl w-full" onClick={onSaveDetailRole}>保存定位</Button>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">角色设定 / 介绍</p>
                <div className="glass-sheet-card p-5">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{detailChar.description || '暂无设定'}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">当前时间点详情（随剧情演化）</p>
                <Textarea
                  value={detailChar.currentProfile ?? ''}
                  onChange={(e) => onSetDetailChar({ ...detailChar, currentProfile: e.target.value })}
                  placeholder="记录角色当前心理、关系、处境、关键变化…这部分会随章节生成注入上下文。"
                  rows={4}
                  className="text-sm rounded-2xl bg-background/40 border-border/30 focus-visible:border-primary/40"
                />
                <Button size="sm" variant="outline" className="rounded-xl" onClick={onSaveCurrentProfile}>保存当前档案</Button>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em] flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5" /> 角色关系（{detailChar.relationships?.length ?? 0}）
                </p>
                {detailChar.relationships && detailChar.relationships.length > 0 ? (
                  <div className="space-y-1.5">
                    {detailChar.relationships.map((r) => (
                      <div key={r.id} className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{charNameById(r.targetId)}</span>
                        <span className="text-muted-foreground/60">·</span>
                        <span className="text-muted-foreground truncate">{r.relation}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">暂无设定关系。</p>
                )}
                <Button size="sm" variant="outline" className="rounded-xl" onClick={() => onOpenRelations(detailChar)}>
                  <Link2 className="w-3.5 h-3.5 mr-1" /> 编辑关系
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em] flex items-center gap-1.5">
                  <Images className="w-3.5 h-3.5" /> 角色图库（{detailChar.images?.length ?? 0}）
                </p>
                {detailChar.images && detailChar.images.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {detailChar.images?.map((img, i) => {
                      const refList = (detailChar.referenceImages ?? []).filter(Boolean);
                      const isRef = refList.includes(img);
                      const refIndex = refList.indexOf(img);
                      return (
                        <div key={i} className="relative aspect-square rounded-2xl overflow-hidden border border-border/30 ring-1 ring-inset ring-white/5 group">
                          <Image src={img} alt={`${detailChar.name} 图${i + 1}`} fill className="object-cover" />
                          {isRef && (
                            <span className="absolute top-0.5 left-0.5 text-[9px] px-1 rounded-full bg-primary text-primary-foreground">参考 {refIndex + 1}</span>
                          )}
                          <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              title={isRef ? '取消参考图' : '设为参考图'}
                              onClick={() => toggleReferenceImage(img)}
                              className="w-6 h-6 grid place-items-center rounded-full bg-black text-white"
                            >
                              {isRef ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">该角色暂无可图片。可在「AI 绘画」选择本项目与角色生成，完成后会自动加入此处。</p>
                )}
                {detailChar.images && detailChar.images.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl mt-2"
                    onClick={exportImages}
                  >
                    <Eye className="w-3.5 h-3.5 mr-1.5" /> 导出全部立绘（{detailChar.images.length}）
                  </Button>
                )}
                {detailChar.referenceImages && detailChar.referenceImages.length > 0 ? (
                  <p className="text-[11px] text-primary flex items-center gap-1 mt-1.5">
                    <Lock className="w-3 h-3" /> 已锁定 {detailChar.referenceImages.length} 张参考图，生成立绘会尽量保持一致；可再次点击取消。
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground mt-1.5">未设参考图：生图每次外观可能不同。点图中黑底白锁可设为参考图（最多 5 张）。</p>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
