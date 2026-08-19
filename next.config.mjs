import fs from 'fs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

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


  webpack: (config, { isServer }) => {

    if (isServer) {
      config.externals = config.externals || [];
      

      config.externals.push(
        'odbc',
        '@mapbox/node-pre-gyp', 

        'encoding', 
        'iconv-lite' 
      );
    }

    return config;
  },

};

export default nextConfig;
