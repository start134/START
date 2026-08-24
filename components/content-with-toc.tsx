'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'

export interface TocHeading {
  id: string
  text: string
  level: 2 | 3
}

export interface ContentWithTocProps {
  /** 文章正文；支持用 ## / ### 开头的行作为 h2/h3 标题，其它行按段落保留换行 */
  content: string
  /** 当正文里解析出至少 1 个标题时回调；内容变化会重新计算（slug 切文章就变） */
  onHeadingsChange?: (headings: TocHeading[]) => void
  className?: string
}

/** 生成 URL 友好的 slug：中文/数字/字母保留，其余转 -，末尾去重 */
function slugify(text: string, used: Set<string>): string {
  let base = (text || '')
    .trim()
    .toLowerCase()
    // 保留中文、字母、数字、下划线；其余替换为 -
    .replace(/[^0-9a-z\u4e00-\u9fa5_]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!base) base = 'section'
  let candidate = base
  let i = 2
  while (used.has(candidate)) {
    candidate = `${base}-${i++}`
  }
  used.add(candidate)
  return candidate
}

/**
 * 代码块 + 右上角复制按钮：点击复制代码到剪贴板，2s 内显示「已复制 ✓」/「复制失败」。
 * 主路径 navigator.clipboard.writeText；失败（非 HTTPS / 旧浏览器 / 文档未聚焦）退回 execCommand 兜底。
 * 无论成败都给即时反馈，让按钮响应可见。
 */
function CodeBlock({ children }: { children: React.ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null)
  const [feedback, setFeedback] = useState<'idle' | 'copied' | 'failed'>('idle')

  const onCopy = useCallback(async () => {
    const pre = preRef.current
    if (!pre) return
    const text = pre.textContent ?? ''
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      // 非安全上下文 / 旧浏览器 / 文档未聚焦：退回 execCommand 兜底
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.top = '0'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {
        ok = false
      }
    }
    setFeedback(ok ? 'copied' : 'failed')
    window.setTimeout(() => setFeedback('idle'), 2000)
  }, [])

  const label =
    feedback === 'copied' ? '已复制 ✓' : feedback === 'failed' ? '复制失败' : '复制'

  return (
    <div className="relative mt-6 mb-6">
      <pre
        ref={preRef}
        className="overflow-x-auto border border-border bg-black/40 p-4 text-sm leading-6"
      >
        {children}
      </pre>
      <button
        type="button"
        onClick={onCopy}
        aria-label={label}
        className={`absolute right-2 top-2 border bg-card/80 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] backdrop-blur transition-colors ${
          feedback === 'copied'
            ? 'border-primary text-primary'
            : feedback === 'failed'
              ? 'border-destructive text-destructive'
              : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
        }`}
      >
        {label}
      </button>
    </div>
  )
}

/**
 * 轻量正文渲染器：
 *  - 扫描 content 中 `## 标题` / `### 标题` 行，生成带 id 的 h2/h3（保持 TOC 锚点稳定）
 *  - 其余段落交给 react-markdown 渲染：支持加粗/斜体/行内代码/代码块/列表/引用/链接/表格/图片
 *  - 代码块由 rehype-highlight + github-dark 主题高亮
 *  - 返回 headings 给父组件画 TOC
 */
const markdownComponents: Components = {
  p: ({ children }) => (
    <p className="mt-6 text-base leading-8 text-foreground/90 first:mt-0">{children}</p>
  ),
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  code: ({ className, children, ...rest }) => {
    // 块级代码（被 pre 包裹）保留 hljs class 让高亮 CSS 生效；行内代码走主色 chip 样式
    const isBlock = typeof className === 'string' && className.includes('hljs')
    return isBlock ? (
      <code className={className} {...rest}>
        {children}
      </code>
    ) : (
      <code className="mx-0.5 rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[0.875em] text-primary" {...rest}>
        {children}
      </code>
    )
  },
  ul: ({ children }) => <ul className="mt-6 list-disc space-y-2 pl-6 text-foreground/90">{children}</ul>,
  ol: ({ children }) => <ol className="mt-6 list-decimal space-y-2 pl-6 text-foreground/90">{children}</ol>,
  li: ({ children }) => <li className="leading-8">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mt-6 border-l-2 border-primary/40 pl-4 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 transition-colors hover:text-primary/70"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-8 border-border" />,
  table: ({ children }) => (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border px-3 py-2 text-left font-medium text-foreground">{children}</th>
  ),
  td: ({ children }) => <td className="border border-border px-3 py-2 text-foreground/90">{children}</td>,
  // ## / ### 由 ContentWithToc 自定义渲染（带 id + TOC 收集），这里只覆盖其它级别
  h1: ({ children }) => <h1 className="mt-12 text-2xl font-medium tracking-tight sm:text-3xl">{children}</h1>,
  h4: ({ children }) => <h4 className="mt-8 text-lg font-medium tracking-tight">{children}</h4>,
  h5: ({ children }) => <h5 className="mt-6 text-base font-medium">{children}</h5>,
  h6: ({ children }) => <h6 className="mt-4 text-sm font-medium text-muted-foreground">{children}</h6>,
  img: ({ src, alt }) => (
    <img src={src} alt={alt} className="mt-6 rounded border border-border" loading="lazy" />
  ),
}

export function ContentWithToc({ content, onHeadingsChange, className }: ContentWithTocProps) {
  const { blocks, headings } = useMemo(() => {
    const lines = (content ?? '').split(/\r?\n/)
    const used = new Set<string>()
    const hList: TocHeading[] = []
    const pBlocks: Array<
      | { kind: 'p'; lines: string[] }
      | { kind: 'h'; level: 2 | 3; id: string; text: string }
    > = []
    let paraBuffer: string[] = []

    const flushPara = () => {
      if (paraBuffer.length === 0) return
      pBlocks.push({ kind: 'p', lines: [...paraBuffer] })
      paraBuffer = []
    }

    for (const raw of lines) {
      const line = raw.replace(/\s+$/g, '')
      const h2 = /^##\s+(.+)$/.exec(line)
      const h3 = /^###\s+(.+)$/.exec(line)
      if (h2) {
        flushPara()
        const text = h2[1].trim()
        const id = slugify(text, used)
        hList.push({ id, text, level: 2 })
        pBlocks.push({ kind: 'h', level: 2, id, text })
      } else if (h3) {
        flushPara()
        const text = h3[1].trim()
        const id = slugify(text, used)
        hList.push({ id, text, level: 3 })
        pBlocks.push({ kind: 'h', level: 3, id, text })
      } else {
        paraBuffer.push(line)
      }
    }
    flushPara()
    return { blocks: pBlocks, headings: hList }
  }, [content])

  // 通知父组件 TOC 更新
  const firstRun = useRef(true)
  useEffect(() => {
    onHeadingsChange?.(headings)
    firstRun.current = false
    return () => {
      // 卸载：清空（切另一篇文章的中间态防残留）
      if (firstRun.current) return
    }
  }, [headings, onHeadingsChange])

  return (
    <div className={className}>
      {blocks.map((b, i) => {
        if (b.kind === 'h') {
          if (b.level === 2) {
            return (
              <h2
                key={i}
                id={b.id}
                className="group mt-12 scroll-mt-24 text-2xl font-medium tracking-tight sm:text-3xl"
              >
                <a
                  href={`#${b.id}`}
                  className="text-foreground transition-colors hover:text-primary"
                  aria-label={`锚点：${b.text}`}
                >
                  {b.text}
                </a>
              </h2>
            )
          }
          return (
            <h3
              key={i}
              id={b.id}
              className="group mt-8 scroll-mt-24 text-xl font-medium tracking-tight sm:text-2xl"
            >
              <a
                href={`#${b.id}`}
                className="text-foreground transition-colors hover:text-primary"
                aria-label={`锚点：${b.text}`}
              >
                {b.text}
              </a>
            </h3>
          )
        }
        // 段落：交给 react-markdown 渲染，支持加粗/代码/列表/引用/链接/表格
        const md = b.lines.join('\n')
        return (
          <div key={i} className="text-base leading-8 text-foreground/90">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={markdownComponents}
            >
              {md}
            </ReactMarkdown>
          </div>
        )
      })}
    </div>
  )
}

export interface TocSideProps {
  headings: TocHeading[]
  /** 滚动容器，默认 document 视窗 */
  containerRef?: React.RefObject<HTMLElement>
}

/**
 * 右侧浮动目录：lg 屏 sticky 右上，< lg 屏收起来不显示（父组件自行在 Hero 下方放 inline 版）
 */
export function TocSide({ headings }: TocSideProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const idsRef = useRef<string[]>([])

  useEffect(() => {
    idsRef.current = headings.map((h) => h.id)
  }, [headings])

  // IntersectionObserver：rootMargin 让 "进入屏幕上方 1/3 处" 算进入当前阅读段
  useEffect(() => {
    if (typeof window === 'undefined' || headings.length === 0) return
    const nodes = headings
      .map((h) => document.getElementById(h.id))
      .filter((n): n is HTMLElement => !!n)
    if (nodes.length === 0) return

    let latest: string | null = activeId
    const io = new IntersectionObserver(
      (entries) => {
        // 优先取最靠近顶部、可见的那一个；都不可见就保留上一次
        let best: IntersectionObserverEntry | null = null
        for (const e of entries) {
          if (!e.isIntersecting) continue
          if (!best || e.boundingClientRect.top < best.boundingClientRect.top) best = e
        }
        if (best) latest = (best.target as HTMLElement).id
        setActiveId(latest)
      },
      {
        // 顶部留导航条的高度，下方给一点余量，避免滚动底部最后一节没法高亮
        rootMargin: '-120px 0px -60% 0px',
        threshold: [0, 1],
      }
    )
    nodes.forEach((n) => io.observe(n))

    // 兜底：首次进来都还没触发 intersection，手动取第一屏最靠近 120px 的那个
    let first: HTMLElement | null = null
    for (const n of nodes) {
      const top = n.getBoundingClientRect().top
      if (top < 160) first = n
    }
    if (first) {
      latest = first.id
      setActiveId(latest)
    }
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headings])

  if (headings.length === 0) return null

  return (
    <nav aria-label="目录" className="hidden lg:block">
      <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
        On this page
      </p>
      <ul className="space-y-2 border-l border-border text-sm">
        {headings.map((h, idx) => {
          const active = h.id === activeId
          return (
            <li key={`${h.id}-${idx}`}>
              <a
                href={`#${h.id}`}
                onClick={(e) => {
                  // 原生锚点 + smooth scroll；避免浏览器 history push 一堆 #hash 影响后退
                  e.preventDefault()
                  const el = document.getElementById(h.id)
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                className={[
                  'relative block -ml-px border-l pl-4 pr-1 py-1 transition-colors',
                  h.level === 3 ? 'pl-8 text-xs' : 'text-[13px]',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {h.text}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export default ContentWithToc
