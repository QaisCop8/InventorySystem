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
    // middleware.ts (بوابة الجلسة) يجعل Next ينسخ جسم كل طلب API، والنسخة مقطوعة عند 10MB افتراضياً — فحفظ صنف
    // بصورة من كاميرا الجوال وسندات بمرفقات كان يصل للمسار مقطوعاً («Unexpected end of JSON input»).
    middlewareClientMaxBodySize: '100mb',
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

  // ترويسات أمان لكل الصفحات والمسارات: منع تضمين الموقع في إطار من نطاق آخر (clickjacking)، منع تخمين نوع الملف،
  // HTTPS فقط، وعدم تسريب الرابط الكامل لمواقع أخرى. الكاميرا/الميكروفون/الموقع للموقع نفسه فقط.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self)' },
        ],
      },
    ];
  },
};

export default nextConfig;
