/** @type {import('next').NextConfig} */
const nextConfig = {
  // 类型错误必须阻塞构建（不要设置 ignoreBuildErrors）
  images: {
    unoptimized: true,
  },
}

export default nextConfig
