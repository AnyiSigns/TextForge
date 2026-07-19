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
    // 仅生产环境把 /api/* 代理到后端。开发期留空，使 /api/* 由 proxy.ts 的 dev mock 处理。
    if (process.env.NODE_ENV === 'production') {
      return [
        {
          source: '/api/:path*',
          destination: 'http://localhost:8000/api/:path*',
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
