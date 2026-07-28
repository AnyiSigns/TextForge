import * as React from "react";

import { cn } from "@/lib/utils";

// 原生滚动容器：统一走浏览器原生 overflow + globals.css 的细滚动条样式，
// 避免第三方 ScrollArea 在动态内容下不渲染滚动条的问题。
function ScrollArea({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="scroll-area"
      className={cn("relative overflow-y-auto overflow-x-hidden", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { ScrollArea };
