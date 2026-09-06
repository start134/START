import type { Metadata } from 'next'
import Link from 'next/link'
import { isPublishedPost, readAllPosts } from '@/lib/posts-store'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '归档',
  description: '全部文章的时间线归档，按年月分组。',
}

// 归档页：按年份分组的全站文章时间线（仅公开可见的文章）
export default async function ArchivePage() {
  const posts = (await readAllPosts())
    .filter((p) => isPublishedPost(p))
    .sort((a, b) => b.date.localeCompare(a.date))

  const byYear = new Map<string, typeof posts>()
  for (const p of posts) {
    const year = p.date.slice(0, 4)
    const list = byYear.get(year) ?? []
    list.push(p)
    byYear.set(year, list)
  }
  const years = Array.from(byYear.keys()).sort((a, b) => b.localeCompare(a))

  return (
    <section className="mx-auto max-w-3xl px-6 py-16 lg:px-8 lg:py-24">
      <p className="font-mono text-xs tracking-[0.2em] text-primary">时间线</p>
      <h1 className="mt-3 text-3xl tracking-tight sm:text-4xl">归档</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        共 {posts.length} 篇文章，按发布时间倒序。
      </p>

      {years.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">还没有已发布的文章。</p>
      ) : (
        <div className="mt-10">
          {years.map((year) => (
            <div key={year} className="mb-10 last:mb-0">
              <h2 className="border-b border-border pb-3 font-mono text-xl tracking-[0.15em] text-foreground">
                {year}
                <span className="ml-3 text-xs text-muted-foreground">
                  {byYear.get(year)!.length} 篇
                </span>
              </h2>
              <ul className="divide-y divide-border">
                {byYear.get(year)!.map((p) => {
                  const monthDay = p.date.slice(5)
                  return (
                    <li key={p.slug} className="grid grid-cols-[auto_1fr] items-baseline gap-4 py-4 sm:grid-cols-[70px_1fr_auto]">
                      <time className="font-mono text-xs text-muted-foreground">
                        {monthDay}
                      </time>
                      <h3 className="min-w-0 truncate text-base tracking-tight">
                        <Link
                          href={`/articles/${p.slug}`}
                          className="transition-colors hover:text-primary"
                        >
                          {p.title}
                        </Link>
                      </h3>
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {p.category}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
