import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@/lib/logger'
import { isAuthenticatedRequest } from '@/lib/auth'
import { deleteFile, readRaw, withFileLock, writeJSON, writeRaw } from '@/lib/storage'

const log = createLogger('api/admin/import')

type ImportPayload = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isPost(value: unknown): boolean {
  if (!isRecord(value)) return false
  const status = value.status
  return (
    typeof value.slug === 'string' &&
    typeof value.date === 'string' &&
    typeof value.category === 'string' &&
    typeof value.title === 'string' &&
    typeof value.excerpt === 'string' &&
    typeof value.content === 'string' &&
    typeof value.read === 'string' &&
    (value.views === undefined || isNonNegativeNumber(value.views)) &&
    (status === undefined || status === 'draft' || status === 'published' || status === 'scheduled') &&
    (value.tags === undefined || (Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === 'string'))) &&
    (value.publishAt === undefined || typeof value.publishAt === 'string') &&
    (value.deletedAt === undefined || typeof value.deletedAt === 'string') &&
    (value.updatedAt === undefined || typeof value.updatedAt === 'string')
  )
}

function isComment(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.postSlug === 'string' &&
    typeof value.name === 'string' &&
    typeof value.content === 'string' &&
    typeof value.createdAt === 'string' &&
    (value.status === 'pending' || value.status === 'approved') &&
    (value.parentId === undefined || typeof value.parentId === 'string') &&
    (value.email === undefined || typeof value.email === 'string')
  )
}

function isNotification(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.type === 'comment' || value.type === 'reply' || value.type === 'system') &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.content === 'string' &&
    typeof value.read === 'boolean' &&
    typeof value.createdAt === 'string' &&
    (value.commentId === undefined || typeof value.commentId === 'string') &&
    (value.postSlug === undefined || typeof value.postSlug === 'string')
  )
}

function isStats(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.daily) || !isNonNegativeNumber(value.totalViews)) {
    return false
  }
  if (!value.daily.every((item) => isRecord(item) && typeof item.date === 'string' && isNonNegativeNumber(item.views))) {
    return false
  }
  if (value.bySlug === undefined) return true
  if (!isRecord(value.bySlug)) return false
  return Object.values(value.bySlug).every(
    (daily) =>
      isRecord(daily) &&
      Object.values(daily).every((views) => isNonNegativeNumber(views))
  )
}

// 数据导入（仅管理员）：用导出的备份文件整体替换对应数据。
// 每个部分独立校验后写入，全部在文件锁内执行；导入是破坏性操作，UI 端需二次确认。
export async function POST(request: NextRequest) {
  if (!(await isAuthenticatedRequest())) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 })
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: '备份文件格式不正确' }, { status: 400 })
  }

  const payload: ImportPayload = body
  const posts = payload.posts
  const comments = payload.comments
  const notifications = payload.notifications
  const stats = payload.stats

  // 先完整校验，再开始写入，避免无效的后续分区造成前面数据已经被覆盖。
  if (posts !== undefined && (!Array.isArray(posts) || !posts.every(isPost))) {
    return NextResponse.json({ error: 'posts 数据格式不正确' }, { status: 400 })
  }
  if (comments !== undefined && (!Array.isArray(comments) || !comments.every(isComment))) {
    return NextResponse.json({ error: 'comments 数据格式不正确' }, { status: 400 })
  }
  if (notifications !== undefined && (!Array.isArray(notifications) || !notifications.every(isNotification))) {
    return NextResponse.json({ error: 'notifications 数据格式不正确' }, { status: 400 })
  }
  if (stats !== undefined && stats !== null && !isStats(stats)) {
    return NextResponse.json({ error: 'stats 数据格式不正确' }, { status: 400 })
  }
  if (posts === undefined && comments === undefined && notifications === undefined && (stats === undefined || stats === null)) {
    return NextResponse.json(
      { error: '备份文件中没有可导入的数据（需要 posts/comments/notifications/stats 至少一项）' },
      { status: 400 }
    )
  }

  // slug 必须唯一：readPost / updatePost / deletePost / purgePost 都靠 findIndex 取第一条命中，
  // 重复 slug 会让"改这一篇"变成"改到不确定的那一篇"，是不可恢复的数据损坏。
  if (Array.isArray(posts)) {
    const slugs = new Set<string>()
    for (const post of posts as Record<string, unknown>[]) {
      const slug = post.slug as string
      if (slugs.has(slug)) {
        return NextResponse.json(
          { error: `posts 中存在重复的 slug：${slug}` },
          { status: 400 }
        )
      }
      slugs.add(slug)
    }
  }

  const imported: Record<string, number | boolean> = {}

  // 待写入的分区清单。四个 JSON 是彼此独立的文件，没有跨文件事务可用，
  // 因此这里用"先全量快照 → 逐个写入 → 任一步失败就按快照回滚"来逼近原子性，
  // 避免出现 posts 已替换、comments 还是旧数据的半新半旧状态。
  const plan: { fileName: string; key: string; data: unknown; count?: number }[] = []
  if (Array.isArray(posts)) {
    plan.push({ fileName: 'posts.json', key: 'posts', data: posts, count: posts.length })
  }
  if (Array.isArray(comments)) {
    plan.push({ fileName: 'comments.json', key: 'comments', data: comments, count: comments.length })
  }
  if (Array.isArray(notifications)) {
    plan.push({
      fileName: 'notifications.json',
      key: 'notifications',
      data: notifications,
      count: notifications.length,
    })
  }
  if (stats !== undefined && stats !== null) {
    plan.push({ fileName: 'stats.json', key: 'stats', data: stats })
  }

  // 快照必须在任何写入之前全部取完，否则"备份"里会混入已被覆盖的内容
  let snapshots: { fileName: string; raw: string | null }[]
  try {
    snapshots = await Promise.all(
      plan.map(async (item) => ({
        fileName: item.fileName,
        raw: await readRaw(item.fileName),
      }))
    )
  } catch (err) {
    log.error('导入前快照失败，已中止', { error: String(err) })
    return NextResponse.json({ error: '导入失败：无法读取现有数据以备份' }, { status: 500 })
  }

  try {
    for (const item of plan) {
      await withFileLock(item.fileName, () => writeJSON(item.fileName, item.data))
      imported[item.key] = item.count ?? true
    }
  } catch (err) {
    log.error('数据导入失败，开始回滚', { error: String(err) })
    const failedFiles: string[] = []
    for (const snap of snapshots) {
      try {
        await withFileLock(snap.fileName, async () => {
          // 快照为 null 说明导入前这个文件不存在，回滚时应当删掉而不是写空内容
          if (snap.raw === null) await deleteFile(snap.fileName)
          else await writeRaw(snap.fileName, snap.raw)
        })
      } catch (restoreErr) {
        failedFiles.push(snap.fileName)
        log.error('回滚失败', { fileName: snap.fileName, error: String(restoreErr) })
      }
    }
    return NextResponse.json(
      {
        error: failedFiles.length
          ? `导入失败，且以下分区回滚失败（${failedFiles.join('、')}），请用备份文件手工恢复`
          : '导入失败：文件写入出错，已回滚到导入前状态',
      },
      { status: 500 }
    )
  }

  log.info('数据导入成功', imported)
  return NextResponse.json({ ok: true, imported })
}
