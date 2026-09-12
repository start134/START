// 正文结构解析：把 Markdown 正文切成「标题块 + 段落块」，同时产出目录（TOC）数据。
//
// 为什么单独抽成模块：这段逻辑是纯函数，但原来内联在 React 组件的 useMemo 里，
// 只能靠"打开浏览器点一下"来验证。围栏代码块、重复标题、CRLF 这些边界情况
// 用手点很难覆盖，抽出来后可以用单测直接跑（见 lib/__tests__ 或临时脚本）。

export interface TocHeading {
  id: string
  text: string
  level: 2 | 3
}

export type ContentBlock =
  | { kind: 'p'; lines: string[] }
  | { kind: 'h'; level: 2 | 3; id: string; text: string }

/** 生成 URL 友好的 slug：中文/数字/字母保留，其余转 -，同名时追加序号去重 */
export function slugify(text: string, used: Set<string>): string {
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
 * 解析正文。规则：
 *  - `## 标题` / `### 标题` 抽成带 id 的标题块（供 TOC 锚点使用）
 *  - 其余连续行合成一个段落块，原样交给 react-markdown 渲染
 *  - **围栏代码块（``` / ~~~）内部不做标题提取**，否则代码里的 `## 注释`
 *    会被当成标题抽走，把代码块从中间劈成两段
 */
export function parseContent(content: string): {
  blocks: ContentBlock[]
  headings: TocHeading[]
} {
  const lines = (content ?? '').split(/\r?\n/)
  const used = new Set<string>()
  const headings: TocHeading[] = []
  const blocks: ContentBlock[] = []
  let paraBuffer: string[] = []

  // 围栏代码块状态。空字符串表示当前不在围栏内。
  let fenceChar = ''
  let fenceLen = 0

  const flushPara = () => {
    if (paraBuffer.length === 0) return
    blocks.push({ kind: 'p', lines: [...paraBuffer] })
    paraBuffer = []
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/g, '')

    const fence = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      const marker = fence[1]
      if (!fenceChar) {
        fenceChar = marker[0]
        fenceLen = marker.length
      } else if (marker[0] === fenceChar && marker.length >= fenceLen) {
        // 闭合围栏必须与开启围栏同字符、且不短于开启长度（CommonMark 规则）
        fenceChar = ''
        fenceLen = 0
      }
      paraBuffer.push(line)
      continue
    }

    // 围栏内的所有内容原样保留，不做标题提取
    if (fenceChar) {
      paraBuffer.push(line)
      continue
    }

    const h2 = /^##\s+(.+)$/.exec(line)
    const h3 = /^###\s+(.+)$/.exec(line)
    if (h2) {
      flushPara()
      const text = h2[1].trim()
      const id = slugify(text, used)
      headings.push({ id, text, level: 2 })
      blocks.push({ kind: 'h', level: 2, id, text })
    } else if (h3) {
      flushPara()
      const text = h3[1].trim()
      const id = slugify(text, used)
      headings.push({ id, text, level: 3 })
      blocks.push({ kind: 'h', level: 3, id, text })
    } else {
      paraBuffer.push(line)
    }
  }
  flushPara()

  return { blocks, headings }
}
