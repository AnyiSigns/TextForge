import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    // 静态白名单：仅允许这些来源的图片经 next/image 加载。
    // 后端 result_url 若返回列表外域会被 next/image 直接拒绝（400），
    // 配合前端的 isSafeMediaUrl 校验，避免加载任意外部域图片。
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'test-videos.co.uk' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
      { protocol: 'https', hostname: '**.googleusercontent.com' },
    ],
  },
  async rewrites() {
    // 开发和生产统一由 Nginx 或此 rewrites 处理静态文件与 API 路由
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
      {
        source: '/static/:path*',
        destination: 'http://localhost:8000/static/:path*',
      },
    ];
  },
};

export default nextConfig;
