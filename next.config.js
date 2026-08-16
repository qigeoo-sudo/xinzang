/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    remotePatterns: [],
  },
  // Prisma + bcryptjs 需要外部化处理，不能被 Next.js 打包
  serverComponentsExternalPackages: [
    '@prisma/client',
    '@auth/prisma-adapter',
    'bcryptjs',
  ],
  // 确保 Prisma 引擎二进制文件被包含在 standalone 构建中
  outputFileTracingIncludes: {
    '/': [
      './node_modules/.prisma/**/*',
      './node_modules/@prisma/**/*',
      './src/generated/prisma/**/*',
    ],
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
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.deepseek.com https://api.openai.com; font-src 'self' data:;",
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
