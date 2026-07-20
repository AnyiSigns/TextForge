// src/lib/utils/url.ts
// 媒体 URL 来源白名单校验：result_url 来自后端/乐观记录，若后端被接管可返回
// 任意外部域图片。这里对图片/视频 src 做来源校验，拒绝 data: 以外的非白名单域，
// 杜绝加载未知外部域资源（XSS/钓鱼/外链泄露）。

// 允许的来源：与 next.config.ts 的 images.remotePatterns 保持一致。
const ALLOWED_MEDIA_HOSTS = [
  'placehold.co',
  'picsum.photos',
  'test-videos.co.uk',
  'amazonaws.com',
  'cloudfront.net',
  'googleusercontent.com',
];

function hostMatches(host: string): boolean {
  const h = host.toLowerCase();
  return ALLOWED_MEDIA_HOSTS.some((a) => h === a || h.endsWith('.' + a));
}

/** 判断一个媒体 URL 是否可安全作为 <img>/<video> src（同源 data URI 与白名单 HTTPS 允许）。 */
export function isSafeMediaUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  // 内联 data URI（如头像 SVG）允许。
  if (url.startsWith('data:')) return true;
  try {
    const u = new URL(url, 'https://placeholder.invalid');
    if (u.protocol !== 'https:') return false;
    return hostMatches(u.hostname);
  } catch {
    return false;
  }
}
