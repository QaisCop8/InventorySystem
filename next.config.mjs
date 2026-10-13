// Set by open-next.config.ts (buildCommand) for the Cloudflare Workers build only.
const cloudflareBuild = process.env.CLOUDFLARE_BUILD === 'true';

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
    // On Workers odbc is aliased to a stub below, so it must not be external (that would copy the
    // native driver and node-pre-gyp into the Worker bundle, which cannot be bundled).
    ...(cloudflareBuild ? [] : ['odbc', '@mapbox/node-pre-gyp']),
    'encoding',
    'iconv-lite',
  ],

  ...(cloudflareBuild
    ? {
        turbopack: {
          resolveAlias: {
            odbc: './lib/stubs/odbc.cjs',
          },
        },
      }
    : {}),

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
    '/*': [
      './scripts/company-bootstrap.sql',
      // Workers: pg loads pg-cloudflare (its "workerd" export, dist/index.js) for sockets. Next traces with
      // Node conditions so that file is never copied and the Worker bundle cannot resolve it. Both the
      // pnpm layout (sibling of pg inside .pnpm) and the flat npm layout are listed.
      ...(cloudflareBuild
        ? [
            './node_modules/.pnpm/pg@*/node_modules/pg-cloudflare/**/*',
            './node_modules/pg-cloudflare/**/*',
          ]
        : []),
    ],
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
