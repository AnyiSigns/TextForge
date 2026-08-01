'use client';

interface BadgeStateProps {
  taskCount: number;
}

export function BadgeState({ taskCount }: BadgeStateProps) {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
      <span className="ml-1.5 text-xs">{taskCount} 任务进行中</span>
    </span>
  );
}