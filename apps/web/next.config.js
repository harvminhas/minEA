/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@minea/types"],
  serverExternalPackages: [],
  async rewrites() {
    const apiOrigin = process.env.API_URL ?? "http://localhost:8000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;