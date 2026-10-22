/**
 * 需求开发工作台的冒烟测试（本机执行）。
 *
 * 覆盖：
 *  1. 纯函数：飞书链接解析、记录字段映射、返回体解析；
 *  2. HTTP 层：/state /settings /requirements /skills /skill 的真实请求；
 *  3. 真实调用本机 lark-cli 读一张多维表格（只读）；lark-cli 自身报错只记为 warn。
 *
 * 运行：node test/smoke.mjs
 */
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, normalizeRecord, parseBaseInput, parseLarkRecords } from '../dsh/index.js'

const LARK = process.env.RDW_LARK_CLI || 'D:\\soft\\nodejs\\lark-cli.ps1'
const BASE_TOKEN = process.env.RDW_TEST_BASE || 'I3YnbPQp6awaxWsC1FZc8v89nyc'
const TABLE_ID = process.env.RDW_TEST_TABLE || '知识目录'

let passed = 0
let warned = 0
let failed = 0

function check(name, condition, extra) {
  if (condition) {
    passed += 1
    console.log(`  PASS  ${name}`)
  } else {
    failed += 1
    console.log(`  FAIL  ${name}${extra === undefined ? '' : ` — ${JSON.stringify(extra)}`}`)
  }
}

function warn(name, extra) {
  warned += 1
  console.log(`  WARN  ${name}${extra === undefined ? '' : ` — ${JSON.stringify(extra)}`}`)
}

/* ------------------------------------------------------------- 纯函数 */

console.log('\n[1] 纯函数')
check('链接解析：base + table', (() => {
  const parsed = parseBaseInput('https://abc.feishu.cn/base/I3YnbPQp6awaxWsC1FZc8v89nyc?table=tblAbC123&view=vew1')
  return parsed.baseToken === 'I3YnbPQp6awaxWsC1FZc8v89nyc' && parsed.tableId === 'tblAbC123'
})())
check('链接解析：裸 token', (() => {
  const parsed = parseBaseInput('I3YnbPQp6awaxWsC1FZc8v89nyc 知识目录')
  return parsed.baseToken === 'I3YnbPQp6awaxWsC1FZc8v89nyc' && parsed.tableId === '知识目录'
})())
check('链接解析：空输入', parseBaseInput('').baseToken === '')

check('记录映射：标题/状态/项目/负责人自动识别', (() => {
  const mapped = normalizeRecord(
    { record_id: 'rec1', fields: { 需求标题: '对账页支持批量导出', 状态: '开发中', 所属项目: 'payroll', 负责人: [{ name: '张三' }], 备注: 'x' } },
    {},
  )
  return mapped.title === '对账页支持批量导出' && mapped.status === '开发中' && mapped.project === 'payroll' && mapped.owner === '张三' && mapped.fields['备注'] === 'x'
})())
check('记录映射：没有标题字段时退回第一个字段', normalizeRecord({ record_id: 'r', fields: { 事项: '补一个接口' } }, {}).title === '补一个接口')
check('记录映射：显式字段名优先', normalizeRecord({ record_id: 'r', fields: { A: '1', B: '2' } }, { titleField: 'B' }).title === '2')

check('返回体解析：items / data.items / ndjson', (() => {
  const a = parseLarkRecords(JSON.stringify({ items: [{ record_id: '1' }] }))
  const b = parseLarkRecords(JSON.stringify({ data: { items: [{ record_id: '2' }] } }))
  const c = parseLarkRecords('{"record_id":"3"}\n{"record_id":"4"}\n')
  return a.length === 1 && b.length === 1 && c.length === 2
})())
check('返回体解析：坏数据不抛错', parseLarkRecords('not json at all').length === 0)

/* ---------------------------------------------------------------- HTTP */

console.log('\n[2] HTTP 层（真实 handler）')
const root = await mkdtemp(join(tmpdir(), 'rdw-smoke-'))
const routes = []
const ctx = {
  effect(fn) {
    const dispose = fn()
    return () => {
      if (typeof dispose === 'function') dispose()
    }
  },
  webServer: {
    register(route) {
      routes.push(route)
      return () => {
        const index = routes.indexOf(route)
        if (index >= 0) routes.splice(index, 1)
      }
    },
  },
}

apply(ctx, { root, larkCli: LARK, identity: 'user', skillsRoots: [] })
check('注册了 prefix 路由', routes.length === 1 && routes[0].kind === 'prefix' && routes[0].path === '/api/requirement-dev-workbench')

const handler = routes[0].handler

async function call(method, path, body) {
  const req = new EventEmitter()
  req.url = `/api/requirement-dev-workbench${path}`
  req.method = method
  req.destroy = () => {}
  const res = {
    status: 0,
    headers: null,
    body: '',
    writeHead(status, headers) {
      res.status = status
      res.headers = headers
      return res
    },
    end(payload) {
      res.body = payload ?? ''
      return res
    },
  }
  const done = handler(req, res)
  if (body !== undefined) {
    setImmediate(() => {
      req.emit('data', JSON.stringify(body))
      req.emit('end')
    })
  } else {
    setImmediate(() => req.emit('end'))
  }
  await done
  let json = null
  try {
    json = JSON.parse(res.body)
  } catch {
    json = null
  }
  return { status: res.status, json, raw: res.body }
}

const state0 = await call('GET', '/state')
check('/state 返回 200 且带 settings', state0.status === 200 && state0.json?.settings !== undefined && state0.json.configured === false)
check('/state 解析出了 lark-cli 路径', typeof state0.json?.larkCli === 'string' && state0.json.larkCli.length > 0, state0.json?.larkCli)

const saved = await call('POST', '/settings', { baseInput: `${BASE_TOKEN} ${TABLE_ID}`, projectDir: '' })
check('/settings 保存并把链接解析成 base_token/table_id', saved.status === 200 && saved.json?.settings?.baseToken === BASE_TOKEN && saved.json?.settings?.tableId === TABLE_ID)

const state1 = await call('GET', '/state')
check('/state 读回持久化结果（configured=true）', state1.json?.configured === true)
check('设置文件写在数据目录里', await (async () => {
  const { readFile } = await import('node:fs/promises')
  const text = await readFile(join(root, 'settings.json'), 'utf8').catch(() => '')
  return text.includes(BASE_TOKEN)
})())

const requirements = await call('GET', '/requirements')
if (requirements.status === 200 && requirements.json?.error) {
  warn('真实读飞书表：lark-cli 报了错（代码链路正常，属环境/参数问题）', { detail: String(requirements.json.detail || '').slice(0, 300), command: requirements.json.command })
} else {
  check('真实读飞书表：/requirements 返回记录', requirements.status === 200 && Array.isArray(requirements.json?.items), { status: requirements.status, count: requirements.json?.count })
  if (Array.isArray(requirements.json?.items) && requirements.json.items.length) {
    console.log(`       样例：${JSON.stringify(requirements.json.items[0]).slice(0, 200)}`)
  } else {
    warn('真实读飞书表：表里没有可用记录（空表也属正常）')
  }
}

const skills = await call('GET', '/skills')
check('/skills 返回扫描范围与结果', skills.status === 200 && Array.isArray(skills.json?.items) && Array.isArray(skills.json?.roots), { roots: skills.json?.roots?.length })

const outside = await call('GET', `/skill?path=${encodeURIComponent('C:\\Windows\\win.ini')}`)
check('/skill 拒绝范围外路径', outside.status === 404)

const unknown = await call('GET', '/nope')
check('未知接口返回 404', unknown.status === 404)

/* -------------------------------------------------- 技能目录真实扫描 */

console.log('\n[3] 技能扫描（真实目录）')
const projectDir = join(root, 'fake-project')
await (async () => {
  const { mkdir } = await import('node:fs/promises')
  await mkdir(join(projectDir, '.claude', 'skills', 'feature-dev'), { recursive: true })
  await writeFile(
    join(projectDir, '.claude', 'skills', 'feature-dev', 'SKILL.md'),
    '---\nname: feature-dev\ndescription: 标准需求开发流程\n---\n\n# feature-dev\n正文\n',
    'utf8',
  )
  await mkdir(join(projectDir, 'doc', 'standards'), { recursive: true })
  await writeFile(join(projectDir, 'doc', 'standards', '03-coding.md'), '# 编码规范\n', 'utf8')
  await writeFile(join(projectDir, 'AGENTS.md'), '# 项目约定\n', 'utf8')
})()
await call('POST', '/settings', { projectDir })
const scanned = await call('GET', '/skills')
const skillNames = (scanned.json?.items ?? []).map((item) => item.name)
check('扫到项目 skill 并解析出 frontmatter 描述', skillNames.includes('feature-dev'), skillNames)
check('扫到规范文档', (scanned.json?.docs ?? []).some((doc) => doc.name === '03-coding'), (scanned.json?.docs ?? []).map((d) => d.name))
const readable = await call('GET', `/skill?path=${encodeURIComponent(join(projectDir, '.claude', 'skills', 'feature-dev', 'SKILL.md'))}`)
check('能读出 skill 正文', readable.status === 200 && String(readable.json?.text ?? '').includes('# feature-dev'))

await rm(root, { recursive: true, force: true })

console.log(`\n结果：PASS ${passed} · WARN ${warned} · FAIL ${failed}`)
process.exitCode = failed === 0 ? 0 : 1
