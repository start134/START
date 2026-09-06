import { isPublishedPost, readAllPosts } from '@/lib/posts-store'
import {
  SITE_URL,
  SITE_TITLE,
  SITE_DESCRIPTION,
  SITE_AUTHOR,
  parseLocalDate,
} from '@/lib/site'

// RSS 2.0 订阅源：访问 /rss.xml 输出
function escapeXml(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function cdata(s: string): string {
  return `<![CDATA[${(s ?? '').replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`
}

export async function GET() {
  // RSS 是公开输出，草稿绝不进入订阅源
  const posts = (await readAllPosts()).filter(isPublishedPost)
  const buildDate = new Date().toUTCString()

  const items = posts
    .map((p) => {
      const pubDate = parseLocalDate(p.date).toUTCString()
      const link = `${SITE_URL}/articles/${p.slug}`
      return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      <category>${escapeXml(p.category)}</category>
      <description>${escapeXml(p.excerpt)}</description>
      <content:encoded>${cdata(p.content)}</content:encoded>
      <dc:creator>${escapeXml(SITE_AUTHOR)}</dc:creator>
    </item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(SITE_TITLE)}</title>
    <link>${SITE_URL}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <generator>START Blog / Next.js</generator>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
