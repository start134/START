import Link from 'next/link'

export const metadata = {
  title: '关于 | START',
}

export default function AboutPage() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16 lg:px-8 lg:py-24">
      <p className="font-mono text-xs tracking-[0.2em] text-primary">关于</p>
      <h1 className="mt-3 text-3xl tracking-tight sm:text-4xl">关于 START</h1>
      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_2fr]">
        <p className="font-mono text-xs text-muted-foreground">独立创作者 · 设计 · 技术 · 生活</p>
        <div className="max-w-2xl space-y-7 text-base leading-8 text-foreground/90">
          <p>
            START 是一个安静的个人角落，记录关于创造、思考，以及日常生活片段的文字。
          </p>
          <p>我相信，好的作品不需要大声说话。它会在某个刚刚好的时刻，安静地被你发现。</p>
          <p>
            这里的内容围绕三件事：设计——如何让事物更清晰；技术——如何把复杂问题拆开来看；生活——如何在城市与日常里重新发现细节。
          </p>
          <p>
            如果你也想分享故事，欢迎在
            <Link href="/new" className="text-primary hover:underline">
              写文章
            </Link>
            页发布，或通过
            <Link href="/contact" className="text-primary hover:underline">
              联系
            </Link>
            写信给我。
          </p>
        </div>
      </div>
    </section>
  )
}
