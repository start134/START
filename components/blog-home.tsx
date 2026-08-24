'use client'

import { useState } from 'react'

const posts = [
  { date: '2026.08.18', category: '设计', title: '留白，是一种表达', excerpt: '界面不必填满每一寸空间。好的设计懂得给内容、情绪和思考留下呼吸的地方。', read: '6 分钟' },
  { date: '2026.08.10', category: '技术', title: '把复杂问题拆开来看', excerpt: '从一个真实项目出发，记录我如何梳理问题、建立边界，并做出更简单的技术选择。', read: '8 分钟' },
  { date: '2026.07.26', category: '生活', title: '周末在城市里散步', excerpt: '没有目的地的下午，沿着熟悉又陌生的街道，重新认识生活的细节。', read: '4 分钟' },
]

export function BlogHome() {
  const [query, setQuery] = useState('')
  const filtered = posts.filter((post) => `${post.title}${post.excerpt}${post.category}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-7 lg:px-8">
        <a href="#home" className="font-mono text-sm tracking-[0.18em] text-foreground">LIN<span className="text-primary">.</span>NOTES</a>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground sm:flex" aria-label="主导航">
          <a href="#articles" className="transition-colors hover:text-primary">文章</a>
          <a href="#about" className="transition-colors hover:text-primary">关于</a>
          <a href="#contact" className="transition-colors hover:text-primary">联系</a>
        </nav>
        <a href="mailto:hello@lin-notes.com" className="border border-border px-3 py-2 text-xs transition-colors hover:border-primary hover:text-primary">订阅</a>
      </header>

      <section id="home" className="mx-auto max-w-5xl px-6 pb-24 pt-24 lg:px-8 lg:pb-32 lg:pt-36">
        <p className="mb-6 font-mono text-xs tracking-[0.24em] text-primary">独立创作者 · 设计 · 技术 · 生活</p>
        <h1 className="max-w-3xl text-balance text-5xl font-medium leading-[1.08] tracking-[-0.06em] sm:text-7xl">记录正在发生的<br /><span className="text-primary">细小而重要的事。</span></h1>
        <p className="mt-8 max-w-lg text-pretty text-base leading-7 text-muted-foreground">你好，我是 Lin。这里是我的个人角落，写下关于创造、思考，以及日常生活的片段。</p>
        <a href="#articles" className="mt-10 inline-flex items-center gap-3 text-sm text-foreground transition-colors hover:text-primary">开始阅读 <span aria-hidden="true">→</span></a>
      </section>

      <section id="articles" className="border-y border-border">
        <div className="mx-auto max-w-5xl px-6 py-16 lg:px-8">
          <div className="mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div><p className="font-mono text-xs tracking-[0.2em] text-primary">LATEST WRITINGS</p><h2 className="mt-3 text-2xl tracking-tight">最近的文章</h2></div>
            <label className="flex w-full items-center gap-2 border-b border-border pb-2 text-sm text-muted-foreground sm:w-48 focus-within:border-primary"><span aria-hidden="true">⌕</span><span className="sr-only">搜索文章</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文章" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/60" /></label>
          </div>
          <div className="divide-y divide-border">
            {filtered.length > 0 ? filtered.map((post) => <article key={post.title} className="grid gap-4 py-8 md:grid-cols-[110px_1fr_90px] md:gap-8"><time className="font-mono text-xs text-muted-foreground">{post.date}</time><div><div className="mb-3 flex items-center gap-3 text-xs text-primary"><span>{post.category}</span><span className="text-muted-foreground">/</span><span className="text-muted-foreground">{post.read}阅读</span></div><h3 className="text-xl tracking-tight transition-colors hover:text-primary">{post.title}</h3><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{post.excerpt}</p></div><a href="#contact" className="text-left text-xs text-muted-foreground transition-colors hover:text-primary md:text-right">阅读 →</a></article>) : <p className="py-10 text-sm text-muted-foreground">没有找到相关文章。</p>}
          </div>
        </div>
      </section>

      <section id="about" className="mx-auto grid max-w-5xl gap-8 px-6 py-24 lg:grid-cols-[1fr_2fr] lg:px-8"><p className="font-mono text-xs tracking-[0.2em] text-primary">ABOUT ME</p><div><p className="max-w-2xl text-2xl leading-relaxed tracking-tight">我相信，好的作品不需要大声说话。它会在某个刚刚好的时刻，安静地被你发现。</p><p className="mt-7 max-w-xl text-sm leading-7 text-muted-foreground">目前居住在上海，专注于数字产品设计与前端开发。工作之余喜欢摄影、阅读，以及探索城市里不太起眼的角落。</p></div></section>

      <footer id="contact" className="border-t border-border"><div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-14 lg:flex-row lg:items-end lg:justify-between lg:px-8"><div><p className="font-mono text-xs tracking-[0.2em] text-primary">GET IN TOUCH</p><h2 className="mt-3 text-2xl tracking-tight">有想聊的，欢迎写信给我。</h2><a href="mailto:hello@lin-notes.com" className="mt-4 inline-block text-sm text-muted-foreground hover:text-primary">hello@lin-notes.com</a></div><p className="font-mono text-xs text-muted-foreground">© 2026 LIN NOTES</p></div></footer>
    </main>
  )
}
