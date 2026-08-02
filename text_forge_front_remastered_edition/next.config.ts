/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  rewrites: async () => [
    { source: '/api/:path*', destination: 'http://localhost:8000/api/:path*' },
    { source: '/static/:path*', destination: 'http://localhost:8000/static/:path*' },
    { source: '/ort-wasm/:path*', destination: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.0/:path*' },
  ],
};
export default nextConfig;
