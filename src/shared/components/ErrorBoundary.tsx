// src/shared/components/ErrorBoundary.tsx
'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { captureException } from '@/lib/monitoring';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  context?: Record<string, unknown>;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureException(error, {
      source: 'ErrorBoundary',
      componentStack: info.componentStack,
      context: this.props.context,
    });
    this.props.onError?.(error, info);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div className="min-h-[200px] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-2" />
            <CardTitle>组件渲染出错</CardTitle>
            <CardDescription>该模块暂时无法显示，可尝试恢复。</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={this.reset}>恢复</Button>
          </CardContent>
        </Card>
      </div>
    );
  }
}
