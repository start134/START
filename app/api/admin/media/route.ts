import fs from 'node:fs/promises'
import path from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@/lib/logger'
import { isAuthenticatedRequest } from '@/lib/auth'
import { readAllPosts } from '@/lib/posts-store'

const log = createLogger('api/admin/media')

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')
// 文件名白名单：只允许字母数字下划线点横线，杜绝路径穿越
const NAME_RE = /^[A-Za-z0-9._-]+$/

export type MediaItem = {
  name: string
  url: string
  size: number
  uploadedAt: string
  /** 是否被任何文章（含回收站）的正文/摘要引用 */
  referenced: boolean
}

// 媒体列表（仅管理员）：public/uploads 下的图片 + 被引用情况
export async function GET() {
  if (!(await isAuthenticatedRequest())) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }

  try {
    let names: string[] = []
    try {
      names = await fs.readdir(UPLOAD_DIR)
    } catch {
      // 目录不存在 = 还没上传过图片
      return NextResponse.json({ items: [] })
    }

    const posts = await readAllPosts({ includeDeleted: true })
    const haystack = posts
      .map((p) => `${p.content}\n${p.excerpt}`)
      .join('\n')

    const items: MediaItem[] = []
    for (const name of names) {
      if (name.startsWith('.')) continue
      try {
        const stat = await fs.stat(path.join(UPLOAD_DIR, name))
        if (!stat.isFile()) continue
        items.push({
          name,
          url: `/uploads/${name}`,
          size: stat.size,
          uploadedAt: stat.mtime.toISOString(),
          referenced: haystack.includes(`/uploads/${name}`),
        })
      } catch {
        // 单个文件 stat 失败跳过
      }
    }

    items.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    log.debug('媒体列表', { count: items.length })
    return NextResponse.json({ items })
  } catch (err) {
    log.error('媒体列表失败', { error: String(err) })
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}

// 删除媒体文件（仅管理员；?name=xxx）
export async function DELETE(request: NextRequest) {
  if (!(await isAuthenticatedRequest())) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }

  const name = request.nextUrl.searchParams.get('name') ?? ''
  if (!name || !NAME_RE.test(name) || name.includes('..')) {
    return NextResponse.json({ error: '文件名不合法' }, { status: 400 })
  }

  const filePath = path.join(UPLOAD_DIR, name)
  if (path.dirname(filePath) !== UPLOAD_DIR) {
    return NextResponse.json({ error: '文件名不合法' }, { status: 400 })
  }

  try {
    await fs.unlink(filePath)
    log.info('媒体文件已删除', { name })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 })
    }
    log.error('媒体删除失败', { name, error: String(err) })
    return NextResponse.json({ error: '删除失败' }, { status: 500 })
  }
}
