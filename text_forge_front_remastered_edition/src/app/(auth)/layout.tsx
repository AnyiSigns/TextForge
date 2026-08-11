import { Feather, Check } from 'lucide-react';

const FEATURES = [
  '世界观地图与角色关系梳理',
  '时间线与情节大纲推演',
  'AI 辅助章节写作与剧情模拟',
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      <aside className="hidden lg:flex w-[44%] flex-col justify-between p-10 bg-foreground text-background">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-background text-foreground">
            <Feather size={18} />
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
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Feather size={15} />
          </span>
          <span className="text-base font-semibold">TextForge</span>
        </div>
        {/* min-h-full 包裹避免内容超高时垂直居中裁切顶部（flexbox 经典溢出问题） */}
        <div className="min-h-full flex items-center justify-center">{children}</div>
      </main>
    </div>
  );
}
