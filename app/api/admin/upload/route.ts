import fs from 'node:fs/promises'
import path from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes } from 'node:crypto'
import { createLogger } from '@/lib/logger'
import { isAuthenticatedRequest } from '@/lib/auth'

const log = createLogger('api/admin/upload')

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')
const MAX_SIZE = 5 * 1024 * 1024 // 5MB
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

// 图片上传（仅管理员）：存到 public/uploads/，返回可直接嵌入 Markdown 的 URL。
// 注意：生产部署需要持久磁盘（见 DEPLOYMENT.md），public/uploads 也要纳入备份。
export async function POST(request: NextRequest) {
  if (!(await isAuthenticatedRequest())) {
    return NextResponse.json({ error: '请先登录' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: '请求体不是合法的表单数据' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '缺少 file 字段' }, { status: 400 })
  }
  const ext = EXT_BY_MIME[file.type]
  if (!ext) {
    return NextResponse.json(
      { error: '仅支持 PNG / JPEG / WebP / GIF 图片' },
      { status: 400 }
    )
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: '图片不能超过 5MB' }, { status: 400 })
  }

  try {
    const name = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}.${ext}`
    await fs.mkdir(UPLOAD_DIR, { recursive: true })
    await fs.writeFile(path.join(UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()))
    log.info('图片上传成功', { name, size: file.size })
    return NextResponse.json({ url: `/uploads/${name}` }, { status: 201 })
  } catch (err) {
    log.error('图片写入失败', { error: String(err) })
    return NextResponse.json({ error: '图片保存失败' }, { status: 500 })
  }
}
