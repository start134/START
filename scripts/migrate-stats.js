import fs from 'node:fs'
import path from 'node:path'
import { bulkInsert, getTotalViews } from './lib/stats-store'

const STATS_FILE = path.join(process.cwd(), 'data', 'stats.json')

async function migrate() {
  console.log('=== 数据迁移：JSON → SQLite ===\n')

  // 1. 检查 JSON 文件
  if (!fs.existsSync(STATS_FILE)) {
    console.log('stats.json 不存在，跳过迁移')
    return
  }

  const raw = fs.readFileSync(STATS_FILE, 'utf-8')
  const data = JSON.parse(raw)

  if (!data.daily || data.daily.length === 0) {
    console.log('stats.json 中没有数据，跳过迁移')
    return
  }

  console.log(`读取到 ${data.daily.length} 条日统计数据`)
  console.log(`原总阅读量: ${data.totalViews}`)

  // 2. 导入 SQLite
  console.log('\n正在导入到 SQLite...')
  await bulkInsert(data.daily)

  // 3. 验证
  const importedTotal = await getTotalViews()
  console.log(`\n迁移完成！`)
  console.log(`  - 迁移记录数: ${data.daily.length}`)
  console.log(`  - SQLite 总阅读量: ${importedTotal}`)

  // 4. 备份原 JSON
  const backupPath = STATS_FILE + '.bak'
  fs.copyFileSync(STATS_FILE, backupPath)
  console.log(`  - 原 JSON 已备份: ${backupPath}`)

  console.log('\n✅ 迁移成功！')
  console.log('   请重启 dev server 以使用新的 SQLite 存储。')
}

migrate().catch((err) => {
  console.error('迁移失败:', err)
  process.exit(1)
})
