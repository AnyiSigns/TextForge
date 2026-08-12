'use client';

import { Trash2, Upload, SunMoon, Image as ImageIcon, Droplets } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Card } from '@/shared/ui/card';
import { cn } from '@/shared/lib/cn';
import { Slider } from '@/shared/ui/Slider';
import { Switch } from '@/shared/ui/Switch';
import { Button } from '@/shared/ui/Button';
import { useAppearanceSettings } from '@/features/settings/hooks/useAppearanceSettings';

export function AppearanceTab({ mounted }: { mounted: boolean }) {
  const { theme, setTheme } = useTheme();
  const {
    bgImage,
    bgOpacity,
    bgBlur,
    glassEnabled,
    glassOpacity,
    glassBlur,
    fileInputRef,
    handleBgUpload,
    handleBgRemove,
    handleBgOpacityChange,
    handleBgBlurChange,
    handleGlassToggle,
    handleGlassOpacityChange,
    handleGlassBlurChange,
    handleResetAll,
  } = useAppearanceSettings();

  return (
    <div className="space-y-5">
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <SunMoon size={14} strokeWidth={1.8} className="text-muted-foreground" />
          <div>
            <div className="text-xs font-medium">主题模式</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">切换应用的浅色 / 深色外观</div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex gap-2">
            {mounted ? (
              ['light', 'dark', 'system'].map((t) => (
                <button key={t} onClick={() => setTheme(t)}
                  className={cn(
                    'h-8 px-3 rounded-md text-xs border cursor-pointer bg-transparent transition-colors',
                    theme === t ? 'border-foreground bg-foreground/5 font-medium' : 'border-border hover:border-foreground/20',
                  )}>
                  {t === 'light' ? '浅色' : t === 'dark' ? '深色' : '跟随系统'}
                </button>
              ))
            ) : (
              ['light', 'dark', 'system'].map((t) => (
                <button key={t} disabled
                  className="h-8 px-3 rounded-md text-xs border border-border cursor-pointer bg-transparent transition-colors opacity-50">
                  {t === 'light' ? '浅色' : t === 'dark' ? '深色' : '跟随系统'}
                </button>
              ))
            )}
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ImageIcon size={14} strokeWidth={1.8} className="text-muted-foreground" />
          <div>
            <div className="text-xs font-medium">自定义主题背景</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">上传一张图片铺在应用底层，可调整透明度和模糊度</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="w-20 h-14 rounded-lg border border-border overflow-hidden bg-muted flex-shrink-0"
            style={bgImage ? {
              backgroundImage: `url(${bgImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            } : undefined}
          >
            {!bgImage && <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground/50">无背景</div>}
          </div>
          <div className="flex flex-col gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleBgUpload}
              className="hidden"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5"
            >
              <Upload size={11} />
              上传图片
            </Button>
            {bgImage && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleBgRemove}
                className="flex items-center gap-1.5 text-destructive"
              >
                <Trash2 size={11} />
                移除背景
              </Button>
            )}
          </div>
        </div>

        {bgImage && (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-muted-foreground">背景透明度</label>
                <span className="text-[10px] text-muted-foreground tabular-nums">{Math.round(bgOpacity * 100)}%</span>
              </div>
              <Slider min={0} max={1} step={0.05} value={bgOpacity} onChange={(e) => handleBgOpacityChange(parseFloat(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-muted-foreground">背景模糊度</label>
                <span className="text-[10px] text-muted-foreground tabular-nums">{bgBlur}px</span>
              </div>
              <Slider min={0} max={30} step={1} value={bgBlur} onChange={(e) => handleBgBlurChange(parseInt(e.target.value))} />
            </div>
          </>
        )}
        <p className="text-[10px] text-muted-foreground/60">支持 JPG/PNG/WebP，单文件不超过 10MB，超过自动压缩到 1920px 宽</p>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Droplets size={14} strokeWidth={1.8} className="text-muted-foreground" />
          <div>
            <div className="text-xs font-medium">液态玻璃</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">为全局卡片和面板添加淡淡的毛玻璃效果（仅模糊 + 半透明，无高光反光）</div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-[11px] text-muted-foreground">开启液态玻璃</label>
          <Switch checked={glassEnabled} onChange={handleGlassToggle} aria-label="开启液态玻璃" />
        </div>

        {glassEnabled && (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-muted-foreground">卡片透明度</label>
                <span className="text-[10px] text-muted-foreground tabular-nums">{Math.round(glassOpacity * 100)}%</span>
              </div>
              <Slider min={0.1} max={1} step={0.05} value={glassOpacity} onChange={(e) => handleGlassOpacityChange(parseFloat(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-muted-foreground">玻璃模糊度</label>
                <span className="text-[10px] text-muted-foreground tabular-nums">{glassBlur}px</span>
              </div>
              <Slider min={0} max={30} step={1} value={glassBlur} onChange={(e) => handleGlassBlurChange(parseInt(e.target.value))} />
            </div>
          </>
        )}
      </Card>

      <div className="flex justify-end">
        <Button variant="secondary" onClick={handleResetAll} className="text-muted-foreground">
          还原默认
        </Button>
      </div>
    </div>
  );
}
