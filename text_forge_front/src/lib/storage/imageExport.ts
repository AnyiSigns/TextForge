// src/lib/storage/imageExport.ts
// 角色/视频素材导出：单张下载 + zip 批量打包
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

/** 从 URL 安全取得 Blob（带 CORS 兜底） */
async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (res.ok) return await res.blob();
  } catch {
    // 跨域受限，忽略，走回退路径
  }
  return null;
}

/** 单张下载（fetch blob 优先，失败则直接用浏览器 download 属性触发） */
export async function downloadSingleImage(url: string, filename: string): Promise<void> {
  const blob = await fetchBlob(url);
  if (blob) {
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
    return;
  }
  // 回退：依赖浏览器对跨域资源的 download 处理
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function safeName(raw: string, fallback: string, index: number): string {
  const cleaned = (raw || '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 40);
  const ext = /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i.test(raw) ? '' : '.png';
  return `${cleaned || fallback}_${String(index + 1).padStart(2, '0')}${ext}`;
}

/**
 * 把一组远程图片 URL 打包成 zip 下载。
 * @param urls 图片 URL 列表
 * @param zipName 生成文件名（不含 .zip）
 * @param baseName 单文件前缀
 */
export async function downloadImagesZip(
  urls: string[],
  zipName: string,
  baseName: string,
): Promise<{ ok: number; failed: number }> {
  const zip = new JSZip();
  const folder = zip.folder(zipName) ?? zip;
  let ok = 0;
  let failed = 0;

  await Promise.all(
    urls.map(async (url, i) => {
      const blob = await fetchBlob(url);
      if (blob) {
        folder.file(safeName(url, baseName, i), blob);
        ok += 1;
      } else {
        // 跨域无法读取二进制时，写入一个 .url 快捷方式，至少保留来源
        folder.file(`${safeName(url, baseName, i)}.url`, `[InternetShortcut]\r\nURL=${url}\r\n`);
        failed += 1;
      }
    }),
  );

  const content = await zip.generateAsync({ type: 'blob' });
  saveAs(content, `${zipName}.zip`);
  return { ok, failed };
}
