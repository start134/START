/** @type {import('next').NextConfig} */
const nextConfig = {
  // 类型错误必须阻塞构建（不要设置 ignoreBuildErrors）
  // better-sqlite3 是原生模块，禁止被打包进 server bundle
  serverExternalPackages: ['better-sqlite3'],
  images: {
    unoptimized: true,
  },
}

export default nextConfig
