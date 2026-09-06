import { readJSON, writeJSON } from '@/lib/storage'
import { createLogger } from '@/lib/logger'

const log = createLogger('comments-store')
const COMMENTS_FILE = 'comments.json'

export type Comment = {
  id: string
  postSlug: string
  parentId?: string
  name: string
  email?: string
  content: string
  createdAt: string
  status: 'pending' | 'approved'
}

export type CommentInput = {
  postSlug: string
  parentId?: string
  name: string
  email?: string
  content: string
}

function generateId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function sortByDateDesc(comments: Comment[]): Comment[] {
  return [...comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function readAllComments(): Promise<Comment[]> {
  const comments = await readJSON<Comment[]>(COMMENTS_FILE)
  if (!comments || !Array.isArray(comments)) {
    log.info('评论文件不存在或为空，返回空数组')
    return []
  }
  return sortByDateDesc(comments)
}

export async function readCommentsByPost(postSlug: string): Promise<Comment[]> {
  const all = await readAllComments()
  return all.filter(c => c.postSlug === postSlug && c.status === 'approved')
}

export async function readComment(id: string): Promise<Comment | undefined> {
  const all = await readAllComments()
  return all.find(c => c.id === id)
}

export async function createComment(input: CommentInput): Promise<Comment> {
  const comment: Comment = {
    id: generateId(),
    postSlug: input.postSlug,
    parentId: input.parentId,
    name: input.name.trim() || '匿名',
    email: input.email?.trim(),
    content: input.content.trim(),
    createdAt: new Date().toISOString(),
    status: 'pending',
  }

  const all = await readAllComments()
  all.push(comment)
  await writeJSON(COMMENTS_FILE, all)
  log.info('评论创建成功', { id: comment.id, postSlug: comment.postSlug })
  return comment
}

export async function approveComment(id: string): Promise<Comment | undefined> {
  const all = await readAllComments()
  const idx = all.findIndex(c => c.id === id)
  if (idx < 0) return undefined
  all[idx] = { ...all[idx], status: 'approved' }
  await writeJSON(COMMENTS_FILE, all)
  log.info('评论已批准', { id })
  return all[idx]
}

export async function deleteComment(id: string): Promise<boolean> {
  const all = await readAllComments()
  const next = all.filter(c => c.id !== id && c.parentId !== id)
  if (next.length === all.length) return false
  await writeJSON(COMMENTS_FILE, next)
  log.info('评论已删除', { id })
  return true
}

export async function getCommentsWithReplies(postSlug: string): Promise<Comment[]> {
  const all = await readAllComments()
  const postComments = all.filter(c => c.postSlug === postSlug && c.status === 'approved')
  const topLevel = postComments.filter(c => !c.parentId)
  const replies = postComments.filter(c => c.parentId)

  const result: Comment[] = []
  for (const comment of topLevel) {
    result.push(comment)
    const commentReplies = replies
      .filter(r => r.parentId === comment.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    result.push(...commentReplies)
  }
  return result
}

export async function getPendingCommentsCount(): Promise<number> {
  const all = await readAllComments()
  return all.filter(c => c.status === 'pending').length
}

export async function getAllCommentsForAdmin(): Promise<Comment[]> {
  return readAllComments()
}

// 公开响应剥离邮箱：评论者邮箱只进管理端，不对访客暴露
export type PublicComment = Omit<Comment, 'email'>

export function toPublicComment(comment: Comment): PublicComment {
  return {
    id: comment.id,
    postSlug: comment.postSlug,
    parentId: comment.parentId,
    name: comment.name,
    content: comment.content,
    createdAt: comment.createdAt,
    status: comment.status,
  }
}
