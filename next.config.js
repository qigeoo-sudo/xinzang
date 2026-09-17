/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    remotePatterns: [],
  },
  // Next 14.2：外部包与文件追踪配置位于 experimental 下（Next 15 才提升为顶层键）
  experimental: {
    // Prisma + bcryptjs 需要外部化处理，不能被 Next.js 打包
    serverComponentsExternalPackages: [
      '@prisma/client',
      '@auth/prisma-adapter',
      'bcryptjs',
      'undici',
    ],
    // 确保 Prisma 引擎二进制文件、导师治理资产（content/ 下 md/jsonl）被包含在 standalone 构建中
    outputFileTracingIncludes: {
      '/': [
        './node_modules/.prisma/**/*',
        './node_modules/@prisma/**/*',
        './src/generated/prisma/**/*',
        './content/**/*',
      ],
    },
  },
  // 安全响应头配置 — 修复安全审计报告 A05
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value:
              process.env.NODE_ENV === 'production'
                // TODO: 上线前改用 nonce 机制移除 'unsafe-inline'（script-src）
                ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; connect-src 'self' https://api.deepseek.com https://api.openai.com; font-src 'self' data: https://fonts.gstatic.com;"
                : "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; connect-src 'self' https://api.deepseek.com https://api.openai.com ws:; font-src 'self' data: https://fonts.gstatic.com;",
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
