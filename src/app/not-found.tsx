// src/app/[locale]/not-found.tsx
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
          <CardTitle>404 - 页面未找到</CardTitle>
          <CardDescription>
            抱歉，您访问的页面不存在或已被移除。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/">
            <Button>返回首页</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
