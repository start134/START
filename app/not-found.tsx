import Link from 'next/link'
import NowClock from '@/components/now-clock'

export default function NotFound() {
  return (
    <section className="mx-auto flex min-h-[70vh] max-w-5xl flex-col items-center justify-center px-6 py-24 text-center lg:px-8">
      {/* 顶部时钟（和导航同款） */}
      <div className="mb-10 flex items-center gap-3 sm:gap-4">
        <span className="font-mono text-[11px] font-light uppercase tracking-[0.18em] text-foreground/90">
          START
          <span className="text-primary">.</span>
        </span>
        <span className="font-mono text-xs font-light text-foreground/20">·</span>
        <NowClock inline compact />
      </div>

      <p className="font-mono text-xs tracking-[0.24em] text-primary">4 0 4</p>
      <h1 className="mt-4 text-4xl font-medium tracking-tight sm:text-5xl">
        走到了没被记录的地方
      </h1>
      <p className="mx-auto mt-5 max-w-md text-sm leading-7 text-muted-foreground">
        这个链接可能已经被收走，或是一开始就写错了。
        没有关系，START 的首页还在老位置等你。
      </p>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="border border-foreground/10 bg-foreground/5 px-4 py-2 text-xs text-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary"
        >
          回到首页
        </Link>
        <Link
          href="/articles"
          className="border border-border px-4 py-2 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          看看全部文章 →
        </Link>
      </div>

      <p className="mt-16 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/50">
        start · the page you are looking for is not here
      </p>
    </section>
  )
}
