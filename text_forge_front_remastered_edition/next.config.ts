/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    proxyTimeout: 300_000,
  },
  rewrites: async () => {
    // 本地开发默认代理到本机后端 (http://localhost:8000)。
    // 若本机未起后端，可设置环境变量指向远程：BACKEND_URL=https://47.93.196.245
    const backend = process.env.BACKEND_URL || 'http://localhost:8000';
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/static/:path*', destination: `${backend}/static/:path*` },
      { source: '/ort-wasm/:path*', destination: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.0/:path*' },
    ];
  },
};
export default nextConfig;
