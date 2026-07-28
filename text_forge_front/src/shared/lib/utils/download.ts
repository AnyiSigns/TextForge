// src/lib/utils/download.ts
// 统一的浏览器文件下载工具，消除多处 Blob + objectURL 内联变体。

/** 触发一次浏览器下载（自动创建临时 a 并清理 objectURL） */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 把文本按指定 mime 下载为文件 */
export function downloadText(content: string, filename: string, mime: string): void {
  downloadBlob(new Blob([content], { type: mime }), filename);
}
