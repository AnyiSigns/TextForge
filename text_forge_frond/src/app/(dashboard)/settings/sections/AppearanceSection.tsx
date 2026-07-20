// src/app/(dashboard)/settings/sections/AppearanceSection.tsx
'use client';

import { useShallow } from 'zustand/react/shallow';
import { useTheme } from 'next-themes';
import { useSettingsStore, type BgArea } from '@/lib/stores/settingsStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sun, Moon, Monitor, Image as ImageIcon } from 'lucide-react';

const BG_AREA_OPTIONS: { value: BgArea; label: string }[] = [
  { value: 'global', label: '全部页面' },
  { value: 'dashboard', label: '仅仪表盘' },
  { value: 'projects', label: '项目管理' },
  { value: 'characters', label: '角色模拟' },
  { value: 'knowledge', label: '知识库' },
  { value: 'tasks', label: 'AI视频' },
  { value: 'assets', label: 'AI绘画' },
  { value: 'api-keys', label: '开放平台' },
  { value: 'settings', label: '设置页' },
];

const FONT_FAMILY_OPTIONS: { value: string; label: string }[] = [
  { value: 'system', label: '系统默认' },
  { value: 'sans', label: '无衬线（黑体）' },
  { value: 'serif', label: '衬线（宋体）' },
  { value: 'kai', label: '楷体' },
  { value: 'yuan', label: '圆体' },
  { value: 'fangsong', label: '仿宋' },
];

interface AppearanceSectionProps {
  isBgLoading: boolean;
  onBgUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  bgFileInputRef: React.RefObject<HTMLInputElement | null>;
}

export function AppearanceSection({ isBgLoading, onBgUpload, bgFileInputRef }: AppearanceSectionProps) {
  const { theme, setTheme } = useTheme();
  const {
    bgImage, bgOpacity, bgBlur, bgArea, bgSolidOpacity,
    inkEnabled, inkOpacity, motionEnabled, glassEnabled,
    cardGlassOpacity, cardGlassBlur, fontFamily, contentScale,
    setBgImage, setBgOpacity, setBgBlur, setBgArea, setBgSolidOpacity,
    setInkEnabled, setInkOpacity, setMotionEnabled, setGlassEnabled,
    setCardGlassOpacity, setCardGlassBlur, setSidebarGlassOpacity, setSidebarGlassBlur,
    setFontFamily, setContentScale,
  } = useSettingsStore(useShallow((s) => ({
    bgImage: s.bgImage, bgOpacity: s.bgOpacity, bgBlur: s.bgBlur, bgArea: s.bgArea, bgSolidOpacity: s.bgSolidOpacity,
    inkEnabled: s.inkEnabled, inkOpacity: s.inkOpacity, motionEnabled: s.motionEnabled, glassEnabled: s.glassEnabled,
    cardGlassOpacity: s.cardGlassOpacity, cardGlassBlur: s.cardGlassBlur, fontFamily: s.fontFamily, contentScale: s.contentScale,
    setBgImage: s.setBgImage, setBgOpacity: s.setBgOpacity, setBgBlur: s.setBgBlur, setBgArea: s.setBgArea, setBgSolidOpacity: s.setBgSolidOpacity,
    setInkEnabled: s.setInkEnabled, setInkOpacity: s.setInkOpacity, setMotionEnabled: s.setMotionEnabled, setGlassEnabled: s.setGlassEnabled,
    setCardGlassOpacity: s.setCardGlassOpacity, setCardGlassBlur: s.setCardGlassBlur, setSidebarGlassOpacity: s.setSidebarGlassOpacity, setSidebarGlassBlur: s.setSidebarGlassBlur,
    setFontFamily: s.setFontFamily, setContentScale: s.setContentScale,
  })));

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>主题与背景</CardTitle>
        <CardDescription>自定义界面风格，支持上传个人背景图片</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>主题模式</Label>
          <div className="flex gap-2">
            <Button variant={theme === 'light' ? 'default' : 'outline'} onClick={() => setTheme('light')}>
              <Sun className="w-4 h-4 mr-2" /> 亮色
            </Button>
            <Button variant={theme === 'dark' ? 'default' : 'outline'} onClick={() => setTheme('dark')}>
              <Moon className="w-4 h-4 mr-2" /> 暗色
            </Button>
            <Button variant={theme === 'system' ? 'default' : 'outline'} onClick={() => setTheme('system')}>
              <Monitor className="w-4 h-4 mr-2" /> 跟随系统
            </Button>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <Label>自定义背景</Label>
          <div className="flex items-center gap-4">
            <Button type="button" variant="outline" onClick={() => bgFileInputRef.current?.click()} disabled={isBgLoading}>
              <ImageIcon className="w-4 h-4 mr-2" /> 上传背景图
            </Button>
            {bgImage && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setBgImage(null)}>
                移除背景
              </Button>
            )}
            <input
              ref={bgFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onBgUpload}
            />
          </div>

          {bgImage && (
            <div className="grid grid-cols-2 gap-6 p-4 bg-muted/30 rounded-lg">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>透明度</span>
                  <span className="text-muted-foreground">{bgOpacity}%</span>
                </div>
                <input
                  type="range"
                  min="10" max="100" value={bgOpacity}
                  onChange={(e) => setBgOpacity(parseInt(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>模糊度</span>
                  <span className="text-muted-foreground">{bgBlur}px</span>
                </div>
                <input
                  type="range"
                  min="0" max="20" value={bgBlur}
                  onChange={(e) => setBgBlur(parseInt(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>背景显示范围</Label>
            <Select value={bgArea} onValueChange={(v) => setBgArea(v as BgArea)}>
              <SelectTrigger className="max-w-xs">
                <SelectValue placeholder="选择范围">
                  {(value: string) => BG_AREA_OPTIONS.find((o) => o.value === value)?.label ?? value}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {BG_AREA_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-6 p-4 bg-muted/30 rounded-lg">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>实色层透明度</span>
                <span className="text-muted-foreground">{bgSolidOpacity}%</span>
              </div>
              <input
                type="range"
                min="0" max="100" value={bgSolidOpacity}
                onChange={(e) => setBgSolidOpacity(parseInt(e.target.value))}
                className="w-full accent-primary"
              />
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border/40 p-3">
            <div className="space-y-0.5">
              <Label className="text-sm">水墨纹理</Label>
              <p className="text-xs text-muted-foreground">在背景上叠加水墨噪点与晕染质感</p>
            </div>
            <Switch checked={inkEnabled} onCheckedChange={setInkEnabled} />
          </div>
          {inkEnabled && (
            <div className="grid grid-cols-2 gap-6 p-4 bg-muted/30 rounded-lg">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>水墨强度</span>
                  <span className="text-muted-foreground">{inkOpacity}%</span>
                </div>
                <input
                  type="range"
                  min="0" max="100" value={inkOpacity}
                  onChange={(e) => setInkOpacity(parseInt(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between rounded-lg border border-border/40 p-3">
            <div className="space-y-0.5">
              <Label className="text-sm">动画效果</Label>
              <p className="text-xs text-muted-foreground">关闭后禁用页面过渡与微动效</p>
            </div>
            <Switch checked={motionEnabled} onCheckedChange={setMotionEnabled} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/40 p-3">
            <div className="space-y-0.5">
              <Label className="text-sm">液态玻璃</Label>
              <p className="text-xs text-muted-foreground">卡片与侧边栏启用毛玻璃质感</p>
            </div>
            <Switch checked={glassEnabled} onCheckedChange={setGlassEnabled} />
          </div>
        </div>

        {glassEnabled && (
          <div className="grid grid-cols-2 gap-6 p-4 bg-muted/30 rounded-lg">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>玻璃透明度</span>
                <span className="text-muted-foreground">{cardGlassOpacity}%</span>
              </div>
              <input
                type="range"
                min="0" max="100" value={cardGlassOpacity}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setCardGlassOpacity(v);
                  setSidebarGlassOpacity(v);
                }}
                className="w-full accent-primary"
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>玻璃模糊度</span>
                <span className="text-muted-foreground">{cardGlassBlur}px</span>
              </div>
              <input
                type="range"
                min="0" max="40" value={cardGlassBlur}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setCardGlassBlur(v);
                  setSidebarGlassBlur(v);
                }}
                className="w-full accent-primary"
              />
            </div>
          </div>
        )}

        <Separator />

        <div className="space-y-2">
          <Label>界面字体</Label>
          <Select value={fontFamily} onValueChange={(v) => setFontFamily(v ?? 'system')}>
            <SelectTrigger className="max-w-xs">
              <SelectValue placeholder="选择字体">
                {(value: string) => FONT_FAMILY_OPTIONS.find((o) => o.value === value)?.label ?? value}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {FONT_FAMILY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">切换界面整体字体（标题与正文同步生效）</p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <Label>页面展示大小</Label>
            <span className="text-muted-foreground text-sm">{contentScale}%</span>
          </div>
          <input
            type="range"
            min="80" max="120" value={contentScale}
            onChange={(e) => setContentScale(parseInt(e.target.value))}
            className="w-full accent-primary"
          />
          <p className="text-xs text-muted-foreground">调小更紧凑，调大更舒展（影响整体字号与间距）</p>
        </div>
      </CardContent>
    </Card>
  );
}
