// src/components/shared/VirtualList.tsx
'use client';

import { List } from 'react-window';
import { cn } from '@/lib/utils';

interface VirtualListProps {
  itemCount: number;
  itemHeight: number;
  itemContent: (index: number, style: React.CSSProperties) => React.ReactNode;
  className?: string;
  height?: number | string;
  overscanCount?: number;
}

export function VirtualList({
  itemCount,
  itemHeight = 64,
  itemContent,
  className,
  height = 400,
  overscanCount = 3,
}: VirtualListProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Row = ({ index, style }: any) => (
    <div style={style}>{itemContent(index, style)}</div>
  );

  return (
    <List
      rowCount={itemCount}
      rowHeight={itemHeight}
      defaultHeight={typeof height === 'number' ? height : 400}
      className={cn('scrollbar-thin', className)}
      rowComponent={Row}
      rowProps={{}}
      overscanCount={overscanCount}
    />
  );
}