import { Check, Sparkles } from 'lucide-react';

const FEATURES = [
  '世界观地图与角色关系梳理',
  '时间线与情节大纲推演',
  'AI 辅助章节写作与剧情模拟',
];

/** 品牌徽标：圆角四边形造型，与浏览器标签 favicon（public/favicon.svg）同源。 */
function BrandMark({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="26" height="26" rx="7" />
        <path d="M11 9 H19" />
        <path d="M15 9 V23" />
        <path d="M17 14 H22" />
        <path d="M17 19 H21" />
      </g>
    </svg>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      {/* 品牌栏：与背景同系的柔和面板（主题自适应，不黑白反转），右侧细分隔线 */}
      <aside className="hidden lg:flex w-[31%] flex-col justify-between p-10 relative overflow-hidden border-r border-border bg-[color-mix(in_srgb,var(--foreground)_7%,var(--background))] text-foreground">
        {/* 光晕层：右上暖光 / 左下冷光（前景色低透明度） */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_560px_400px_at_85%_-10%,color-mix(in_srgb,var(--foreground)_9%,transparent),transparent_60%),radial-gradient(ellipse_480px_380px_at_-10%_110%,color-mix(in_srgb,var(--foreground)_5%,transparent),transparent_60%)]" />
        {/* 星点层：两层不同密度错位叠加，避免规则点阵感 */}
        <div className="absolute inset-0 pointer-events-none opacity-70" style={{ backgroundImage: 'radial-gradient(color-mix(in srgb, var(--foreground) 26%, transparent) 1px, transparent 1.4px)', backgroundSize: '26px 26px' }} />
        <div className="absolute inset-0 pointer-events-none opacity-40" style={{ backgroundImage: 'radial-gradient(color-mix(in srgb, var(--foreground) 18%, transparent) 1px, transparent 1.4px)', backgroundSize: '58px 58px', backgroundPosition: '29px 29px' }} />
        {/* 水印徽标：右下角大号低透明度装饰 */}
        <div className="absolute -bottom-10 -right-10 pointer-events-none text-foreground/[0.04] rotate-12">
          <BrandMark size={260} />
        </div>

        <div className="relative flex items-center gap-2">
          <span className="flex items-center justify-center">
            <BrandMark size={18} />
          </span>
          <span className="text-lg font-semibold">TextForge</span>
        </div>

        <div className="relative space-y-5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/[0.05] px-3 py-1 text-xs opacity-80 backdrop-blur-sm">
            <Sparkles size={12} />
            AI 创作工作台
          </span>
          <h2 className="text-2xl font-semibold leading-snug">
            让 AI 陪你完成
            <br />
            每一部作品
          </h2>
          <ul className="space-y-2">
            {FEATURES.map((f) => (
              <li
                key={f}
                className="flex items-center gap-2.5 rounded-xl border border-foreground/[0.07] bg-foreground/[0.03] px-3.5 py-3 text-sm opacity-80"
              >
                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-foreground/[0.07] flex-shrink-0">
                  <Check size={14} />
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-foreground/40">© {new Date().getFullYear()} TextForge</p>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="lg:hidden flex items-center justify-center gap-2 mb-8 mt-2">
          <span className="flex items-center justify-center text-primary">
            <BrandMark size={16} />
          </span>
          <span className="text-base font-semibold">TextForge</span>
        </div>
        {/* min-h-full 包裹避免内容超高时垂直居中裁切顶部（flexbox 经典溢出问题） */}
        <div className="min-h-full flex items-center justify-center">{children}</div>
      </main>
    </div>
  );
}
