import { Check } from 'lucide-react';

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
      <aside className="hidden lg:flex w-[44%] flex-col justify-between p-10 bg-foreground text-background">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center text-background">
            <BrandMark size={18} />
          </span>
          <span className="text-lg font-semibold">TextForge</span>
        </div>

        <div className="space-y-5">
          <h2 className="text-2xl font-semibold leading-snug">
            让 AI 陪你完成
            <br />
            每一部作品
          </h2>
          <ul className="space-y-2.5 text-sm opacity-80">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2">
                <Check size={15} className="shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs opacity-60">© {new Date().getFullYear()} TextForge</p>
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
