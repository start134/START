import { ImageResponse } from 'next/og'
import { isPublishedPost, readPost } from '@/lib/posts-store'
import { SITE_AUTHOR, SITE_TITLE } from '@/lib/site'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const alt = `${SITE_TITLE} 文章卡片`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// CJK 字体：satori 仅支持 TTF/OTF/WOFF（不支持 woff2），用 fontsource v4.1.0 的 woff 中文子集。
// 加载失败时不传 fonts，让 @vercel/og 使用内置默认字体（中文可能显示为方块，但保证出图不报错）。
const FONT_URLS = [
  'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@4.1.0/files/noto-sans-sc-chinese-simplified-400-normal.woff',
  'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@4.1.0/files/noto-sans-sc-chinese-simplified-700-normal.woff',
]
const fontCache = new Map<string, ArrayBuffer | null>()

async function loadFonts(): Promise<{ name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }[]> {
  const results = await Promise.all(
    FONT_URLS.map(async (url, i): Promise<[string, ArrayBuffer | null]> => {
      if (!fontCache.has(url)) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
          fontCache.set(url, res.ok ? await res.arrayBuffer() : null)
        } catch {
          fontCache.set(url, null)
        }
      }
      return [url, fontCache.get(url) ?? null]
    })
  )
  return results
    .filter(([, data]) => !!data)
    .map(([url, data], i) => ({
      name: 'NotoSansSC',
      data: data as ArrayBuffer,
      weight: i === 1 ? 700 : 400,
      style: 'normal' as const,
    }))
}

type Props = { params: Promise<{ slug: string }> }

// 文章分享卡片：草稿/未发布/不存在的文章一律输出无标题的通用卡片，避免泄露
export default async function ArticleOgImage({ params }: Props) {
  const { slug } = await params
  const post = await readPost(slug)
  const showPost = !!post && isPublishedPost(post)

  const title = showPost ? post!.title : SITE_TITLE
  const category = showPost ? post!.category : 'BLOG'
  const date = showPost ? post!.date : ''
  const fonts = await loadFonts()

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          backgroundColor: '#0d0f14',
          color: '#f2f4f8',
          fontFamily: fonts.length > 0 ? 'NotoSansSC' : 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 12, height: 12, backgroundColor: '#5fd4c4', display: 'flex' }} />
          <div style={{ fontSize: 26, letterSpacing: 4, color: '#5fd4c4' }}>{category}</div>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: title.length > 24 ? 58 : 72,
            fontWeight: 700,
            lineHeight: 1.25,
            maxHeight: 300,
            overflow: 'hidden',
          }}
        >
          {title}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            fontSize: 26,
            color: 'rgba(242,244,248,0.65)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex' }}>START.</div>
            <div style={{ display: 'flex', fontSize: 20 }}>{SITE_AUTHOR}</div>
          </div>
          {date && (
            <div style={{ display: 'flex', fontVariantNumeric: 'tabular-nums' }}>{date}</div>
          )}
        </div>
      </div>
    ),
    { ...(fonts.length > 0 ? { fonts } : {}), ...size }
  )
}
