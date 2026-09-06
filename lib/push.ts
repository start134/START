// 新评论推送：Bark（iOS）/ Server酱（微信）/ Resend 邮件，三选多，全部可缺省。
// 环境变量（均在 .env.local 或部署平台配置）：
//   BARK_URL          例如 https://api.day.app/你的Key
//   SERVERCHAN_SENDKEY Server酱 SendKey（sctapi.ftqq.com）
//   RESEND_API_KEY    Resend API Key
//   NOTIFY_EMAIL      接收通知的邮箱（配置 Resend 时必填）
//   NOTIFY_FROM       发件人，可选，默认 onboarding@resend.dev（仅测试用）
// 任何渠道失败只记日志，绝不影响评论主流程。
import { createLogger } from '@/lib/logger'

const log = createLogger('push')

type CommentPushInput = {
  type: 'comment' | 'reply'
  postTitle: string
  postSlug: string
  commenter: string
  content: string
}

async function pushBark(title: string, body: string): Promise<void> {
  const base = process.env.BARK_URL?.replace(/\/$/, '')
  if (!base) return
  const res = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ title, body, group: 'blog' }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Bark HTTP ${res.status}`)
  log.info('Bark 推送成功')
}

async function pushServerChan(title: string, desp: string): Promise<void> {
  const key = process.env.SERVERCHAN_SENDKEY
  if (!key) return
  const res = await fetch(`https://sctapi.ftqq.com/${key}.send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
    body: new URLSearchParams({ title, desp }).toString(),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Server酱 HTTP ${res.status}`)
  log.info('Server酱 推送成功')
}

async function pushEmail(subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.NOTIFY_EMAIL
  if (!apiKey || !to) return
  const from = process.env.NOTIFY_FROM || 'START Blog <onboarding@resend.dev>'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Resend HTTP ${res.status} ${detail.slice(0, 200)}`)
  }
  log.info('邮件通知发送成功')
}

/** 有新评论/回复时向各配置渠道推送；未配置渠道时静默跳过 */
export async function pushCommentNotification(input: CommentPushInput): Promise<void> {
  const title =
    input.type === 'reply'
      ? `《${input.postTitle}》有新回复`
      : `《${input.postTitle}》有新评论`
  const preview =
    input.content.length > 80 ? input.content.slice(0, 80) + '…' : input.content
  const body = `${input.commenter}：${preview}`
  const url = `/articles/${input.postSlug}`

  const tasks: Promise<void>[] = []
  if (process.env.BARK_URL) tasks.push(pushBark(title, body))
  if (process.env.SERVERCHAN_SENDKEY) tasks.push(pushServerChan(title, body))
  if (process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL) {
    const html = `<p><strong>${input.commenter}</strong> 在《${input.postTitle}》中${
      input.type === 'reply' ? '发表了回复' : '发表了评论'
    }：</p><blockquote>${preview}</blockquote><p><a href="${url}">查看全文</a></p>`
    tasks.push(pushEmail(title, html))
  }
  if (tasks.length === 0) {
    log.debug('未配置推送渠道，跳过评论通知')
    return
  }
  const results = await Promise.allSettled(tasks)
  for (const r of results) {
    if (r.status === 'rejected') log.warn('推送渠道失败', { error: String(r.reason) })
  }
}
