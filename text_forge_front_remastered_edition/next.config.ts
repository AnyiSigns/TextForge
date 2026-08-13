/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    proxyTimeout: 300_000,
  },
  rewrites: async () => {
    const backend = process.env.BACKEND_URL || 'http://localhost:8000';
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/static/:path*', destination: `${backend}/static/:path*` },
      { source: '/ort-wasm/:path*', destination: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.0/:path*' },
    ];
  },
};
export default nextConfig;
