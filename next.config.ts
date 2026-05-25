import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.pexels.com",
      },
      {
        protocol: "https",
        hostname: "**.pexels.com",
      },
    ],
  },
  serverExternalPackages: ["@remotion/bundler", "@remotion/renderer", "esbuild"],
  webpack: (config, { isServer }) => {
    config.resolve = {
      ...config.resolve,
      fallback: {
        ...config.resolve?.fallback,
        "@remotion/compositor": false,
        "@remotion/compositor-darwin-x64": false,
        "@remotion/compositor-darwin-arm64": false,
        "@remotion/compositor-linux-x64": false,
        "@remotion/compositor-linux-arm64": false,
        "@remotion/compositor-linux-x64-musl": false,
        "@remotion/compositor-linux-arm64-musl": false,
        "@remotion/compositor-linux-x64-gnu": false,
        "@remotion/compositor-linux-arm64-gnu": false,
        "@remotion/compositor-win32-x64": false,
        "@remotion/compositor-windows-x64": false,
        esbuild: false,
      },
    };

    if (isServer) {
      config.externals = [...config.externals, "esbuild"];
    }

    return config;
  },
};

export default nextConfig;
