import { NextResponse, type NextRequest } from 'next/server'
import { createLogger } from '@/lib/logger'
import { isAuthenticatedRequest } from '@/lib/auth'
import {
  approveComment,
  createAdminReply,
  deleteComment,
  getAllCommentsForAdmin,
} from '@/lib/comments-store'
import { SITE_AUTHOR } from '@/lib/site'

const log = createLogger('api/admin/comments')

const MAX_REPLY_LEN = 2000

export async function GET() {
  // proxy.ts 已统一拦截未登录；这里保留二次校验作为防线
  if (!(await isAuthenticatedRequest())) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }

  try {
    const comments = await getAllCommentsForAdmin()
    log.debug('获取所有评论成功', { count: comments.length })
    return NextResponse.json(comments)
  } catch (err) {
    log.error('获取评论失败', { error: String(err) })
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}

type AdminAction = {
  action?: string
  id?: string
  ids?: string[]
  parentId?: string
  content?: string
}

export async function PATCH(request: NextRequest) {
  if (!(await isAuthenticatedRequest())) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as AdminAction
  // 兼容单条 { id } 与批量 { ids: [...] }
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === 'string')
    : body.id
      ? [body.id]
      : []

  if (body.action === 'approve') {
    if (ids.length === 0) {
      return NextResponse.json({ error: '缺少参数' }, { status: 400 })
    }
    try {
      let updated = 0
      const missing: string[] = []
      for (const id of ids) {
        const comment = await approveComment(id)
        if (comment) updated++
        else missing.push(id)
      }
      log.info('批量批准完成', { requested: ids.length, updated, missing: missing.length })
      return NextResponse.json({ updated, missing })
    } catch (err) {
      log.error('批准评论失败', { error: String(err) })
      return NextResponse.json({ error: '操作失败' }, { status: 500 })
    }
  }

  if (body.action === 'delete') {
    if (ids.length === 0) {
      return NextResponse.json({ error: '缺少参数' }, { status: 400 })
    }
    try {
      let deleted = 0
      const missing: string[] = []
      for (const id of ids) {
        const ok = await deleteComment(id)
        if (ok) deleted++
        else missing.push(id)
      }
      log.info('批量删除完成', { requested: ids.length, deleted, missing: missing.length })
      return NextResponse.json({ deleted, missing })
    } catch (err) {
      log.error('删除评论失败', { error: String(err) })
      return NextResponse.json({ error: '操作失败' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: '未知操作' }, { status: 400 })
}

// 管理员回复：以博主身份回复某条评论，回复自动过审
export async function POST(request: NextRequest) {
  if (!(await isAuthenticatedRequest())) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as AdminAction
  const { parentId, content } = body
  if (!parentId || typeof parentId !== 'string' || !content?.trim()) {
    return NextResponse.json({ error: '缺少回复目标或内容' }, { status: 400 })
  }
  if (content.trim().length > MAX_REPLY_LEN) {
    return NextResponse.json({ error: `回复内容过长（最多 ${MAX_REPLY_LEN} 字）` }, { status: 400 })
  }

  try {
    const reply = await createAdminReply({
      parentId,
      author: SITE_AUTHOR,
      content: content.trim(),
    })
    if (!reply) {
      return NextResponse.json({ error: '要回复的评论不存在' }, { status: 404 })
    }
    log.info('管理员回复成功', { id: reply.id, parent: parentId })
    return NextResponse.json(reply, { status: 201 })
  } catch (err) {
    log.error('管理员回复失败', { error: String(err) })
    return NextResponse.json({ error: '回复失败' }, { status: 500 })
  }
}
