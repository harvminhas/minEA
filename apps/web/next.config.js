/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@minea/types"],
  experimental: {
    serverComponentsExternalPackages: [],
  },
};

module.exports = nextConfig;
