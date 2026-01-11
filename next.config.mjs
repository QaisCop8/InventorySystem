/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",

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