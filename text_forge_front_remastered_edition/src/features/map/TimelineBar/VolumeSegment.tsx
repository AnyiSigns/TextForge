'use client';

interface VolumeSegmentProps {
  label: string;
  xStart: number;
  xEnd: number;
}

export function VolumeSegment({ label, xStart, xEnd }: VolumeSegmentProps) {
  return (
    <div
      className="absolute top-0.5 h-5 flex items-center px-2 border-l border-border/30"
      style={{
        left: xStart,
        width: Math.max(xEnd - xStart, 60),
      }}
    >
      <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wider">
        {label}
      </span>
      {/* 卷区间下划线 */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground/15" />
    </div>
  );
}
