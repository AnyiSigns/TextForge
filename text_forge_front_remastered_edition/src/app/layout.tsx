import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { ThemeBgInit } from '@/lib/storage/ThemeBgInit';
import './globals.css';

export const metadata: Metadata = {
  title: { template: '%s · TextForge', default: 'TextForge' },
  description: 'AI 辅助写作工作台',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="h-screen overflow-hidden">
        <ThemeBgInit />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
            {children}
          </ThemeProvider>
        </div>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
