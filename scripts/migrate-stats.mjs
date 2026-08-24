import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DATA_DIR = path.join(process.cwd(), 'data')
const STATS_JSON = path.join(DATA_DIR, 'stats.json')
const DB_FILE = path.join(DATA_DIR, 'stats.db')

async function migrate() {
  console.log('=== 数据迁移：JSON → SQLite ===\n')

  if (!fs.existsSync(STATS_JSON)) {
    console.log('stats.json 不存在，跳过迁移')
    return
  }

  const raw = fs.readFileSync(STATS_JSON, 'utf-8')
  const data = JSON.parse(raw)

  if (!data.daily || data.daily.length === 0) {
    console.log('stats.json 中没有数据，跳过迁移')
    return
  }

  console.log(`读取到 ${data.daily.length} 条日统计数据`)
  console.log(`原总阅读量: ${data.totalViews}`)

  // 删除旧数据库（如果存在）
  if (fs.existsSync(DB_FILE)) {
    try {
      fs.unlinkSync(DB_FILE)
      console.log('已删除旧数据库')
    } catch {
      console.log('数据库被占用，将在现有数据库基础上追加数据')
    }
  }

  const db = new DatabaseSync(DB_FILE)
  db.exec('PRAGMA journal_mode=WAL')
  db.exec('PRAGMA synchronous=NORMAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      views INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date)
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  console.log('数据库表结构已创建')

  // 批量导入
  const now = new Date().toISOString()
  const insertStmt = db.prepare(`
    INSERT INTO daily_stats (date, views, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      views = excluded.views,
      updated_at = excluded.updated_at
  `)

  db.exec('BEGIN')
  try {
    for (const row of data.daily) {
      insertStmt.run(row.date, row.views, now, now)
    }
    db.exec('COMMIT')
    console.log(`已导入 ${data.daily.length} 条记录`)
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  // 更新总阅读量
  const totalViews = data.totalViews ?? data.daily.reduce((s, d) => s + d.views, 0)
  db.prepare(`
    INSERT INTO meta (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run('total_views', String(totalViews), now)

  console.log(`总阅读量已设置: ${totalViews}`)

  // 验证
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('total_views')
  const importedTotal = row ? parseInt(row.value, 10) || 0 : 0
  const count = db.prepare('SELECT COUNT(*) as cnt FROM daily_stats').get().cnt

  console.log(`\n迁移完成！`)
  console.log(`  - SQLite 记录数: ${count}`)
  console.log(`  - SQLite 总阅读量: ${importedTotal}`)

  // 备份原 JSON
  const backupPath = STATS_JSON + '.bak'
  fs.copyFileSync(STATS_JSON, backupPath)
  console.log(`  - 原 JSON 已备份: ${backupPath}`)

  db.close()
  console.log('\n✅ 迁移成功！')
  console.log('   请重启 dev server 以使用新的 SQLite 存储。')
}

migrate().catch((err) => {
  console.error('迁移失败:', err)
  process.exit(1)
})
