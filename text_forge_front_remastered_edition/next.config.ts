/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  rewrites: async () => [
    { source: '/api/:path*', destination: 'http://localhost:8000/api/:path*' },
    { source: '/static/:path*', destination: 'http://localhost:8000/static/:path*' },
  ],
};
export default nextConfig;
