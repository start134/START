import fs from 'node:fs/promises'
import path from 'node:path'
import { createLogger } from '@/lib/logger'

const log = createLogger('posts-store')

export type Post = {
  slug: string
  date: string
  category: string
  title: string
  excerpt: string
  content: string
  read: string
  views?: number
  status?: 'draft' | 'published'
}

const DATA_DIR = path.join(process.cwd(), 'data')
const DATA_FILE = path.join(DATA_DIR, 'posts.json')

const seedPosts: Post[] = [
  {
    slug: 'liubai-shi-yizhong-biaoda',
    date: '2026.08.18',
    category: '设计',
    title: '留白，是一种表达',
    excerpt: '界面不必填满每一寸空间。好的设计懂得给内容、情绪和思考留下呼吸的地方。',
    content: `很多人把留白理解为"空"。但留白不是空，它是被刻意保留的余地。

在界面设计里，留白承担三件事：分组、节奏、优先级。两个元素之间距离一拉远，关系就松了；距离一收近，关系就紧了。这比画一条分隔线更轻、也更体面。

当我们害怕"页面看起来太空"，往往就会用装饰去填：渐变、阴影、图标、副标题。结果是每一块都在抢话，最终谁也没被听见。

留白是一种克制。它要求你回答一个问题：这一刻，到底什么值得被看见。`,
    read: '6 分钟',
    views: 0,
    status: 'published',
  },
  {
    slug: 'bafuchazai-wenti-chailai',
    date: '2026.08.10',
    category: '技术',
    title: '把复杂问题拆开来看',
    excerpt: '从一个真实项目出发，记录我如何梳理问题、建立边界，并做出更简单的技术选择。',
    content: `复杂的问题几乎从不复杂在"难"，而复杂在"缠"——多个变量互相牵制，让人无从下手。

我处理它的方式是：先写下来，再画出来。

写下来，是把脑里盘旋的担忧变成可见的句子。句子一旦写下，就不再是"我感觉这事很难"，而是"这里有 A、B、C 三件事，A 依赖 B，B 卡在外部接口"。

画出来，是把依赖关系变成一张图。图会直接告诉你哪里是关键路径，哪里是伪依赖。

拆开之后，技术选择通常只剩一种——简单的那种。`,
    read: '8 分钟',
  },
  {
    slug: 'zhoumo-zai-chengshi-li-sanbu',
    date: '2026.07.26',
    category: '生活',
    title: '周末在城市里散步',
    excerpt: '没有目的地的下午，沿着熟悉又陌生的街道，重新认识生活的细节。',
    content: `周末的下午，我常常不带目的地走。

走过菜市场时会停下——摊位上的颜色比任何设计书都好用：番茄的红、茄子的紫、青菜的绿，被随意地堆在一起，却从不冲突。

走过老巷子时会抬头——电线在天空里织出一张网，晾衣绳上的床单被风吹得鼓起，像一面懒洋洋的帆。

这些细节平时都看不见。不是它们不存在，是我们走得太快。

散步教会我：慢下来，城市才会开始对你说话。`,
    read: '4 分钟',
    views: 0,
    status: 'published',
  },
]

function sortByDateDesc(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date))
}

async function ensureFile(): Promise<void> {
  try {
    await fs.access(DATA_FILE)
  } catch {
    try {
      log.info('数据文件不存在，写入种子数据', { file: DATA_FILE })
      await fs.mkdir(DATA_DIR, { recursive: true })
      await fs.writeFile(DATA_FILE, JSON.stringify(seedPosts, null, 2), 'utf-8')
    } catch {
      log.warn('种子数据写入失败（可能是只读文件系统），将使用内置种子')
    }
  }
}

export async function readAllPosts(): Promise<Post[]> {
  await ensureFile()
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as Post[]
    if (!Array.isArray(parsed)) {
      log.warn('数据文件内容不是数组，返回种子数据')
      return sortByDateDesc(seedPosts)
    }
    const sorted = sortByDateDesc(parsed)
    log.info('读取全部文章成功', { count: sorted.length })
    return sorted
  } catch (err) {
    log.warn('读取数据文件失败，使用种子数据', { error: String(err) })
    return sortByDateDesc(seedPosts)
  }
}

export async function readPost(slug: string): Promise<Post | undefined> {
  const posts = await readAllPosts()
  const found = posts.find((p) => p.slug === slug)
  if (found) {
    log.info('查询单篇文章命中', { slug, title: found.title })
  } else {
    log.warn('查询单篇文章未命中', { slug, total: posts.length })
  }
  return found
}

function today(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

function estimateRead(content: string): string {
  const len = content.replace(/\s+/g, '').length
  const minutes = Math.max(1, Math.round(len / 300))
  return `${minutes} 分钟`
}

export type PostInput = {
  title?: string
  category?: string
  excerpt?: string
  content?: string
  status?: 'draft' | 'published'
}

export async function createPost(input: PostInput): Promise<Post> {
  const content = (input.content ?? '').trim()
  const title = (input.title ?? '').trim() || '无题'
  const post: Post = {
    slug: `p-${Date.now().toString(36)}`,
    date: today(),
    category: (input.category ?? '').trim() || '未分类',
    title,
    excerpt: (input.excerpt ?? '').trim() || content.slice(0, 60),
    content,
    read: estimateRead(content),
    status: input.status === 'draft' ? 'draft' : 'published',
  }
  log.info('准备创建文章', { slug: post.slug, title: post.title, category: post.category })
  const posts = await readAllPosts()
  posts.unshift(post)
  await fs.writeFile(DATA_FILE, JSON.stringify(posts, null, 2), 'utf-8')
  log.info('文章创建成功', { slug: post.slug, total: posts.length })
  return post
}

export async function updatePost(slug: string, input: PostInput): Promise<Post | undefined> {
  const posts = await readAllPosts()
  const idx = posts.findIndex((p) => p.slug === slug)
  if (idx < 0) {
    log.warn('更新文章未找到目标', { slug })
    return undefined
  }
  const current = posts[idx]
  const content = input.content !== undefined ? input.content.trim() : current.content
  const title = input.title !== undefined ? input.title.trim() || '无题' : current.title
  const updated: Post = {
    ...current,
    title,
    category: input.category !== undefined ? input.category.trim() || '未分类' : current.category,
    excerpt: input.excerpt !== undefined ? input.excerpt.trim() || content.slice(0, 60) : current.excerpt,
    content,
    read: input.content !== undefined ? estimateRead(content) : current.read,
    status: input.status !== undefined ? input.status : (current.status ?? 'published'),
  }
  posts[idx] = updated
  await fs.writeFile(DATA_FILE, JSON.stringify(posts, null, 2), 'utf-8')
  log.info('文章更新成功', { slug, title: updated.title })
  return updated
}

export async function incrementRead(slug: string): Promise<Post | undefined> {
  const posts = await readAllPosts()
  const idx = posts.findIndex((p) => p.slug === slug)
  if (idx < 0) {
    log.warn('阅读量 +1 未找到目标', { slug })
    return undefined
  }
  const current = posts[idx]
  if ((current.status ?? 'published') === 'draft') {
    log.info('草稿不计阅读量', { slug })
    return current
  }
  const updated: Post = { ...current, views: (current.views ?? 0) + 1 }
  posts[idx] = updated
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(posts, null, 2), 'utf-8')
    try {
      const { incrementTodayViews } = await import('@/lib/kv-stats')
      await incrementTodayViews()
    } catch {
      // 统计失败不影响阅读量
    }
  } catch (err) {
    log.warn('阅读量写入失败', { slug, error: String(err) })
  }
  return updated
}

export async function getAdjacentPosts(slug: string): Promise<{ prev?: Post; next?: Post }> {
  const posts = await readAllPosts()
  const published = posts.filter((p) => (p.status ?? 'published') === 'published')
  const idx = published.findIndex((p) => p.slug === slug)
  if (idx < 0) return {}
  const prev = idx + 1 < published.length ? published[idx + 1] : undefined
  const next = idx - 1 >= 0 ? published[idx - 1] : undefined
  return { prev, next }
}

export async function deletePost(slug: string): Promise<boolean> {
  const posts = await readAllPosts()
  const next = posts.filter((p) => p.slug !== slug)
  if (next.length === posts.length) return false
  await fs.writeFile(DATA_FILE, JSON.stringify(next, null, 2), 'utf-8')
  log.info('文章删除成功', { slug, remaining: next.length })
  return true
}
