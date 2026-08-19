/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output is needed by the Docker image. On Windows it performs
  // pnpm-style symlink copies that require Developer Mode/admin privileges.
  ...(process.env.STANDALONE_BUILD === 'true' ? { output: 'standalone' } : {}),

  compiler: {
    // Keep errors and warnings, but remove render/debug logging from production
    // client bundles to reduce parsing and runtime work.
    removeConsole: { exclude: ['error', 'warn'] },
  },

  // Keep native/server-only packages out of both Webpack and Turbopack's
  // module graph. This avoids traversing node-pre-gyp and its optional tools.
  serverExternalPackages: [
    'odbc',
    '@mapbox/node-pre-gyp',
    'encoding',
    'iconv-lite',
  ],

  experimental: {
    // These libraries expose large barrel files. Rewriting named imports to
    // per-module imports reduces compiler work and client bundle parsing.
    optimizePackageImports: [
      'lucide-react',
      'react-icons',
      'recharts',
      'primereact',
    ],
  },

  // Provisioning reads this file at runtime. Keep it in standalone/serverless
  // build artifacts instead of relying on it being present in the source tree.
  outputFileTracingIncludes: {
    '/*': ['./scripts/company-bootstrap.sql'],
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
