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
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { FLOW_EVIDENCE_KINDS, FLOW_STAGES, FLOW_STATUS, apply, alignMatrixColumns, buildBatchUpdatePayload, cellValueFor, checkAcceptanceCriteria, flowEvidenceStats, flowPercent, flowStageName, foldFlows, foldRuns, listTables, matrixShape, normalizeRecord, parseBaseInput, parseChangelog, parseDocInput, parseDocPayload, parseJsonLoose, parseLarkRecords, recordsFromMatrix, renderExpertMarkdown, renderSkillMarkdown, runTaskKey, slugifySkillName } from '../dsh/index.js'

// 真实飞书表信息不写进仓库：优先读环境变量，其次读本机私有配置 test/smoke.local.json（已在 .gitignore 里）。
// 都没有时用占位值 —— 真实网络相关的检查会降级为 WARN，不会判失败。
const localTestConfig = (() => {
  try {
    return JSON.parse(readFileSync(new URL('./smoke.local.json', import.meta.url), 'utf8'))
  } catch {
    return {}
  }
})()
const LARK = process.env.RDW_LARK_CLI || localTestConfig.larkCli || 'lark-cli'
const BASE_TOKEN = process.env.RDW_TEST_BASE || localTestConfig.baseToken || 'bascnPlaceholderToken'
const TABLE_ID = process.env.RDW_TEST_TABLE || localTestConfig.tableId || '需求池'
const REAL_BASE_URL =
  process.env.RDW_TEST_REAL_BASE || localTestConfig.realBaseUrl || 'https://example.feishu.cn/base/placeholderBaseToken0001?table=tblPlaceholder0001'
const REAL_TASK_URL =
  process.env.RDW_TEST_TASK_BASE || localTestConfig.realTaskUrl || 'https://example.feishu.cn/base/placeholderBaseToken0001?table=tblPlaceholder0002'

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
  const parsed = parseBaseInput('https://abc.feishu.cn/base/bascnPlaceholderToken?table=tblAbC123&view=vew1')
  return parsed.baseToken === 'bascnPlaceholderToken' && parsed.tableId === 'tblAbC123'
})())
check('链接解析：裸 token', (() => {
  const parsed = parseBaseInput('bascnPlaceholderToken 知识目录')
  return parsed.baseToken === 'bascnPlaceholderToken' && parsed.tableId === '知识目录'
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

/* 值矩阵列序纠偏：真机上遇到过「列顺序 ≠ 字段清单顺序」导致字段串位 */

const schema3 = [
  { name: '状态', type: 'singleSelect', options: ['待开发', '已完成'] },
  { name: '需求标题', type: 'text', options: [] },
  { name: '优先级', type: 'singleSelect', options: ['P0', 'P1'] },
]
check('值矩阵：列序错位时按选项值纠正回来', (() => {
  const rows = [
    ['技能标签支持 Excel 批量导入', '待开发', 'P0'],
    ['薪资标准对比导出', '已完成', 'P1'],
  ]
  const result = alignMatrixColumns(rows, schema3)
  return result.aligned === true && result.names.join(',') === '需求标题,状态,优先级'
})(), alignMatrixColumns([['技能标签支持 Excel 批量导入', '待开发', 'P0']], schema3))
check('值矩阵：列序正确时原样通过', (() => {
  const result = alignMatrixColumns([['待开发', '技能标签支持 Excel 批量导入', 'P0']], schema3)
  return result.aligned === true && result.names.join(',') === '状态,需求标题,优先级'
})())
check('值矩阵：纠正不了就不猜（返回空 + 原因）', (() => {
  const result = alignMatrixColumns([['随便什么', '也不像状态']], [
    { name: '状态', type: 'singleSelect', options: ['待开发'] },
    { name: '需求标题', type: 'text', options: [] },
  ])
  return result.aligned === false && result.names.length === 0 && result.reason.includes('对不上')
})())
check('值矩阵：列数不一致直接判不可用', alignMatrixColumns([['a', 'b']], [{ name: '状态', type: 'text', options: [] }]).aligned === false)

/* 返回体自带字段名（data.fields / data.record_id_list）是列一一对应的权威顺序 */

check('值矩阵：优先用返回体自带的字段名', (() => {
  const parsed = {
    data: {
      data: [['PR-20261008-0001', '- [ ] 验收点', '已领取']],
      fields: [{ name: '需求编号' }, { name: '验收标准' }, { name: '状态' }],
      record_id_list: ['rec_1'],
    },
  }
  const shape = matrixShape(parsed)
  const records = recordsFromMatrix(shape.rows, shape.names, shape.recordIds)
  const item = normalizeRecord(records[0], { titleField: '需求编号', statusField: '状态' })
  return (
    records.length === 1 &&
    records[0].record_id === 'rec_1' &&
    records[0].fields['验收标准'] === '- [ ] 验收点' &&
    item.title === 'PR-20261008-0001' &&
    item.status === '已领取'
  )
})(), matrixShape({ data: { data: [['a']], fields: [{ name: '状态' }] } })?.names)
check('值矩阵：字段名数不匹配就不产出记录', recordsFromMatrix([['a', 'b']], ['状态']).length === 0 && matrixShape({ data: {} }) === null)

/* ---------------------------------------------------------------- HTTP */

console.log('\n[2] HTTP 层（真实 handler）')
const root = await mkdtemp(join(tmpdir(), 'rdw-smoke-'))
const routes = []
// 宿主 llm 服务的桩：/ai/create（页面里直接创建）靠它拿结构化草稿。llmReplyText 由用例改写。
let llmReplyText = ''
let llmAvailable = true
const llmCalls = []
const ctx = {
  effect(fn) {
    const dispose = fn()
    return () => {
      if (typeof dispose === 'function') dispose()
    }
  },
  get(key) {
    if (key === 'llm') {
      if (!llmAvailable) return undefined
      return {
        stream(options) {
          llmCalls.push(options)
          return (async function* chunks() {
            yield { type: 'text-delta', index: 0, text: llmReplyText }
            yield { type: 'finish', reason: { kind: 'stop' } }
          })()
        },
      }
    }
    if (key === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4.1-flash' }) }
    return undefined
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
  // 有些路由先 await 读设置、之后才挂 'data'/'end' 监听；body 必须在响应结束前反复补发，
  // 否则早发的 data/end 会丢，请求就永远等不到（真机 HTTP 不会这样）。
  const payload = body === undefined ? '' : JSON.stringify(body)
  const pump = setInterval(() => {
    if (payload) req.emit('data', payload)
    req.emit('end')
  }, 15)
  await done
  clearInterval(pump)
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
  // v4.2：模拟「开发 skill 在流程里产出的 spec 文档」——工作台只认不造
  await mkdir(join(projectDir, 'specs'), { recursive: true })
  await writeFile(join(projectDir, 'specs', 'cursor-paging.spec.md'), [
    '# 分页游标',
    '',
    '## 验收标准',
    '',
    '- 当游标过期时，接口返回 410 并提示「游标已失效」',
    '- 分页要正常工作',
    '',
    '## 非目标',
    '- 不做前端改造',
  ].join('\n'), 'utf8')
})()
await call('POST', '/settings', { projectDir })
const scanned = await call('GET', '/skills')
const skillNames = (scanned.json?.items ?? []).map((item) => item.name)
check('扫到项目 skill 并解析出 frontmatter 描述', skillNames.includes('feature-dev'), skillNames)
check('扫到规范文档', (scanned.json?.docs ?? []).some((doc) => doc.name === '03-coding'), (scanned.json?.docs ?? []).map((d) => d.name))
const readable = await call('GET', `/skill?path=${encodeURIComponent(join(projectDir, '.claude', 'skills', 'feature-dev', 'SKILL.md'))}`)
check('能读出 skill 正文', readable.status === 200 && String(readable.json?.text ?? '').includes('# feature-dev'))

/* 技能来源分四种范围（harness / 全局 / 项目 / 自定义），每种的目录约定都要认出来 */

await (async () => {
  const { mkdir } = await import('node:fs/promises')
  const specs = [
    ['.agents', 'skills', 'agent-conventions', '团队约定技能'],
    ['.codex', 'skills', 'codex-review', 'Codex 评审技能'],
    ['.cursor', 'skills', 'cursor-hint', 'Cursor 提示技能'],
    ['', 'skills', 'plain-skill', '裸 skills 目录技能'],
  ]
  for (const [dir, sub, slug, description] of specs) {
    const target = dir ? join(projectDir, dir, sub, slug) : join(projectDir, sub, slug)
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'SKILL.md'), `---\nname: ${slug}\ndescription: ${description}\n---\n\n# ${slug}\n`, 'utf8')
  }
  // .codex/agents/*.md 这类角色/规范文件也要能扫到
  await mkdir(join(projectDir, '.codex', 'agents'), { recursive: true })
  await writeFile(join(projectDir, '.codex', 'agents', 'java-developer.md'), '---\nname: java-developer\ndescription: Java 开发角色\n---\n\n角色说明\n', 'utf8')
})()

const conventionsScanned = await call('GET', '/skills')
const projectItems = (conventionsScanned.json?.items ?? []).filter((item) => item.scope === 'project')
const projectConventions = new Set(projectItems.map((item) => item.convention))
check(
  '项目的 .claude / .agents / .codex / .cursor / skills 五种目录都扫到',
  ['.claude', '.agents', '.codex', '.cursor', 'skills'].every((convention) => projectConventions.has(convention)),
  [...projectConventions],
)
check(
  '每个技能都带范围 + 目录约定标签',
  projectItems.every((item) => item.scope === 'project' && typeof item.convention === 'string'),
  projectItems.slice(0, 3).map((item) => `${item.scope}/${item.convention}/${item.name}`),
)
check(
  '角色/规范文件按 kind=agent 扫到',
  (conventionsScanned.json?.items ?? []).some((item) => item.kind === 'agent' && item.name === 'java-developer'),
  (conventionsScanned.json?.items ?? []).filter((item) => item.kind === 'agent').map((item) => item.name),
)
const summary = conventionsScanned.json?.summary ?? []
check(
  '来源汇总按范围分组（harness / global / project / custom）',
  ['harness', 'global', 'project', 'custom'].every((scope) => summary.some((entry) => entry.scope === scope)),
  summary,
)
check(
  '项目范围统计到技能数',
  (summary.find((entry) => entry.scope === 'project')?.skills ?? 0) >= 5,
  summary.find((entry) => entry.scope === 'project'),
)
check(
  'roots 带 exists 标记（不存在的目录也列出来但不扫）',
  Array.isArray(conventionsScanned.json?.roots) && conventionsScanned.json.roots.some((r) => r.exists === false) && conventionsScanned.json.roots.some((r) => r.exists === true),
  (conventionsScanned.json?.roots ?? []).map((r) => `${r.label}:${r.exists ? '有' : '无'}`).slice(0, 4),
)

/* 新建技能：默认写进 DeepSeek Harness 通用技能根（测试用临时 DSH_HOME，不碰真机） */

const fakeDshHome = await mkdtemp(join(tmpdir(), 'rdw-dshhome-'))
const savedDshHome = process.env.DSH_HOME
process.env.DSH_HOME = fakeDshHome
try {
  const listedHarness = await call('GET', '/skills')
  check('列出 DeepSeek Harness 技能根', listedHarness.json?.harnessSkillDir === join(fakeDshHome, 'skills'), listedHarness.json?.harnessSkillDir)

  const created = await call('POST', '/skills/create', {
    name: 'Java Code Review',
    description: '评审 Java 代码改动：先看 diff，再看测试',
    whenToUse: '需要评审 Java 改动时',
    steps: '先看 diff\n再看测试\n最后给结论',
    notes: '别改业务语义',
  })
  check('新建技能：写进 Harness 通用技能根', created.status === 200 && created.json?.ok === true && created.json.path === join(fakeDshHome, 'skills', 'java-code-review', 'SKILL.md'), created.json)
  const createdText = await (await import('node:fs/promises')).readFile(created.json.path, 'utf8').catch(() => '')
  check(
    '生成的 SKILL.md 带 frontmatter 与步骤',
    createdText.startsWith('---\nname: java-code-review\ndescription: 评审 Java 代码改动：先看 diff，再看测试\n---') &&
      createdText.includes('## 怎么做') &&
      createdText.includes('1. 先看 diff') &&
      createdText.includes('- 别改业务语义'),
    createdText.split('\n').slice(0, 4),
  )
  const afterCreate = await call('GET', '/skills')
  check(
    '新建后立刻能在列表里筛到（harness 范围）',
    (afterCreate.json?.items ?? []).some((item) => item.scope === 'harness' && item.name === 'java-code-review'),
    (afterCreate.json?.items ?? []).filter((item) => item.scope === 'harness').map((item) => item.name),
  )
  const again = await call('POST', '/skills/create', { name: 'java-code-review', description: '重复创建' })
  check('重名技能被拦住并提示', again.status === 400 && String(again.json?.error ?? '').includes('已存在'), again.json)
  const overwritten = await call('POST', '/skills/create', { name: 'java-code-review', description: '覆盖后的描述', overwrite: true })
  check('确认覆盖后可以重建', overwritten.status === 200 && overwritten.json?.overwrote === true, overwritten.json)
  const badName = await call('POST', '/skills/create', { name: '../../etc/passwd', description: '越权尝试' })
  check('技能名会去掉路径字符（防穿越）', badName.status === 200 && badName.json?.path === join(fakeDshHome, 'skills', 'etcpasswd', 'SKILL.md'), badName.json)
  const noDesc = await call('POST', '/skills/create', { name: 'no-desc' })
  check('缺描述不给建', noDesc.status === 400 && String(noDesc.json?.error ?? '').includes('描述'), noDesc.json)
} finally {
  if (savedDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = savedDshHome
}

/* 也可以只建到当前项目（写进 <项目>/.claude/skills） */

const projectScoped = await call('POST', '/skills/create', { name: 'project-only-skill', description: '只给这个项目用', scope: 'project' })
check(
  '新建技能可选只放当前项目（.claude/skills）',
  projectScoped.status === 200 && projectScoped.json?.path === join(projectDir, '.claude', 'skills', 'project-only-skill', 'SKILL.md'),
  projectScoped.json,
)

/* ---------------- 专家 / 专家团（参考 WorkBuddy：角色文件 = agents/<id>.md） ---------------- */

const expertHome = await mkdtemp(join(tmpdir(), 'rdw-expert-'))
const savedHomeForExperts = process.env.DSH_HOME
process.env.DSH_HOME = expertHome
try {
  const made = await call('POST', '/expert/create', {
    id: 'Java Backend Expert',
    displayName: '老陈',
    profession: 'Java 后端开发专家',
    description: '负责后端需求理解、接口与表结构设计、代码实现与单测',
    maxTurns: 30,
    abilities: '看懂 Spring Boot 分层架构\n设计 REST 接口与表结构',
    flow: '先读 AGENTS.md\n再分析影响范围\n最后实现并自测',
    outputs: '接口契约 + 表结构 + 改动清单',
    cautions: '不改业务语义\n不动没要求的文件',
  })
  check(
    '新建专家：写进 Harness 通用专家目录 <DSH_HOME>/agents/<id>.md',
    made.status === 200 && made.json?.path === join(expertHome, 'agents', 'java-backend-expert.md'),
    made.json,
  )
  const expertText = await (await import('node:fs/promises')).readFile(made.json.path, 'utf8').catch(() => '')
  check(
    '专家文件带 frontmatter（name/description/displayName/profession）与四段式正文',
    expertText.startsWith('---\nname: java-backend-expert\ndescription: 负责后端需求理解') &&
      expertText.includes('displayName: 老陈') &&
      expertText.includes('profession: Java 后端开发专家') &&
      expertText.includes('## 核心能力') &&
      expertText.includes('## 工作流程') &&
      expertText.includes('## 输出规范') &&
      expertText.includes('## 注意事项') &&
      expertText.includes('1. 看懂 Spring Boot 分层架构'),
    expertText.split('\n').slice(0, 6),
  )
  const listedExperts = await call('GET', '/experts')
  const harnessExpert = (listedExperts.json?.experts ?? []).find((entry) => entry.agentId === 'java-backend-expert')
  check(
    '专家库列出来并带范围/约定/定位（给对话里选人用）',
    listedExperts.status === 200 && Boolean(harnessExpert) && harnessExpert.scope === 'harness' && harnessExpert.profession === 'Java 后端开发专家' && harnessExpert.maxTurns === 30,
    harnessExpert,
  )
  check('专家库统计按范围分组', (listedExperts.json?.summary ?? {}).harness >= 1, listedExperts.json?.summary)
  // 同一个名字在 .claude/agents 与 .agents/agents 各有一份时，只列一次，其余位置记进 alsoIn
  await mkdir(join(projectDir, '.claude', 'agents'), { recursive: true })
  await writeFile(join(projectDir, '.claude', 'agents', 'dup-role.md'), '---\nname: dup-role\ndescription: 项目里的角色\n---\n\n正文\n', 'utf8')
  await mkdir(join(projectDir, '.agents', 'agents'), { recursive: true })
  await writeFile(join(projectDir, '.agents', 'agents', 'dup-role.md'), '---\nname: dup-role\ndescription: 另一份\n---\n\n正文\n', 'utf8')
  const deduped = await call('GET', '/experts')
  const dupRoles = (deduped.json?.experts ?? []).filter((entry) => entry.agentId === 'dup-role')
  check(
    '同名专家只列一次（优先当前项目），其它位置记进「同名还在」',
    dupRoles.length === 1 && dupRoles[0].scope === 'project' && (dupRoles[0].alsoIn ?? []).length === 1 && (deduped.json?.duplicates ?? 0) >= 1,
    dupRoles[0],
  )

  const dupExpert = await call('POST', '/expert/create', { id: 'java-backend-expert', description: '重复' })
  check('专家重名被拦住', dupExpert.status === 400 && String(dupExpert.json?.error ?? '').includes('已存在'), dupExpert.json)

  const projectExpert = await call('POST', '/expert/create', { id: 'fe-expert', description: '前端专家', scope: 'project', convention: '.codex' })
  check(
    '专家可选只放当前项目（<项目>/.codex/agents）',
    projectExpert.status === 200 && projectExpert.json?.path === join(projectDir, '.codex', 'agents', 'fe-expert.md'),
    projectExpert.json,
  )

  const team = await call('POST', '/team/create', {
    id: 'HR Delivery Team',
    name: 'HR 交付专家团',
    profession: '需求→架构→实现→评审一条龙',
    description: '一个团长带多名专家，按阶段接力交付',
    lead: 'java-backend-expert',
    members: ['java-backend-expert', 'fe-expert'],
    flow: '团长先拆需求\n后端实现\n前端跟着接口联调\n团长做验收',
  })
  check(
    '新建专家团：写进 <DSH_HOME>/experts/teams.json，带团长与成员',
    team.status === 200 && team.json?.path === join(expertHome, 'experts', 'teams.json') && team.json?.lead === 'java-backend-expert' && (team.json?.members ?? []).length === 2,
    team.json,
  )
  const listedTeams = await call('GET', '/experts')
  const savedTeam = (listedTeams.json?.teams ?? []).find((entry) => entry.id === 'hr-delivery-team')
  check(
    '专家团可读回（成员/团长/协作流程都在）',
    Boolean(savedTeam) && savedTeam.members.length === 2 && savedTeam.flow.length === 4 && savedTeam.name === 'HR 交付专家团',
    savedTeam,
  )
  const dupTeam = await call('POST', '/team/create', { id: 'hr-delivery-team', members: ['java-backend-expert'] })
  check('专家团重名要确认覆盖', dupTeam.status === 400 && String(dupTeam.json?.error ?? '').includes('覆盖'), dupTeam.json)
  const badTeam = await call('POST', '/team/create', { id: 'x-team', members: ['nobody'] })
  check('专家团成员不存在会被拦住', badTeam.status === 400 && String(badTeam.json?.error ?? '').includes('还没找到'), badTeam.json)
  const emptyTeam = await call('POST', '/team/create', { id: 'y-team', members: [] })
  check('专家团至少要 1 名专家', emptyTeam.status === 400 && String(emptyTeam.json?.error ?? '').includes('至少'), emptyTeam.json)

  const picked = await call('POST', '/settings', { expert: 'agent:java-backend-expert' })
  check('选中的专家能存进设置（对话交付默认用它）', picked.status === 200 && picked.json?.settings?.expert === 'agent:java-backend-expert', picked.json?.settings?.expert)
  const expertState = await call('GET', '/state')
  check('选中专家读回一致', expertState.json?.settings?.expert === 'agent:java-backend-expert', expertState.json?.settings?.expert)
} finally {
  if (savedHomeForExperts === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = savedHomeForExperts
}

check(
  '专家角色定义渲染：四段式 + 扁平 frontmatter',
  (() => {
    const text = renderExpertMarkdown({ id: 'a-b', displayName: '小王', profession: '测试专家', description: '负责测试', abilities: ['会写用例'], flow: [], outputs: [], cautions: [] })
    return text.includes('name: a-b') && text.includes('displayName: 小王') && text.includes('## 核心能力') && text.includes('1. 会写用例') && text.includes('1. （写下他接到需求后的固定步骤）')
  })(),
)

/* 纯函数：技能名归一化 + SKILL.md 渲染 */
check(
  '技能名归一化成 kebab-case',
  slugifySkillName('  Java Code Review_v2!! ') === 'java-code-review-v2' && slugifySkillName('../../etc/passwd') === 'etcpasswd' && slugifySkillName('') === '',
  [slugifySkillName('  Java Code Review_v2!! '), slugifySkillName('../../etc/passwd')],
)
check(
  'SKILL.md 渲染带 frontmatter / 步骤 / 注意，且空值有兜底',
  (() => {
    const filled = renderSkillMarkdown({ name: 'a-b', description: '做一件事', steps: ['第一步', '', '第二步'], notes: ['注意点'] })
    const empty = renderSkillMarkdown({ name: 'a-b', description: '做一件事' })
    return filled.includes('name: a-b') && filled.includes('1. 第一步') && filled.includes('2. 第二步') && filled.includes('- 注意点') && empty.includes('1. （写下这个技能的固定步骤）')
  })(),
)

/* ------------------------------------------- 真实需求源（端到端） */

console.log('\n[4] 真实需求源：项目内 .requirement-sources.json → 飞书需求表')
await writeFile(
  join(projectDir, '.requirement-sources.json'),
  JSON.stringify(
    {
      version: 1,
      defaultSource: 'demo-project',
      sources: {
        'demo-project': {
          baseUrl: REAL_BASE_URL,
          tableName: '需求池',
          identity: 'user',
          fields: {
            id: '需求编号',
            title: '需求标题',
            status: '状态',
            type: '需求类型',
            priority: '优先级',
            rawRequirement: '原始需求',
            design: '详细设计',
            acceptance: '验收标准',
            owner: '负责人',
          },
          filter: { 状态: ['待开发'] },
        },
      },
    },
    null,
    2,
  ),
  'utf8',
)

const detected = await call('GET', '/sources')
check('认出项目里的需求源配置', detected.status === 200 && detected.json?.found === true && detected.json.sources?.[0]?.name === 'demo-project', detected.json?.path)

const stateWithSource = await call('GET', '/state')
check('/state 因为需求源存在而视为已配置', stateWithSource.json?.configured === true && stateWithSource.json?.source?.configPath?.endsWith('.requirement-sources.json'))

const real = await call('GET', '/requirements')
if (real.json?.error) {
  warn('真实需求表读取失败（环境/权限问题，非代码问题）', String(real.json.detail || '').slice(0, 240))
} else {
  check('真实需求表：读到记录', Array.isArray(real.json?.items) && real.json.items.length > 0, { count: real.json?.count, mode: real.json?.fetchMode })
  const first = real.json?.items?.[0]
  check('字段映射生效：标题取自配置里的「需求标题」列', Boolean(first?.title) && first.title !== '（无标题记录）', { title: first?.title })
  if (first) {
    console.log(`       样例：编号=${first.code || '-'}｜标题=${first.title}｜状态=${first.status}｜负责人=${first.owner}｜字段数=${Object.keys(first.fields || {}).length}`)
    console.log(`       原始需求前 60 字：${String(first.rawRequirement || '').replace(/\s+/g, ' ').slice(0, 60)}`)
  }
}

/* ------------------------------------------- 表结构 + 视图配置（新） */

console.log('\n[5] 表结构与页面配置')
const fieldSchema = await call('GET', '/fields')
if (fieldSchema.json?.error) {
  warn('读表结构失败（环境问题）', String(fieldSchema.json.detail || '').slice(0, 200))
} else {
  const names = (fieldSchema.json?.fields ?? []).map((field) => field.name)
  check('读到表结构字段', names.length > 0, { count: names.length })
  check('字段带选项值（用于筛选/分组）', (fieldSchema.json?.fields ?? []).some((field) => field.options?.length))
  check('表结构写进了缓存文件', await (async () => {
    const { readdir } = await import('node:fs/promises')
    const files = await readdir(root).catch(() => [])
    return files.some((name) => name.startsWith('fields-'))
  })())
  console.log(`       字段：${names.slice(0, 8).join(' / ')}…`)
}

const view0 = await call('GET', '/view')
check('/view 返回默认配置', view0.status === 200 && view0.json?.view?.groupField === '状态' && Array.isArray(view0.json.view.filters))

const savedView = await call('POST', '/view', {
  filters: [
    { field: '状态', values: ['待开发', '已领取'] },
    { field: '原始需求', text: '导入' },
  ],
  groupField: '需求类型',
  cardSummaryField: '详细设计',
  listFields: ['需求标题', '状态', '优先级'],
  moduleOrder: ['性能优化', '新功能'],
  hiddenModules: ['技术改造'],
  collapsedModules: ['缺陷修复'],
  writeBackOnDrag: true,
})
check(
  '保存页面配置',
  savedView.status === 200 && savedView.json?.view?.groupField === '需求类型' && savedView.json.view.filters.length === 2 && savedView.json.view.writeBackOnDrag === true,
)

const view1 = await call('GET', '/view')
check(
  '配置持久化并可读回',
  view1.json?.view?.listFields?.join(',') === '需求标题,状态,优先级' && view1.json.view.moduleOrder.join(',') === '性能优化,新功能' && view1.json.view.hiddenModules.join(',') === '技术改造',
)

check('配置写在 view.json', await (async () => {
  const { readFile } = await import('node:fs/promises')
  const text = await readFile(join(root, 'view.json'), 'utf8').catch(() => '')
  return text.includes('需求类型') && text.includes('writeBackOnDrag')
})())

/* ------------------------------------------------- 前端纯函数（与页面同源） */

console.log('\n[6] 看板/清单的页面能力')
const { readFile: readClient } = await import('node:fs/promises')
const clientSource = await readClient(new URL('../lib/client.js', import.meta.url), 'utf8')
check('客户端包含卡片看板与汇总清单', clientSource.includes('卡片看板') && clientSource.includes('汇总清单') && clientSource.includes('复制清单'))
check('客户端支持拖拽（卡片 + 模块）', clientSource.includes("type: 'card'") && clientSource.includes("type: 'module'") && clientSource.includes('onDragStart'))
check('客户端按容器宽度重排（ResizeObserver）', clientSource.includes('ResizeObserver'))
check('客户端有总览 / 执行记录 / 添加模块 / 进度视图', clientSource.includes('工作台执行记录') && clientSource.includes('添加模块') && clientSource.includes("setMode('progress')"))
const pkgJson = JSON.parse(await readClient(new URL('../package.json', import.meta.url), 'utf8'))
check(
  '版本号一致（package.json 与客户端常量）',
  pkgJson.version === String(clientSource.match(/WORKBENCH_VERSION = '([^']+)'/)?.[1] ?? '') && /^\d+\.\d+\.\d+$/.test(pkgJson.version),
  { pkg: pkgJson.version, client: clientSource.match(/WORKBENCH_VERSION = '([^']+)'/)?.[1] },
)

/* --------------------------- 客户端真的能加载：桩 React 直接执行组件函数体 */

console.log('\n[6b] 客户端加载与组件函数体（无浏览器，用桩 React 跑一遍）')
const stubReact = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat().filter((child) => child !== null && child !== undefined && child !== false) }),
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useRef: (initial) => ({ current: initial }),
}
// 组件用的是工厂里解构出来的同一个 useState 函数，所以状态要按「调用序号」注入，就得读外部可变变量。
let injectedStates = null
let stateCursor = 0
stubReact.useState = (initial) => {
  const position = stateCursor++
  if (injectedStates && position in injectedStates) return [injectedStates[position], () => {}]
  return [typeof initial === 'function' ? initial() : initial, () => {}]
}
let clientModule = null
globalThis.window = { __ModuleLoader__: { load: (definition) => { clientModule = definition.factory((name) => (name === 'react' ? stubReact : undefined)) } } }
new Function('window', clientSource)(globalThis.window)
check('客户端能加载并向宿主注册', Boolean(clientModule?.apply) && Array.isArray(clientModule?.inject) && clientModule.inject.includes('desktopWorkbenches'))

const pure = clientModule?.__pure ?? {}
const components = clientModule?.__components ?? {}
const sampleItem = {
  id: 'rec1',
  title: '技能标签支持 Excel 批量导入',
  code: 'PR-1',
  status: '待开发',
  owner: '陈辉',
  priority: 'P0',
  type: '新功能',
  rawRequirement: '优化导入性能',
  fields: { 状态: '待开发', 需求标题: '技能标签支持 Excel 批量导入', 原始需求: '优化导入性能', 优先级: 'P0' },
  fieldNames: ['状态', '需求标题', '原始需求', '优先级'],
}
const sampleTable = { key: 'requirement:demo-project', label: '开发需求 · demo-project', tableName: '需求池', kind: 'requirement', configPath: 'D:\\workspace\\demo-project\\.requirement-sources.json', fieldMap: null }
const sampleView = pure.sliceForTable ? pure.sliceForTable({ modules: [], tables: {} }, sampleTable.key) : {}
const sampleSchema = [
  { name: '状态', options: ['待开发', '已完成'] },
  { name: '需求标题' },
  { name: '原始需求' },
]

const renderComponent = (name, props, label) => {
  const component = components[name]
  const title = label ?? name
  if (typeof component !== 'function') {
    check(`组件可渲染：${title}`, false, '组件未导出')
    return null
  }
  try {
    const out = component(props)
    check(`组件可渲染：${title}`, Boolean(out && out.type), out?.type)
    return out
  } catch (error) {
    check(`组件可渲染：${title}`, false, error.message)
    return null
  }
}

const tableNode = renderComponent('TableModule', {
  state: { configured: true, settings: { projectDir: 'D:\\workspace\\demo-project' }, larkCli: 'lark-cli.cmd' },
  reloadState: () => {},
  uiWorkspace: {},
  table: sampleTable,
  view: sampleView,
  saveView: () => {},
  runs: [{ id: 'run1', at: '2026-10-22T10:00:00.000Z', title: 'T', status: 'done', tableKey: sampleTable.key, recordId: 'rec1' }],
  handOff: () => {},
  onUpdateRun: () => {},
})
renderComponent('OverviewModule', {
  overview: {
    tables: [
      {
        key: sampleTable.key,
        label: sampleTable.label,
        tableName: '需求池',
        total: 3,
        progress: { field: '状态', total: 3, done: 1, active: 1, todo: 1, percent: 33, buckets: [{ value: '待开发', count: 2 }, { value: '已完成', count: 1 }] },
        sample: [{ id: 'rec1', title: sampleItem.title, status: '待开发', owner: '陈辉' }],
      },
      { key: 'task:x', label: '开发任务 · x', kind: 'task', error: '读取飞书多维表格失败', detail: 'boom' },
    ],
  },
  loading: false,
  runs: [{ id: 'run1', at: '2026-10-22T10:00:00.000Z', title: sampleItem.title, status: 'handed-off', tableKey: sampleTable.key, projectDir: 'D:\\workspace\\demo-project', note: '已复制开发指令' }],
  onRefresh: () => {},
  onOpenTable: () => {},
  onUpdateRun: () => {},
  onAddModule: () => {},
  projectDir: 'D:\\workspace\\demo-project',
})
renderComponent('ModuleDialog', {
  tables: [sampleTable],
  modules: [{ key: 'k1', tableKey: sampleTable.key, title: '开发需求（进度）', view: 'progress' }],
  onAdd: () => {},
  onRemove: () => {},
  onClose: () => {},
})
renderComponent('DetailView', {
  item: sampleItem,
  settings: { projectDir: 'D:\\p' },
  runs: [{ id: 'run1', at: '2026-10-22T10:00:00.000Z', title: 'T', status: 'done' }],
  instruction: '',
  copyInstruction: () => {},
  writeBack: () => {},
  chooseDirectory: () => {},
  onUpdateRun: () => {},
  onClose: () => {},
})
renderComponent('ViewConfigPanel', {
  schema: sampleSchema,
  optionFields: [sampleSchema[0]],
  textFields: [sampleSchema[1], sampleSchema[2]],
  view: sampleView,
  modules: [],
  onSave: () => {},
  onClose: () => {},
})
renderComponent('BusinessPanel', { service: {}, entry: {} })
/* --------- 让数据/视图分支也真的跑一遍（按 useState 调用序号注入状态） */

const withInjectedState = (overrides, run) => {
  injectedStates = overrides
  stateCursor = 0
  try {
    return run()
  } finally {
    injectedStates = null
    stateCursor = 0
  }
}

/** 把渲染树里的文字全抓出来，方便断言。 */
const collectText = (node, out = []) => {
  if (node === null || node === undefined || node === false || node === true) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  for (const child of node.children ?? []) collectText(child, out)
  return out
}

const collectByType = (node, type, out = []) => {
  if (!node || typeof node !== 'object') return out
  if (node.type === type) out.push(node)
  for (const child of node.children ?? []) collectByType(child, type, out)
  return out
}

const secondItem = { ...sampleItem, id: 'rec2', title: '薪资标准对比导出', status: '已完成', fields: { ...sampleItem.fields, 状态: '已完成', 需求标题: '薪资标准对比导出' } }
const tableData = { configured: true, items: [sampleItem, secondItem], count: 2, source: { label: '开发需求 · demo-project', tableName: '需求池', configPath: 'x' } }
const schemaResult = { configured: true, fields: sampleSchema }
const tableProps = {
  state: { configured: true, settings: { projectDir: 'D:\\workspace\\demo-project' }, larkCli: 'lark-cli.cmd' },
  reloadState: () => {},
  uiWorkspace: {},
  table: sampleTable,
  view: { ...sampleView, groupField: '状态' },
  saveView: () => {},
  runs: [{ id: 'run1', at: '2026-10-22T10:00:00.000Z', title: sampleItem.title, status: 'handed-off', recordId: 'rec1', tableKey: sampleTable.key }],
  handOff: () => {},
  onUpdateRun: () => {},
}

const listNode = withInjectedState({ 0: tableData, 1: schemaResult, 8: 'list' }, () => renderComponent('TableModule', tableProps, 'TableModule（有数据·汇总清单）'))
const listText = collectText(listNode).join(' ')
check('汇总清单渲染出数据行与表头', listText.includes('技能标签支持 Excel 批量导入') && listText.includes('薪资标准对比导出') && listText.includes('需求标题') && collectByType(listNode, 'table').length === 1, listText.slice(0, 120))

const boardNode = withInjectedState({ 0: tableData, 1: schemaResult, 8: 'board' }, () => renderComponent('TableModule', tableProps, 'TableModule（有数据·卡片看板）'))
const boardText = collectText(boardNode).join(' ')
check('卡片看板按状态分了模块并列出卡片', boardText.includes('待开发') && boardText.includes('已完成') && collectByType(boardNode, 'article').length === 2, boardText.slice(0, 120))

/* 卡片角标：有执行记录的卡片显示状态角标，卡片固定长宽 + 超出省略 */

const byClass = (node, className) => collectByType(node, 'span').filter((entry) => String(entry.props?.className ?? '').includes(className))
const boardBadges = byClass(boardNode, 'rdw-kcard-badge')
check('卡片带执行记录角标（已交付）', boardBadges.length === 1 && boardBadges[0].props.className.includes('tone-handed') && collectText(boardBadges[0]).join('').includes('已交付'), boardBadges.map((entry) => entry.props.className))
check('卡片固定长宽 + 配置字段一行一个', (() => {
  const card = collectByType(boardNode, 'article')[0]
  return (
    Boolean(card) &&
    clientSource.includes('.rdw-kcard{position:relative;') &&
    clientSource.includes('height:152px;width:216px') &&
    clientSource.includes('-webkit-line-clamp:2') &&
    clientSource.includes('.rdw-card-field-value{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}') &&
    collectByType(card, 'div').filter((entry) => String(entry.props?.className ?? '') === 'rdw-card-field').length > 0
  )
})())
check('执行记录角标口径：最新状态 + 次数', (() => {
  const runs = [
    { recordId: 'rec1', at: 100, status: 'handed-off' },
    { recordId: 'rec1', at: 300, status: 'in-progress' },
    { recordId: 'rec1', at: 200, status: 'done' },
  ]
  const badge = pure.runBadge({ id: 'rec1', title: '技能标签支持 Excel 批量导入' }, runs)
  const none = pure.runBadge({ id: 'recX', title: '别的需求' }, runs)
  const byTitle = pure.runBadge({ title: '技能标签支持 Excel 批量导入' }, [{ title: '技能标签支持 Excel 批量导入', status: 'blocked' }])
  return badge.status === 'in-progress' && badge.label === '进行中' && badge.tone === 'active' && badge.count === 3 && none === null && byTitle.status === 'blocked'
})(), pure.runBadge({ id: 'rec1', title: '技能标签支持 Excel 批量导入' }, tableProps.runs))

const progressNode = withInjectedState({ 0: tableData, 1: schemaResult, 8: 'progress' }, () => renderComponent('TableModule', tableProps, 'TableModule（有数据·进度）'))
const progressText = collectText(progressNode).join(' ')
check('进度视图给出百分比与分桶', progressText.includes('50%') && progressText.includes('已完成') && collectByType(progressNode, 'i').length >= 3, progressText.slice(0, 140))

const detailNode = withInjectedState({ 0: tableData, 1: schemaResult, 5: 'rec1' }, () => renderComponent('TableModule', tableProps, 'TableModule（选中一条·详情）'))
check('选中一条会渲染详情组件', collectByType(detailNode, components.DetailView).length === 1 && collectByType(detailNode, components.DetailView)[0].props.item.id === 'rec1')
check('详情不再是弹窗（没有遮罩、没有 role=dialog），改成右侧分栏', (() => {
  const masks = collectByType(detailNode, 'div').filter((entry) => String(entry.props?.className ?? '') === 'rdw-mask')
  const modals = collectByType(detailNode, 'div').filter((entry) => String(entry.props?.className ?? '') === 'rdw-modal')
  return masks.length === 0 && modals.length === 0
})())
const detailPane = collectByType(detailNode, 'div').find((entry) => String(entry.props?.className ?? '').includes('rdw-col-detail'))
check('详情挂在右侧分栏上，宽度落在样式变量里（默认 420px）', String(detailPane?.props?.style?.['--rdw-detail-w'] ?? '') === '420px', detailPane?.props?.style)
check('详情栏顶部保留执行记录角标（已交付）', collectText(detailPane ?? detailNode).join(' ').includes('已交付'))
const detailCollapse = collectByType(detailPane ?? detailNode, 'button').find((entry) => collectText(entry).join('') === '收起')
check('详情栏可单独收起（「收起」按钮，选中的记录不丢，点一下只收这一栏）', Boolean(detailCollapse) && typeof detailCollapse.props?.onClick === 'function', detailCollapse?.props?.title)
check('详情栏另有「关闭」= 取消选中（和「收起」区分开，不会误清选中）', collectByType(detailPane ?? detailNode, 'button').some((entry) => collectText(entry).join('') === '关闭'))
const paneResizer = collectByType(detailNode, 'div').find((entry) => String(entry.props?.className ?? '').includes('rdw-pane-resizer'))
check(
  '详情栏可拖拽调宽（分隔条 role=separator + 鼠标拖 / 双击复位 / 方向键三套交互）',
  Boolean(paneResizer) &&
    paneResizer.props?.role === 'separator' &&
    paneResizer.props?.['aria-orientation'] === 'vertical' &&
    typeof paneResizer.props?.onMouseDown === 'function' &&
    typeof paneResizer.props?.onDoubleClick === 'function' &&
    typeof paneResizer.props?.onKeyDown === 'function',
  paneResizer?.props?.className,
)
check(
  '纯函数：详情栏宽度夹在 300~760（默认 420；容器没量到时按 980 兜底）',
  pure.clampDetailWidth?.(0) === 420 && pure.clampDetailWidth?.(100) === 300 && pure.clampDetailWidth?.(9999) === 760 && pure.clampDetailWidth?.(520.5) === 521,
  [pure.clampDetailWidth?.(0), pure.clampDetailWidth?.(100), pure.clampDetailWidth?.(9999), pure.clampDetailWidth?.(520.5)],
)
check(
  '纯函数：ISO 时间串展示成 yyyy-MM-dd HH:mm:ss（不再露出 T 与 +08:00）',
  pure.formatCellValue?.('2026-10-10T13:05:09') === '2026-10-10 13:05:09' &&
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(pure.formatCellValue?.('2026-10-10T00:00:00.000+08:00'))) &&
    !String(pure.formatCellValue?.('2026-10-10T00:00:00.000+08:00')).includes('T') &&
    pure.formatCellValue?.('PR-20261008-0001') === 'PR-20261008-0001' &&
    pure.formatCellValue?.('2026-10-10') === '2026-10-10' &&
    pure.formatCellValue?.('') === '' &&
    pure.formatCellValue?.(null) === '',
  [pure.formatCellValue?.('2026-10-10T13:05:09'), pure.formatCellValue?.('2026-10-10T00:00:00.000+08:00'), pure.formatCellValue?.('PR-20261008-0001')],
)
check(
  '纯函数：并排时按内容区自适应夹宽（列表最少留 120~220、详情最少占 45%）',
  pure.clampDetailWidth?.(9999, 900) === 680 &&
    pure.clampDetailWidth?.(420, 900) === 420 &&
    pure.clampDetailWidth?.(9999, 1400) === 760 &&
    pure.clampDetailWidth?.(420, 720) === 420,
  [pure.clampDetailWidth?.(9999, 900), pure.clampDetailWidth?.(420, 900), pure.clampDetailWidth?.(9999, 1400), pure.clampDetailWidth?.(420, 720)],
)
// 这条是用户报的那个 bug：内容区 520~560 时旧的夹法把宽度钉死，拖了没反应
check(
  '纯函数：内容区只有 540 / 520 / 460 时也拖得动（可调范围 ≥ 120px，不再钉死在最小值）',
  pure.clampDetailWidth?.(9999, 540) - pure.clampDetailWidth?.(1, 540) >= 150 &&
    pure.clampDetailWidth?.(9999, 520) - pure.clampDetailWidth?.(1, 520) >= 120 &&
    pure.clampDetailWidth?.(9999, 460) - pure.clampDetailWidth?.(1, 460) >= 100,
  [pure.clampDetailWidth?.(1, 540), pure.clampDetailWidth?.(9999, 540), pure.clampDetailWidth?.(1, 520), pure.clampDetailWidth?.(9999, 520), pure.clampDetailWidth?.(1, 460), pure.clampDetailWidth?.(9999, 460)],
)
check(
  '纯函数：上下排时的高度也留出可调范围（600 高 → 140~400，不再钉死）',
  pure.clampDetailHeight?.(0) === 280 &&
    pure.clampDetailHeight?.(100) === 140 &&
    pure.clampDetailHeight?.(9999) === 720 &&
    pure.clampDetailHeight?.(9999, 600) === 400 &&
    pure.clampDetailHeight?.(9999, 600) - pure.clampDetailHeight?.(1, 600) >= 120,
  [pure.clampDetailHeight?.(0), pure.clampDetailHeight?.(100), pure.clampDetailHeight?.(9999, 600), pure.clampDetailHeight?.(1, 600)],
)
check(
  '不再按宽度自动占满（自动占满会把拖拽条一起藏掉，这正是「拖不动」的原因之一）',
  typeof pure.isDetailFull === 'undefined' && clientSource.includes("${detailFull ? ' is-detail-full' : ''}"),
  typeof pure.isDetailFull,
)
check(
  '窄窗口不再自动上下排（自动上下排 = 详情占满整宽，宽度根本没法调）—— 改成显式 is-stacked',
  !clientSource.includes('.rdw-narrow .rdw-split{flex-direction:column}') &&
    !clientSource.includes('.rdw-narrow .rdw-col-detail.is-sized') &&
    !clientSource.includes('.rdw-narrow .rdw-col-list{flex:0 0 auto') &&
    clientSource.includes('.rdw-split.is-stacked{flex-direction:column}') &&
    clientSource.includes("${detailStacked ? ' is-stacked' : ''}"),
)
check(
  '无详情时汇总清单列表默认伸展占满内容区',
  clientSource.includes('.rdw-col-list{flex:1 1 auto;min-width:0;') && clientSource.includes('.rdw-split.has-detail .rdw-col-list{flex:1 1 auto}'),
)
check(
  '样式：竖杠常显细线 + 收起后列表整宽 + 上下排时换成横杠（拖高度）+ 占满时列表让位',
  [
    '.rdw-pane-resizer{flex:0 0 16px',
    '.rdw-pane-resizer::after{content:\'\';position:absolute;inset:0 6px',
    '.rdw-split.has-detail .rdw-col-detail.is-sized{max-width:calc(100% - 120px)}',
    '.rdw-pane-resizer-v{display:none;flex:0 0 10px',
    '.rdw-split.is-stacked .rdw-pane-resizer{display:none}',
    '.rdw-split.is-stacked .rdw-pane-resizer-v{display:block}',
    '.rdw-split.is-stacked .rdw-col-detail.is-sized{flex:0 0 var(--rdw-detail-h,280px)',
    '.rdw-split.is-detail-collapsed .rdw-col-list{flex:1 1 100%}',
    '.rdw-split.is-detail-full .rdw-col-list{display:none}',
    '.rdw-col-detail.is-sized{flex:0 0 var(--rdw-detail-w,420px)',
  ].every((rule) => clientSource.includes(rule)),
)

/* --------- 拖拽会话（宽度/高度共用）：按下→移动→松开，纯逻辑自测 --------- */

function fakeEventSource() {
  const handlers = new Map()
  return {
    addEventListener: (type, fn) => handlers.set(`${type}:${fn.name || 'anon'}`, { type, fn }),
    removeEventListener: (type, fn) => handlers.delete(`${type}:${fn.name || 'anon'}`),
    emit: (type, event) => {
      for (const { type: t, fn } of [...handlers.values()]) if (t === type) fn({ type, ...event })
    },
    count: () => handlers.size,
  }
}

const dragApplied = []
const dragCommitted = []
const dragSource = fakeEventSource()
const fakeTarget = { captured: 0, released: 0, setPointerCapture() { this.captured += 1 }, releasePointerCapture() { this.released += 1 } }
const session = pure.createDragSession?.({
  axis: 'x',
  sign: -1,
  startCoord: 300,
  startValue: 200,
  clamp: (value) => pure.clampDetailWidth(value, 400),
  apply: (value) => dragApplied.push(value),
  commit: (value) => dragCommitted.push(value),
  source: dragSource,
  target: fakeTarget,
  pointerId: 7,
})
check(
  '拖拽会话：挂上 window 捕获监听 + 抓住指针（宿主吞事件也能收到）+ 按下即生效',
  dragSource.count() >= 5 && fakeTarget.captured === 1 && dragApplied[0] === 200,
  { listeners: dragSource.count(), captured: fakeTarget.captured, applied: dragApplied },
)
dragSource.emit('mousemove', { clientX: 260 })
check('向左拖 40px → 详情宽 240（方向对、实时生效）', dragApplied[dragApplied.length - 1] === 240, dragApplied)
dragSource.emit('pointermove', { clientX: 100 })
check('往左拖过头撞上限 280（内容区 400 时详情最多 280），不会拖飞', dragApplied[dragApplied.length - 1] === 280, dragApplied)
dragSource.emit('mousemove', { clientX: 500 })
check(
  '拖到算出来正好是 0 时落到最小宽度（0 在配置语义里是「没配过」，直接用会跳到最宽 —— 这就是拖动会跳的根因）',
  dragApplied[dragApplied.length - 1] === pure.clampDetailWidth(1, 400) && pure.clampDetailWidth(1, 400) < pure.clampDetailWidth(99999, 400),
  { applied: dragApplied, min: pure.clampDetailWidth(1, 400), max: pure.clampDetailWidth(99999, 400) },
)
dragSource.emit('mousemove', { clientX: 600 })
check('往右拖过头撞下限 126（列表还要留 120），两头都被夹住', dragApplied[dragApplied.length - 1] === 126, dragApplied)
dragSource.emit('mouseup', {})
check(
  '松手只提交一次 + 释放指针 + 解绑监听（不残留会话）',
  dragCommitted.length === 1 && dragCommitted[0] === 126 && fakeTarget.released === 1 && !session?.isActive() && dragSource.count() === 0,
  { committed: dragCommitted, released: fakeTarget.released, active: session?.isActive(), listeners: dragSource.count() },
)
const before = dragCommitted.length
dragSource.emit('mousemove', { clientX: 50 })
session?.finish()
check('会话结束后再来的事件一律忽略（不会重复提交）', dragCommitted.length === before, dragCommitted)
const dragApplied2 = []
const dragCommitted2 = []
const session2 = pure.createDragSession?.({
  axis: 'y',
  sign: 1,
  startCoord: 100,
  startValue: 280,
  clamp: (value) => pure.clampDetailHeight(value, 800),
  apply: (value) => dragApplied2.push(value),
  commit: (value) => dragCommitted2.push(value),
  source: fakeEventSource(),
  target: fakeTarget,
  pointerId: 9,
})
session2?.move({ type: 'mousemove', clientY: 160 })
session2?.finish()
check('上下排同理：向下拖 60px → 详情高 340 并提交', dragCommitted2[0] === 340, { applied: dragApplied2, committed: dragCommitted2 })

/* --------- 收起详情栏：只收这一栏，选中的记录留着，能一键展开 --------- */

const detailCollapseStates = []
const detailCollapsedProps = { ...tableProps, saveView: (patch) => detailCollapseStates.push(patch) }
const detailCollapsedNode = withInjectedState({ 0: tableData, 1: schemaResult, 5: 'rec1', 19: true }, () => renderComponent('TableModule', { ...detailCollapsedProps, view: { ...(detailCollapsedProps.view ?? {}), detailCollapsed: true } }, 'TableModule（详情已收起）'))
const detailCollapsedText = collectText(detailCollapsedNode).join(' ')
check(
  '收起后：详情栏不再渲染、列表占满、记录仍选中（那一行还是选中态）',
  collectByType(detailCollapsedNode, 'div').every((entry) => !String(entry.props?.className ?? '').includes('rdw-col-detail')) &&
    collectByType(detailCollapsedNode, 'div').some((entry) => String(entry.props?.className ?? '').includes('is-detail-collapsed')) &&
    collectByType(detailCollapsedNode, 'tr').some((entry) => String(entry.props?.className ?? '').includes('is-selected')),
  detailCollapsedText.slice(0, 200),
)
check(
  '收起后页头有「展开详情 · <标题>」一键回来（不用重新点记录）',
  collectByType(detailCollapsedNode, 'button').some((entry) => collectText(entry).join('').includes('展开详情') && String(entry.props?.title ?? '').includes('展开记录详情栏')),
  collectByType(detailCollapsedNode, 'button').map((entry) => collectText(entry).join('')),
)
const detailExpandBtn = collectByType(detailCollapsedNode, 'button').find((entry) => collectText(entry).join('').includes('展开详情'))
detailExpandBtn?.props?.onClick?.()
check('点「展开详情」把收起状态写回本表配置（重启后也记得）', detailCollapseStates.some((patch) => patch.detailCollapsed === false), detailCollapseStates)
check('收起时不渲染分隔条（没有可拖的东西）', collectByType(detailCollapsedNode, 'div').every((entry) => !String(entry.props?.className ?? '').includes('rdw-pane-resizer')))

const detailCollapseSaveStates = []
const detailCollapseNode = withInjectedState({ 0: tableData, 1: schemaResult, 5: 'rec1' }, () => renderComponent('TableModule', { ...tableProps, saveView: (patch) => detailCollapseSaveStates.push(patch) }, 'TableModule（点收起）'))
const detailCollapseBtn = collectByType(detailCollapseNode, 'button').find((entry) => collectText(entry).join('') === '收起')
detailCollapseBtn?.props?.onClick?.()
check('点「收起」把 detailCollapsed=true 写回本表配置，且没有取消选中', detailCollapseSaveStates.some((patch) => patch.detailCollapsed === true), detailCollapseSaveStates)
check('收起是「单独」的：不碰工作台/对话，也没有 leave() 之类的联动', !clientSource.includes("detailCollapsed') && leave") && clientSource.includes('只收起详情栏（选中的记录留着'))

/* --------- 两种拖拽条（并排拖宽度 / 堆叠拖高度）+ 显式「占满」 --------- */

check(
  '并排时同时挂着竖杠和横杠（竖杠拖宽度、横杠拖高度；窄窗口由 CSS 换成横杠）',
  Boolean(paneResizer) &&
    collectByType(detailNode, 'div').find((entry) => String(entry.props?.className ?? '').includes('rdw-pane-resizer-v'))?.props?.['aria-orientation'] === 'horizontal' &&
    collectByType(detailNode, 'div').find((entry) => String(entry.props?.className ?? '').includes('rdw-pane-resizer-v'))?.props?.role === 'separator',
  collectByType(detailNode, 'div').filter((entry) => String(entry.props?.className ?? '').includes('rdw-pane-resizer')).map((entry) => entry.props?.['aria-orientation']),
)
const heightBar = collectByType(detailNode, 'div').find((entry) => String(entry.props?.className ?? '').includes('rdw-pane-resizer-v'))
check(
  '横杠三套交互齐全（拖 / 双击复位 / 上下方向键）且提示里带当前高度',
  typeof heightBar?.props?.onMouseDown === 'function' &&
    typeof heightBar?.props?.onDoubleClick === 'function' &&
    typeof heightBar?.props?.onKeyDown === 'function' &&
    String(heightBar?.props?.title ?? '').includes('528') === false &&
    String(heightBar?.props?.title ?? '').includes('详情高度'),
  heightBar?.props?.title,
)
check(
  '竖杠提示里带「内容区 Npx」——排障时一眼能看出容器有多宽',
  String(paneResizer?.props?.title ?? '').includes('内容区') && /当前 \d+px/.test(String(paneResizer?.props?.title ?? '')),
  paneResizer?.props?.title,
)

const detailFullStates = []
const detailFullNode = withInjectedState({ 0: tableData, 1: schemaResult, 5: 'rec1', 23: true }, () => renderComponent('TableModule', { ...tableProps, saveView: (patch) => detailFullStates.push(patch) }, 'TableModule（详情占满）'))
check(
  '点过「占满」：列表让位、拖拽条不出现（占满时没有宽度可拖），并给回「并排」按钮',
  collectByType(detailFullNode, 'div').some((entry) => String(entry.props?.className ?? '').includes('is-detail-full')) &&
    collectByType(detailFullNode, 'div').every((entry) => !String(entry.props?.className ?? '').includes('rdw-pane-resizer ')) &&
    collectByType(detailFullNode, 'button').some((entry) => collectText(entry).join('') === '并排'),
  collectByType(detailFullNode, 'button').map((entry) => collectText(entry).join('')),
)
collectByType(detailFullNode, 'button').find((entry) => collectText(entry).join('') === '并排')?.props?.onClick?.()
check('点「并排」写回 detailFull=false（回到可拖宽度的左右分栏）', detailFullStates.some((patch) => patch.detailFull === false), detailFullStates)

const detailFullOnStates = []
const detailFullOnNode = withInjectedState({ 0: tableData, 1: schemaResult, 5: 'rec1' }, () => renderComponent('TableModule', { ...tableProps, saveView: (patch) => detailFullOnStates.push(patch) }, 'TableModule（点占满）'))
collectByType(detailFullOnNode, 'button').find((entry) => collectText(entry).join('') === '占满')?.props?.onClick?.()
check('点「占满」写回 detailFull=true（占满变成显式选择，不再按宽度自动触发）', detailFullOnStates.some((patch) => patch.detailFull === true), detailFullOnStates)
check('拖拽条是「宽度/高度」两条独立路径，互不干扰（各有自己的拖动状态与提交键）', clientSource.includes('commit: (value) => saveView({ detailWidth: value })') && clientSource.includes('commit: (value) => saveView({ detailHeight: value })') && clientSource.includes('clampDetailHeight'))

/* --------- 不拖也能改：−/＋ 步进（宿主万一吃掉鼠标事件时的保底） --------- */

const stepStates = []
const stepNode = withInjectedState({ 0: tableData, 1: schemaResult, 5: 'rec1' }, () => renderComponent('TableModule', { ...tableProps, saveView: (patch) => stepStates.push(patch) }, 'TableModule（步进）'))
const widthCtl = collectByType(stepNode, 'span').find((entry) => String(entry.props?.className ?? '').includes('rdw-detail-widthctl'))
const stepBtns = collectByType(widthCtl ?? { children: [] }, 'button')
check(
  '详情栏有「－ / 420px / ＋」步进控件（不依赖拖拽也能改宽度）',
  stepBtns.length === 2 && collectText(widthCtl).join(' ').includes('420px'),
  collectText(widthCtl).join(' '),
)
stepBtns[1]?.props?.onClick?.()
stepBtns[0]?.props?.onClick?.()
check(
  '点 ＋ 写回 460px、点 － 回落 380px（都落进本表配置）',
  stepStates.some((patch) => patch.detailWidth === 460) && stepStates.some((patch) => patch.detailWidth === 380),
  stepStates,
)
check(
  '窄窗口（上下排）隐藏调宽那组、显示「高 Npx」那组（CSS 切换，不靠 JS 猜布局）',
  clientSource.includes('.rdw-detail-heightctl{display:none}') && clientSource.includes('.rdw-split.is-stacked .rdw-detail-widthctl{display:none}') && clientSource.includes('.rdw-split.is-stacked .rdw-detail-heightctl{display:inline-flex}') && collectByType(stepNode, 'span').some((entry) => String(entry.props?.className ?? '').includes('rdw-detail-heightctl')),
  collectByType(stepNode, 'span').filter((entry) => String(entry.props?.className ?? '').includes('ctl')).map((entry) => entry.props?.className),
)
const stackedStates = []
const stackedNode = withInjectedState({ 0: tableData, 1: schemaResult, 5: 'rec1', 24: true }, () => renderComponent('TableModule', { ...tableProps, saveView: (patch) => stackedStates.push(patch) }, 'TableModule（上下排）'))
check(
  '选「上下排」后 split 带 is-stacked（横杠负责高度、竖杠让位），且按钮变成「并排」',
  collectByType(stackedNode, 'div').some((entry) => String(entry.props?.className ?? '').includes('is-stacked')) &&
    collectByType(stackedNode, 'button').some((entry) => collectText(entry).join('') === '并排'),
  collectByType(stackedNode, 'button').map((entry) => collectText(entry).join('')),
)
collectByType(stackedNode, 'button').find((entry) => collectText(entry).join('') === '并排')?.props?.onClick?.()
check('点「并排」写回 detailStacked=false（回到拖宽度的左右分栏）', stackedStates.some((patch) => patch.detailStacked === false), stackedStates)
const unstackStates = []
collectByType(stepNode, 'button').find((entry) => collectText(entry).join('') === '上下排')?.props?.onClick?.()
check('默认就是并排：工具栏给的是「上下排」按钮（点它才切）', collectByType(stepNode, 'button').some((entry) => collectText(entry).join('') === '上下排'))
check(
  '界面自检上报接通（客户端侧）：客户端把详情分栏几何报给 /ui/metrics',
  clientSource.includes('${API}/ui/metrics') && clientSource.includes('reportMetrics({') && clientSource.includes('dragStarts: dragCounts.starts'),
)
check('容器晚出现也能测到宽度（从设置页回到内容区时重建模块）', clientSource.includes("state?.configured ? 'ready' : 'setup'"))

/* --------- 自定义框架（customFrame）：顶栏 / 左导航 / 右侧原生对话 --------- */

const frameProps = { service: {}, entry: {}, active: true, conversation: stubReact.createElement('div', { className: 'host-chat' }, '原生对话占位') }
const frameState = { 1: { configured: true, settings: { projectDir: 'D:\\workspace\\demo-project' } } }
const frameClosed = withInjectedState(frameState, () => renderComponent('BusinessPanel', frameProps, 'BusinessPanel（框架·对话收起）'))
const frameOpen = withInjectedState({ ...frameState, 10: true }, () => renderComponent('BusinessPanel', frameProps, 'BusinessPanel（框架·对话展开）'))
check('照 SEO/GEO 工作台改用自定义框架（customFrame）', clientSource.includes('customFrame: true') && !clientSource.includes("businessSide: 'right'"))
check('框架外壳 = 顶栏 + 左导航 + 内容区', frameClosed?.props?.className === 'rdw-frame' && collectText(frameClosed).join(' ').includes('收起工作台') && collectByType(frameClosed, 'nav').length === 1, frameClosed?.props?.className)
const chatWrapOpen = collectByType(frameOpen, 'div').find((node) => node.props?.['aria-label'] === '原生对话')
const chatWrapClosed = collectByType(frameClosed, 'div').find((node) => node.props?.['aria-label'] === '原生对话')
check('「展开对话」把宿主原生对话挂到右侧', collectText(frameOpen).join(' ').includes('收起对话') && chatWrapOpen?.props?.style?.display === 'flex' && collectText(chatWrapOpen).join(' ').includes('原生对话占位'), chatWrapOpen?.props?.style)
check('「收起对话」时对话区隐藏', chatWrapClosed?.props?.style?.display === 'none' && collectText(frameOpen).join(' ').includes('收起工作台'))

const frameExperts = withInjectedState(
  { ...frameState, 8: 'experts', 11: { experts: [], teams: [] } },
  () => renderComponent('BusinessPanel', frameProps, 'BusinessPanel（切到专家与专家团）'),
)
/* 左导航切到「专家与专家团」：内容区真的换成专家库 */
// 桩 React 不会展开嵌套的函数组件，所以这里断言「内容区挂的是哪个模块组件」
const mainModuleOf = (states) => {
  const node = withInjectedState(states, () => components.BusinessPanel(frameProps))
  const main = collectByType(node, 'div').find((entry) => String(entry.props?.className ?? '') === 'rdw-main')
  const first = (main?.children ?? [])[0]
  return typeof first?.type === 'function' ? first.type.name : null
}
const railWiring = {
  overview: mainModuleOf({ ...frameState }),
  dev: mainModuleOf({ ...frameState, 8: 'dev' }),
  experts: mainModuleOf({ ...frameState, 8: 'experts' }),
  skills: mainModuleOf({ ...frameState, 8: 'skills' }),
}
check(
  '左导航四个入口各就各位（总览 / 项目开发 / 专家与专家团 / 技能与规范）',
  railWiring.overview === 'OverviewModule' && railWiring.dev === 'DevModule' && railWiring.experts === 'ExpertsModule' && railWiring.skills === 'SkillsModule',
  railWiring,
)
const frameExpertsText = collectText(frameExperts).join(' ')
check('左导航里同时有总览 / 项目开发 / 专家与专家团 / 技能与规范', ['总览', '项目开发', '专家与专家团', '技能与规范'].every((label) => frameExpertsText.includes(label)))

/* 侧边栏：可拖拽调宽 + 改模块名字 */

const probeFrame = (states) => withInjectedState(states, () => components.BusinessPanel(frameProps))
const railFrame = probeFrame({ ...frameState, 3: [sampleTable] })
const railNav = collectByType(railFrame, 'nav')[0]
const railResizer = collectByType(railFrame, 'div').find((node) => String(node.props?.className ?? '').includes('rdw-rail-resizer'))
check(
  '侧边栏可拖拽调宽（拖拽条 + 宽度落在样式上，默认 168）',
  Boolean(railNav) && String(railNav.props?.style?.flex ?? '').includes('168px') && railResizer?.props?.role === 'separator',
  { navStyle: railNav?.props?.style, resizer: railResizer?.props?.className },
)
const editButtons = collectByType(railFrame, 'button').filter((node) => String(node.props?.className ?? '').includes('rdw-mod-edit'))
check(
  '每个表模块旁边都有「改模块名称」入口',
  editButtons.length === 1 && String(editButtons[0].props?.title ?? '').includes('改模块名称'),
  editButtons.map((node) => node.props?.title),
)
const renameProbe = (() => {
  for (let index = 11; index <= 30; index += 1) {
    const tried = probeFrame({ ...frameState, 3: [sampleTable], 4: { modules: [{ key: 'm1', tableKey: sampleTable.key, title: '改名测试', view: 'board' }] }, [index]: 'm1' })
    const input = collectByType(tried, 'input').find((node) => String(node.props?.className ?? '') === 'rdw-mod-rename')
    if (input) return { index, input }
  }
  return null
})()
check(
  '改名：点✎后原地变成输入框（回车/失焦保存）',
  Boolean(renameProbe) && String(renameProbe.input.props?.['aria-label'] ?? '').includes('模块名称') && typeof renameProbe.input.props?.onBlur === 'function',
  { index: renameProbe?.index, label: renameProbe?.input?.props?.['aria-label'] },
)
check(
  '纯函数：侧边栏宽度夹在 120~380',
  pure.clampRailWidth?.(0) === 168 && pure.clampRailWidth?.(50) === 120 && pure.clampRailWidth?.(9999) === 380 && pure.clampRailWidth?.(200.6) === 201,
  [pure.clampRailWidth?.(0), pure.clampRailWidth?.(50), pure.clampRailWidth?.(9999), pure.clampRailWidth?.(200.6)],
)

/* ------------------------------------------------ 技能与规范：来源筛选 + 新建技能 */

console.log('\n[6d] 技能与规范：按来源/目录筛选 + 新建 Harness 通用技能 + 项目开发模块')

const sampleSkillsData = {
  roots: [
    { scope: 'harness', convention: '', label: 'DeepSeek Harness · 通用技能', path: 'C:\\h\\skills', exists: true },
    { scope: 'global', convention: '.claude', label: '全局 skill · .claude', path: 'C:\\u\\.claude\\skills', exists: true },
    { scope: 'global', convention: '.codex', label: '全局 skill · .codex', path: 'C:\\u\\.codex\\skills', exists: true },
    { scope: 'project', convention: '.claude', label: '项目 skill · .claude', path: 'D:\\p\\.claude\\skills', exists: true },
    { scope: 'project', convention: '.codex', label: '项目 skill · .codex', path: 'D:\\p\\.codex\\skills', exists: false },
  ],
  items: [
    { kind: 'skill', scope: 'harness', convention: '', group: 'DeepSeek Harness · 通用技能', id: 'h1', name: 'java-code-review', dirName: 'java-code-review', description: '评审 Java 改动', path: 'C:\\h\\skills\\java-code-review\\SKILL.md' },
    { kind: 'skill', scope: 'global', convention: '.claude', group: '全局 skill · .claude', id: 'g1', name: 'coding-standards', dirName: 'coding-standards', description: '编码规范', path: 'C:\\u\\.claude\\skills\\coding-standards\\SKILL.md' },
    { kind: 'skill', scope: 'project', convention: '.claude', group: '项目 skill · .claude', id: 'p1', name: 'feature-dev', dirName: 'feature-dev', description: '需求开发流程', path: 'D:\\p\\.claude\\skills\\feature-dev\\SKILL.md' },
    { kind: 'agent', scope: 'project', convention: '.codex', group: '项目 skill · .codex · 角色/规范', id: 'p2', name: 'java-developer', dirName: 'java-developer', description: 'Java 开发角色', path: 'D:\\p\\.codex\\agents\\java-developer.md' },
  ],
  docs: [{ id: 'doc:03-coding', name: '03-coding', path: 'D:\\p\\doc\\standards\\03-coding.md' }],
  projectDir: 'D:\\workspace\\demo-project',
  harnessSkillDir: 'C:\\Users\\EDY\\AppData\\Roaming\\dsh-desktop\\harness\\skills',
  summary: [
    { scope: 'harness', roots: 1, exists: 1, skills: 1, agents: 0 },
    { scope: 'global', roots: 7, exists: 4, skills: 41, agents: 2 },
    { scope: 'project', roots: 7, exists: 2, skills: 1, agents: 1 },
    { scope: 'custom', roots: 0, exists: 0, skills: 0, agents: 0 },
  ],
}
const skillsProps = { state: frameState[1], reloadState: () => {}, uiWorkspace: {} }
const skillsNode = withInjectedState({ 0: sampleSkillsData }, () => renderComponent('SkillsModule', skillsProps, 'SkillsModule（技能与规范）'))
const skillsText = collectText(skillsNode).join(' ')
check(
  '技能与规范：来源按 DeepSeek Harness / 全局 / 项目 / 自定义分档',
  ['DeepSeek Harness（1）', '全局（43）', '项目（2）', '自定义（0）'].every((label) => skillsText.includes(label)),
  skillsText.slice(0, 200),
)
check(
  '技能与规范：目录约定可筛选（.claude/.codex/…）',
  (() => {
    const select = collectByType(skillsNode, 'select').find((node) => node.props?.['aria-label'] === '按目录约定筛选')
    const values = (select?.children ?? []).map((child) => child.props?.value)
    return values.includes('.claude') && values.includes('.codex') && values.includes('all')
  })(),
)
check(
  '技能与规范：列出每个来源目录是否命中（✓/×）',
  skillsText.includes('✓ DeepSeek Harness · 通用技能') && skillsText.includes('× 项目 skill · .codex'),
  skillsText.slice(0, 160),
)

/* 真筛：把筛选状态注进去，看列表是不是真的只剩那一档 */
const skillsByScope = withInjectedState({ 0: sampleSkillsData, 5: 'project' }, () => renderComponent('SkillsModule', skillsProps, 'SkillsModule（只看项目）'))
const skillsScopeText = collectText(skillsByScope).join(' ')
check(
  '筛「项目」只剩项目技能（Harness/全局的不出现）',
  skillsScopeText.includes('feature-dev') && !skillsScopeText.includes('java-code-review') && !skillsScopeText.includes('coding-standards'),
  skillsScopeText.slice(0, 160),
)
const skillsByConv = withInjectedState({ 0: sampleSkillsData, 6: '.codex' }, () => renderComponent('SkillsModule', skillsProps, 'SkillsModule（只看 .codex）'))
const skillsConvText = collectText(skillsByConv).join(' ')
check('筛目录约定 .codex 只剩 .codex 下的条目', skillsConvText.includes('java-developer') && !skillsConvText.includes('feature-dev'), skillsConvText.slice(0, 160))
const skillsByKind = withInjectedState({ 0: sampleSkillsData, 7: 'agent' }, () => renderComponent('SkillsModule', skillsProps, 'SkillsModule（只看角色）'))
const skillsKindText = collectText(skillsByKind).join(' ')
check('筛「只看角色/规范」只剩 agent 条目', skillsKindText.includes('java-developer') && !skillsKindText.includes('feature-dev'), skillsKindText.slice(0, 160))
const skillsByQuery = withInjectedState({ 0: sampleSkillsData, 8: '编码' }, () => renderComponent('SkillsModule', skillsProps, 'SkillsModule（搜关键词）'))
check('关键词搜索命中描述', collectText(skillsByQuery).join(' ').includes('coding-standards') && !collectText(skillsByQuery).join(' ').includes('feature-dev'))

const skillsCreating = withInjectedState({ 0: sampleSkillsData, 9: true }, () => renderComponent('SkillsModule', skillsProps, 'SkillsModule（新建技能）'))
const creatingText = collectText(skillsCreating).join(' ')
check(
  '新建技能表单默认写 DeepSeek Harness 通用目录',
  creatingText.includes('新建技能') && creatingText.includes('写入 DeepSeek Harness 通用技能目录') && creatingText.includes('C:\\Users\\EDY\\AppData\\Roaming\\dsh-desktop\\harness\\skills'),
  creatingText.slice(0, 220),
)
const creatingInputs = collectByType(skillsCreating, 'input').map((node) => node.props?.['aria-label'])
check(
  '新建技能表单有名称/描述/步骤/注意事项字段',
  ['技能名称', '技能描述'].every((label) => creatingInputs.includes(label)) && collectByType(skillsCreating, 'textarea').length >= 3,
  creatingInputs,
)
const skillsCreatingProject = withInjectedState(
  { 0: sampleSkillsData, 9: true, 10: { name: 'x', description: 'y', whenToUse: '', steps: '', notes: '', scope: 'project' } },
  () => renderComponent('SkillsModule', skillsProps, 'SkillsModule（新建·项目范围）'),
)
check('新建技能可以改成只放当前项目', collectText(skillsCreatingProject).join(' ').includes('写入当前项目的 .claude/skills'))

/* ------------------------------------------------------ 项目开发模块（AI 进度） */

const taskTable = { key: 'task:demo-project', label: '开发任务 · demo-project', tableName: '开发任务表', kind: 'task', configPath: 'D:\\workspace\\demo-project\\.dev-task-sources.json', fieldMap: null }
const devRuns = [
  { id: 'r1', at: '2026-10-22T10:00:00.000Z', title: '实现技能导入', status: 'done', recordId: 't1', tableKey: taskTable.key },
  { id: 'r2', at: '2026-10-22T11:00:00.000Z', title: '导出优化', status: 'in-progress', recordId: 't2', tableKey: taskTable.key },
]
const devData = {
  configured: true,
  table: { key: taskTable.key, fieldMap: { status: '状态' } },
  items: [
    { id: 't1', title: '实现技能导入', code: 'T-1', status: '已完成', owner: '陈辉', fields: { 状态: '已完成', 任务标题: '实现技能导入' } },
    { id: 't2', title: '导出优化', code: 'T-2', status: '开发中', owner: '陈辉', fields: { 状态: '开发中', 任务标题: '导出优化' } },
    { id: 't3', title: '待排期任务', code: 'T-3', status: '待开发', fields: { 状态: '待开发', 任务标题: '待排期任务' } },
  ],
}
const devProps = { state: frameState[1], tables: [sampleTable, taskTable], runs: devRuns, reloadRuns: () => {}, onOpenTable: () => {} }
const devNode = withInjectedState({ 0: devData }, () => renderComponent('DevModule', devProps, 'DevModule（项目开发）'))
const devText = collectText(devNode).join(' ')
check('项目开发模块：任务清单列出每条任务与状态', devText.includes('实现技能导入') && devText.includes('导出优化') && devText.includes('待排期任务') && devText.includes('开发中'), devText.slice(0, 200))
check('项目开发模块：按状态统计任务进度', devText.includes('已完成 1') && devText.includes('开发中 1') && devText.includes('待开发 1') && devText.includes('整体完成度'), devText.slice(0, 200))
check(
  '项目开发模块：合并工作台的 AI 执行记录（已完成/进行中/受阻/未开始）',
  devText.includes('AI 开发进度') && devText.includes('已完成 1') && devText.includes('进行中 1') && devText.includes('受阻 0') && devText.includes('还没交给 AI 1'),
  devText.slice(0, 240),
)
check(
  '角标取「最近一次」是按时间比（ISO 时间戳也要算对，不是数组顺序）',
  pure.runBadge({ id: 't2', title: '导出优化' }, devRuns)?.status === 'done' === false &&
    pure.runBadge({ id: 't2', title: '导出优化' }, devRuns)?.status === 'in-progress' &&
    pure.runBadge({ id: 't2', title: '导出优化' }, [
      { recordId: 't2', title: '导出优化', at: '2026-10-22T11:00:00.000Z', status: 'in-progress' },
      { recordId: 't2', title: '导出优化', at: '2026-10-22T12:00:00.000Z', status: 'blocked' },
    ])?.status === 'blocked',
  pure.runBadge({ id: 't2', title: '导出优化' }, devRuns)?.status,
)
check('项目开发模块：有进度条与刷新入口', collectByType(devNode, 'i').some((node) => String(node.props?.style?.width ?? '').includes('%')) && devText.includes('刷新') && devText.includes('在任务表里看'))
const devNoTable = withInjectedState({ 0: devData }, () => renderComponent('DevModule', { ...devProps, tables: [sampleTable] }, 'DevModule（没有任务表）'))
check('项目开发模块：没认到任务表时给提示而不是空白', collectText(devNoTable).join(' ').includes('还没认到开发任务表'))
const devEmpty = withInjectedState({ 0: { configured: true, table: { fieldMap: { status: '状态' } }, items: [] } }, () => renderComponent('DevModule', devProps, 'DevModule（空任务表）'))
check('项目开发模块：任务表为空时提示怎么开始', collectText(devEmpty).join(' ').includes('开发任务表里还没有记录'))
const devEmptyText = collectText(devEmpty).join(' ')
check(
  '项目开发模块：任务表为空也列出 AI 执行记录（看得见进度）',
  devEmptyText.includes('最近 AI 执行记录（2）') && devEmptyText.includes('实现技能导入') && devEmptyText.includes('已交付') && devEmptyText.includes('进行中'),
  devEmptyText.slice(0, 240),
)
const devNoRuns = withInjectedState({ 0: { configured: true, table: { fieldMap: { status: '状态' } }, items: [] } }, () => renderComponent('DevModule', { ...devProps, runs: [] }, 'DevModule（没执行记录）'))
check('项目开发模块：完全没有执行记录时给引导语', collectText(devNoRuns).join(' ').includes('还没有执行记录'))
check('左侧导航有「项目开发」入口（内置模块）', collectText(railFrame).join(' ').includes('项目开发') && clientSource.includes("{ kind: 'dev', id: 'dev', glyph: '🛠', label: '项目开发' }"))



console.log('\n[6c] 页面纯函数：配置切片 / 模块 / 进度口径')
const mergedSlice = pure.sliceForTable?.(
  { groupField: '需求类型', filters: [{ field: '状态', values: ['待开发'], text: '' }], tables: { [sampleTable.key]: { groupField: '所属项目', listFields: ['需求标题'] } } },
  sampleTable.key,
)
check('单表配置 = 全局兜底 + 该表切片', mergedSlice?.groupField === '所属项目' && mergedSlice.listFields.join(',') === '需求标题' && mergedSlice.filters.length === 1, mergedSlice)
check('没有切片的表用全局默认', pure.sliceForTable?.({ groupField: '需求类型' }, 'task:none')?.groupField === '需求类型')

const defaults = pure.defaultModules?.([sampleTable, { key: 'task:x', label: '开发任务 · x', kind: 'task' }])
check('默认模块 = 每张表一个清单模块', Array.isArray(defaults) && defaults.length === 2 && defaults[0].tableKey === sampleTable.key && defaults[0].view === 'list', defaults)

const buckets = pure.summarizeBuckets?.(
  [
    { fields: { 状态: '待开发' } },
    { fields: { 状态: '待开发' } },
    { fields: { 状态: '已完成' } },
    { fields: { 状态: '开发中' } },
    { fields: {} },
  ],
  '状态',
)
check('进度口径：完成/进行/待办/百分比', buckets?.total === 5 && buckets.done === 1 && buckets.active === 1 && buckets.todo === 3 && buckets.percent === 20, buckets)
check('未填写的值单独成桶', (buckets?.buckets ?? []).some((bucket) => bucket.value === '（未填写）'))
check('时间格式化', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(pure.formatTime?.('2026-10-22T10:00:00.000Z') ?? ''), pure.formatTime?.('2026-10-22T10:00:00.000Z'))

/* ------------------------- 用真实记录验证清单文本与看板分组（页面同源代码） */

const realItems = !real.json?.error && Array.isArray(real.json?.items) ? real.json.items : []
if (realItems.length && pure.buildModules) {
  const grouped = pure.buildModules(realItems, '状态', (fieldSchema.json?.fields ?? []).map((field) => ({ name: field.name, options: field.options })), { moduleOrder: [], collapsedModules: [], hiddenModules: [] })
  check('看板按「状态」把真实记录分成了模块', grouped.length > 0 && grouped.every((module) => Array.isArray(module.items)), grouped.map((module) => `${module.key}:${module.items.length}`))
}

if (!real.json?.error && real.json?.items?.length) {
  const items = real.json.items
  const options = (fieldSchema.json?.fields ?? []).find((field) => field.name === '状态')?.options ?? []
  const withStatus = items.filter((item) => item.fields?.['状态'])
  const inOptions = withStatus.filter((item) => options.includes(item.fields['状态'])).length
  check('筛选用到的「状态」选项值与真实数据对得上', options.length > 0 && inOptions === withStatus.length, { options, inOptions, withStatus: withStatus.length, total: items.length })
}

/* --------------------------------- 专家与专家团 + 分组收缩展开（客户端） */

console.log('\n[6e] 专家与专家团 + 技能分组收缩展开')

const sampleExpertData = {
  experts: [
    { kind: 'agent', scope: 'harness', convention: '', agentId: 'java-backend-expert', name: 'java-backend-expert', displayName: '老陈', profession: 'Java 后端开发专家', description: '负责后端需求理解与实现', path: 'C:\\h\\agents\\java-backend-expert.md' },
    { kind: 'agent', scope: 'project', convention: '.claude', agentId: 'requirement-analyst', name: 'requirement-analyst', displayName: '小析', profession: '需求分析师', description: '把模糊需求讲清楚', path: 'D:\\p\\.claude\\agents\\requirement-analyst.md' },
  ],
  teams: [{ kind: 'team', scope: 'harness', id: 'hr-delivery-team', name: 'HR 交付专家团', profession: '一条龙交付', description: '团长带人接力', lead: 'java-backend-expert', members: ['java-backend-expert', 'requirement-analyst'], flow: ['团长拆需求', '后端实现', '团长验收'], path: 'C:\\h\\experts\\teams.json' }],
  summary: { harness: 1, global: 0, project: 1, custom: 0 },
  selected: '',
  targets: { harness: { dir: 'C:\\h\\agents', label: '通用' }, project: { dir: 'D:\\p\\.claude\\agents', label: '项目' } },
  projectDir: 'D:\\workspace\\demo-project',
}

/* 技能来源分组：可收缩/展开 */
const skillsGroupHead = collectByType(skillsNode, 'button').find((node) => String(node.props?.className ?? '').includes('rdw-group'))
check(
  '技能来源分组标题可点（带 ▾ 与条数，aria-expanded 正确）',
  Boolean(skillsGroupHead) && skillsGroupHead.props['aria-expanded'] === 'true' && collectText(skillsGroupHead).join(' ').includes('▾'),
  { cls: skillsGroupHead?.props?.className, text: collectText(skillsGroupHead ?? { children: [] }).join(' ') },
)
check('存在「全部收起/全部展开」入口', skillsText.includes('全部收起') || skillsText.includes('全部展开'))
const collapsedNode = withInjectedState({ 0: sampleSkillsData, 12: ['项目 skill · .claude'] }, () => renderComponent('SkillsModule', skillsProps, 'SkillsModule（收起一组）'))
const collapsedText = collectText(collapsedNode).join(' ')
check(
  '收起某一组后，该组条目隐藏，其它组照常显示',
  !collapsedText.includes('feature-dev') && collapsedText.includes('java-code-review') && collapsedText.includes('coding-standards'),
  collapsedText.slice(0, 180),
)
const collapsedHead = collectByType(collapsedNode, 'button')
  .filter((node) => String(node.props?.className ?? '').includes('rdw-group'))
  .find((node) => collectText(node).join(' ').includes('项目 skill · .claude'))
check('收起态：分组标题变 ▸ 且 aria-expanded=false', String(collapsedHead?.props?.['aria-expanded']) === 'false' && collectText(collapsedHead ?? { children: [] }).join(' ').includes('▸'))

/* 专家库 */
const expertProps = { state: frameState[1], reloadState: () => {}, uiWorkspace: {}, expertData: sampleExpertData, reloadExperts: () => {} }
const expertsNode = withInjectedState({ 0: sampleExpertData }, () => renderComponent('ExpertsModule', expertProps, 'ExpertsModule（专家与专家团）'))
const expertsText = collectText(expertsNode).join(' ')
check(
  '专家库：按来源分组列出专家与专家团',
  expertsText.includes('老陈 · Java 后端开发专家') && expertsText.includes('HR 交付专家团') && expertsText.includes('DeepSeek Harness 通用专家') && expertsText.includes('当前项目专家'),
  expertsText.slice(0, 220),
)
check(
  '专家库：每个专家/专家团都能一键选中（给对话用）',
  expertsText.includes('不用专家（普通交付）') && expertsText.includes('专家 · 老陈') && expertsText.includes('专家团 · HR 交付专家团'),
)
const expertsPicked = withInjectedState({ 0: sampleExpertData }, () =>
  renderComponent('ExpertsModule', { ...expertProps, state: { configured: true, settings: { projectDir: 'D:\\p', expert: 'team:hr-delivery-team' } } }, 'ExpertsModule（选中专家团）'),
)
check('专家库：已选中的角色会高亮显示', collectText(expertsPicked).join(' ').includes('当前交付用哪个角色'))
const expertForm = withInjectedState({ 0: sampleExpertData, 5: 'expert' }, () => renderComponent('ExpertsModule', expertProps, 'ExpertsModule（新建专家）'))
const expertFormInputs = collectByType(expertForm, 'input').map((node) => node.props?.['aria-label'])
const expertFormTextareas = collectByType(expertForm, 'textarea').map((node) => node.props?.['aria-label'])
check(
  '新建专家表单：标识/显示名/定位/描述 + 能力/流程/输出/红线都在',
  ['专家标识', '专家显示名', '专家定位', '专家描述'].every((label) => expertFormInputs.includes(label)) &&
    ['核心能力', '工作流程', '输出规范', '专家注意事项'].every((label) => expertFormTextareas.includes(label)),
  { inputs: expertFormInputs, textareas: expertFormTextareas },
)
check('新建专家表单会说明落到哪个目录', collectText(expertForm).join(' ').includes('C:\\h\\agents'))
const teamForm = withInjectedState({ 0: sampleExpertData, 5: 'team' }, () => renderComponent('ExpertsModule', expertProps, 'ExpertsModule（新建专家团）'))
const teamText = collectText(teamForm).join(' ')
check(
  '新建专家团表单：能点选成员、指定团长、写协作流程',
  teamText.includes('选成员') && teamText.includes('团长') && teamText.includes('协作流程') && teamText.includes('老陈（Java 后端开发专家）'),
  teamText.slice(0, 200),
)
const expertsEmpty = withInjectedState({ 0: { experts: [], teams: [] } }, () => renderComponent('ExpertsModule', { ...expertProps, expertData: null }, 'ExpertsModule（没有专家）'))
check('没有专家时给引导语', collectText(expertsEmpty).join(' ').includes('还没有专家'))
check('左侧导航有「专家与专家团」入口', collectText(railFrame).join(' ').includes('专家与专家团'), collectText(railFrame).join(' ').slice(0, 120))

/* 交付指令里带上选中的专家 / 专家团 */
const pickExpert = pure.resolveExpertPick?.({ expert: 'agent:java-backend-expert' }, sampleExpertData)
const pickTeam = pure.resolveExpertPick?.({ expert: 'team:hr-delivery-team' }, sampleExpertData)
check(
  '选中的专家解析成角色信息（含角色定义文件路径）',
  pickExpert?.displayName === '老陈' && pickExpert?.profession === 'Java 后端开发专家' && pickExpert?.kind === 'expert' && String(pickExpert?.path).endsWith('java-backend-expert.md'),
  pickExpert,
)
check('选中的专家团带上团长与成员明细', pickTeam?.kind === 'team' && pickTeam?.lead === 'java-backend-expert' && (pickTeam?.memberDetails ?? []).length === 2, { lead: pickTeam?.lead, n: pickTeam?.memberDetails?.length })
check('没选专家时不注入角色信息', pure.resolveExpertPick?.({ expert: '' }, sampleExpertData) === null)
const expertInstruction = pure.buildInstruction?.(sampleItem, { projectDir: 'D:\\p' }, null, pickExpert)
check(
  '开发指令开头写上「以某专家身份」+ 角色定义文件',
  String(expertInstruction).startsWith('/agent-teams\n\n请你以「老陈 · Java 后端开发专家」这个专家的身份来完成下面这条开发需求。') && String(expertInstruction).includes('角色定义文件：C:\\h\\agents\\java-backend-expert.md'),
  String(expertInstruction).slice(0, 150),
)
const plainInstruction = String(pure.buildInstruction?.(sampleItem, { projectDir: 'D:\\p' }, null, null))
check(
  '开发指令默认以 /agent-teams 开头（有无专家都一样）',
  String(expertInstruction).startsWith('/agent-teams\n') && plainInstruction.startsWith('/agent-teams\n\n请在本地项目'),
  plainInstruction.slice(0, 80),
)
const teamInstruction = pure.buildInstruction?.(sampleItem, { projectDir: 'D:\\p' }, null, pickTeam)
check(
  '专家团指令写出分工、团长与协作流程',
  String(teamInstruction).includes('按「HR 交付专家团」这个专家团的分工') && String(teamInstruction).includes('（团长）') && String(teamInstruction).includes('1. 团长拆需求'),
  String(teamInstruction).slice(0, 280),
)
check('不选专家时指令保持原样（不出现角色设定）', !String(pure.buildInstruction?.(sampleItem, { projectDir: 'D:\\p' }, null, null)).includes('这个专家的身份'))

/* ------------------------- 对话输入框里的「＋ 专家」（挂在宿主 slot 上，v3.7.1 新） */

console.log('\n[6f] 对话输入框「＋」那排引入专家')
check(
  '开场白：以专家身份开工 + 带上角色定义文件',
  String(pure.expertOpenerText?.(pickExpert)).startsWith('请以「老陈 · Java 后端开发专家」的身份帮我继续；角色定义：') &&
    String(pure.expertOpenerText?.(pickExpert)).includes('java-backend-expert.md'),
  pure.expertOpenerText?.(pickExpert),
)
check('开场白：专家团按分工接力', String(pure.expertOpenerText?.(pickTeam)).includes('「HR 交付专家团」') && String(pure.expertOpenerText?.(pickTeam)).includes('按分工接手'), pure.expertOpenerText?.(pickTeam))
check('没选角色时开场白为空', pure.expertOpenerText?.(null) === '' && pure.expertOpenerText?.(undefined) === '')
check(
  '详情页的「复制开场白」与输入框入口措辞同源（只有一处实现）',
  clientSource.includes('function expertOpenerText(pick)') && clientSource.includes('const intro = expertOpenerText(expertPick)'),
)

// 宿主桩：fetch（读 /experts、写 /settings）+ inputActions（宿主给 slot 条目的标准 props）+ 剪贴板
const entryFetchCalls = []
const entryInsertCalls = []
const entryClipboard = []
let entryInsertAccepts = true
globalThis.fetch = async (url, options) => {
  entryFetchCalls.push({ url: String(url), body: String(options?.body ?? '') })
  const payload = String(url).includes('/experts') ? sampleExpertData : { ok: true }
  return { ok: true, status: 200, text: async () => JSON.stringify(payload) }
}
// Node 24 自带只读的 globalThis.navigator（只有 userAgent 等），剪贴板要自己定义上去。
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async (text) => { entryClipboard.push(text) } } }, configurable: true, writable: true })
const entryInputActions = {
  captureInsertion: () => ({ span: 'stub-span' }),
  insertText: (text, span) => {
    entryInsertCalls.push({ text, span })
    return entryInsertAccepts
  },
}
const entryClosed = withInjectedState({ 0: false }, () => renderComponent('ExpertComposerEntry', { inputActions: entryInputActions }, '输入框入口（收起）'))
check(
  '收起态就是一个「＋ 专家」小按钮（不占地方）',
  collectText(entryClosed).join(' ').includes('＋ 专家') && collectByType(entryClosed, 'button').length === 1 && collectByType(entryClosed, 'div')[0]?.props?.className === 'rdw-expert-entry',
  collectText(entryClosed).join(' '),
)
const entryOpen = withInjectedState({ 0: true, 1: sampleExpertData }, () => renderComponent('ExpertComposerEntry', { inputActions: entryInputActions }, '输入框入口（展开）'))
const entryOpenText = collectText(entryOpen).join(' ')
check(
  '展开后列出专家与专家团，并有「不用专家」',
  entryOpenText.includes('这轮对话交给谁？') && entryOpenText.includes('老陈 · Java 后端开发专家') && entryOpenText.includes('HR 交付专家团') && entryOpenText.includes('不用专家'),
  entryOpenText.slice(0, 200),
)
const entryOptions = collectByType(entryOpen, 'button').filter((node) => String(node.props?.className ?? '').includes('rdw-expert-option'))
check('专家与专家团都是可点选项', entryOptions.length === 4, entryOptions.map((node) => collectText(node).join(' ')))
const entrySelected = withInjectedState({ 0: true, 1: { ...sampleExpertData, selected: 'agent:java-backend-expert' } }, () =>
  renderComponent('ExpertComposerEntry', { inputActions: entryInputActions }, '输入框入口（已选专家）'),
)
check('已选专家时按钮上显示当前是谁', collectText(entrySelected).join(' ').includes('＋ 专家 · 老陈'), collectText(entrySelected).join(' ').slice(0, 80))

const expertOption = entryOptions.find((node) => collectText(node).join(' ').includes('老陈'))
await expertOption?.props?.onClick?.()
check(
  '点专家：开场白被写进对话输入框（一次可撤销插入）',
  entryInsertCalls.length === 1 && String(entryInsertCalls[0].text).includes('老陈') && entryInsertCalls[0].span?.span === 'stub-span',
  entryInsertCalls,
)
check(
  '点专家：同时记进工作台设置（开发指令也带上这个角色）',
  entryFetchCalls.some((call) => call.url.endsWith('/settings') && call.body.includes('agent:java-backend-expert')),
  entryFetchCalls.map((call) => `${call.url} ${call.body}`),
)

// 编辑器拒绝插入（或宿主没给 inputActions）时，必须退回复制，不能吞掉结果
entryInsertAccepts = false
entryInsertCalls.length = 0
entryClipboard.length = 0
const teamOption = entryOptions.find((node) => collectText(node).join(' ').includes('HR 交付专家团'))
await teamOption?.props?.onClick?.()
check(
  '插入被拒时退回剪贴板（结果不丢）',
  entryClipboard.length === 1 && String(entryClipboard[0]).includes('HR 交付专家团'),
  { insertCalls: entryInsertCalls.length, clipboard: entryClipboard.map((text) => String(text).slice(0, 60)) },
)
entryInsertAccepts = true
const entryNoActions = withInjectedState({ 0: true, 1: sampleExpertData }, () => renderComponent('ExpertComposerEntry', {}, '输入框入口（宿主没给 inputActions）'))
check('宿主没给 inputActions 时照常渲染（入口不崩）', Boolean(entryNoActions?.type))

// 注册：工作台要靠 slots.inject('conversation.input.left') 挂到那排「＋」旁边
const slotRegistrations = []
const slotInjected = []
const fakeSlotsCtx = {
  get: () => undefined,
  effect: (callback) => callback(),
  desktopWorkbenches: { register: () => () => {} },
  slots: {
    inject: (key, callback) => {
      slotInjected.push(key)
      callback()
    },
    register: (meta, render) => {
      slotRegistrations.push({ meta, render })
      return () => {}
    },
  },
}
let applyThrew = false
try {
  clientModule?.apply?.(fakeSlotsCtx)
} catch (error) {
  applyThrew = true
}
check(
  '工作台把自己挂到宿主对话输入框的「＋」那排',
  !applyThrew && slotInjected.includes('conversation.input.left') && slotRegistrations[0]?.meta?.id === 'rdw-expert-entry' && slotRegistrations[0]?.meta?.name === 'conversation.input.left',
  { injected: slotInjected, meta: slotRegistrations[0]?.meta },
)
check(
  '入口排在最左端（对齐 WorkBuddy：order 取小值，不动宿主原生控件）',
  Number(slotRegistrations[0]?.meta?.order) < 40 && typeof slotRegistrations[0]?.meta?.label === 'function',
  slotRegistrations[0]?.meta?.order,
)
const slotEntryElement = slotRegistrations[0]?.render?.({ inputActions: entryInputActions })
check(
  '宿主渲染这个入口时，拿到的是专家入口组件（并带着宿主给的 inputActions）',
  slotEntryElement?.type === components.ExpertComposerEntry && Boolean(slotEntryElement?.props?.inputActions) && slotEntryElement?.props?.inputActions === entryInputActions,
  slotEntryElement?.type?.name ?? slotEntryElement?.type,
)
let degradeThrew = false
try {
  clientModule?.apply?.({ get: () => undefined, effect: (callback) => callback(), desktopWorkbenches: { register: () => () => {} } })
} catch {
  degradeThrew = true
}
check('宿主没有 slots 服务时工作台照常加载（入口静默跳过）', !degradeThrew)


/* ------------------------------------- 多表：需求池 + 开发任务表（新） */

console.log('\n[6g] 创建专家 / 专家团：一句话描述，交给 AI 按专业流程完善并落盘')
const enrichExpert = String(
  pure.expertEnrichmentPrompt?.({
    mode: 'expert',
    description: '一个盯支付对账的后端专家',
    id: 'pay-recon-expert',
    displayName: '老付',
    dir: 'C:\\h\\agents',
  }) ?? '',
)
check(
  '养成指令：用户那句话原样带上，并说明这是唯一输入',
  enrichExpert.includes('一个盯支付对账的后端专家') && enrichExpert.includes('唯一输入') && enrichExpert.includes('pay-recon-expert.md'),
  enrichExpert.slice(0, 200),
)
check(
  '养成指令：给出标准角色定义格式（frontmatter + 四段 + 我的假设）',
  ['description:', 'displayName: 老付', 'profession:', '## 核心能力', '## 工作流程', '## 输出规范', '## 注意事项', '## 我的假设'].every((part) => enrichExpert.includes(part)),
)
check(
  '养成指令：内置 6 步专业流程',
  ['定位与边界', '能力清单', '工作流程', '输出规范', '红线与自检', '触发场景'].every((part) => enrichExpert.includes(part)),
)
check(
  '养成指令：明令不许反问用户（信息不足按专业判断补齐）',
  enrichExpert.includes('不要反问用户') && enrichExpert.includes('不要要求确认') && enrichExpert.includes('专业判断'),
)
check(
  '养成指令：要求直接落盘、只报绝对路径、不顺手改别的文件',
  enrichExpert.includes('直接落盘') && enrichExpert.includes('绝对路径') && enrichExpert.includes('不要顺手改项目里其它文件'),
)
const enrichTeam = String(
  pure.expertEnrichmentPrompt?.({
    mode: 'team',
    description: '要一个从需求到评审一条龙的团队',
    teamFile: 'C:\\h\\experts\\teams.json',
    dir: 'C:\\h\\agents',
    existingExperts: [{ agentId: 'java-developer' }, { agentId: 'java-reviewer' }],
  }) ?? '',
)
check(
  '养成指令（专家团）：写清清单文件与团长/成员/流程字段',
  enrichTeam.includes('C:\\h\\experts\\teams.json') && ['members', 'lead', 'flow', 'createdAt'].every((part) => enrichTeam.includes(part)),
)
check(
  '养成指令（专家团）：已有的专家提示复用，别重复造',
  enrichTeam.includes('java-developer') && enrichTeam.includes('java-reviewer') && enrichTeam.includes('不要重复造'),
)

const sessionSends = []
const stubSession = {
  prompt: async (parts, mode) => {
    sessionSends.push({ parts, mode })
    return { ok: true, value: { accepted: true } }
  },
}
const sentViaBinding = await pure.promptCurrentSession({ binding: (id) => (id === 'sess-1' ? { session: stubSession } : undefined) }, 'sess-1', '指令正文')
check(
  '发得进当前对话：sessions.binding(id).session.prompt(…, queue)',
  sentViaBinding.ok === true && sessionSends.length === 1 && sessionSends[0].mode === 'queue' && sessionSends[0].parts?.[0]?.text === '指令正文',
  { sent: sentViaBinding, calls: sessionSends.length },
)
let sessionReleased = 0
const sentViaRetain = await pure.promptCurrentSession(
  {
    retain: () => ({
      ready: Promise.resolve({ session: stubSession }),
      release: () => {
        sessionReleased += 1
      },
    }),
  },
  'sess-2',
  '指令正文 2',
)
check('binding 拿不到时用 retain，用完释放', sentViaRetain.ok === true && sessionReleased === 1 && sessionSends.length === 2, { sent: sentViaRetain, sessionReleased })
const noService = await pure.promptCurrentSession(undefined, 'sess-1', 'x')
const noSessionId = await pure.promptCurrentSession({ binding: () => ({ session: stubSession }) }, '', 'x')
check(
  '拿不到发送能力 / 还不知道会话时：老实返回失败（外层退回复制）',
  noService.ok === false && Boolean(noService.reason) && noSessionId.ok === false && String(noSessionId.reason).includes('当前对话'),
  { noService, noSessionId },
)
const refused = await pure.promptCurrentSession({ binding: () => ({ session: { prompt: async () => ({ ok: false, error: { message: '会话已归档' } }) } }) }, 'sess-3', 'x')
check('宿主拒绝发送时如实返回原因（不假装成功）', refused.ok === false && String(refused.reason).includes('会话已归档'), refused)

const aiFetch = []
globalThis.fetch = async (url, options) => {
  const target = String(url)
  aiFetch.push({ url: target, body: String(options?.body ?? '') })
  const payload = target.includes('/experts') ? sampleExpertData : target.includes('/composer/session') ? { ok: true, sessionId: 'sess-42', at: 0 } : { ok: true }
  return { ok: true, status: 200, text: async () => JSON.stringify(payload) }
}
const aiExpertData = { ...sampleExpertData, teamFiles: [{ scope: 'harness', path: 'C:\\h\\experts\\teams.json', label: '通用专家团' }] }
const aiProps = {
  state: { settings: {} },
  reloadState: async () => {},
  expertData: aiExpertData,
  reloadExperts: async () => {},
  service: { sessions: { binding: () => ({ session: stubSession }) } },
}
const aiPanel = withInjectedState(
  { 0: aiExpertData, 9: 'expert', 10: { description: '一个盯支付对账的后端专家', id: 'pay-recon-expert', displayName: '老付', scope: 'harness' } },
  () => renderComponent('ExpertsModule', aiProps, '新建专家（交给 AI 完善）'),
)
const aiText = collectText(aiPanel).join(' ')
check(
  '新建专家默认是「一句话描述 + 页面里直接创建」，不再逼你填技术字段',
  aiText.includes('AI 直接创建') && aiText.includes('一句话就够') && !aiText.includes('职业/定位'),
  aiText.slice(0, 240),
)
check(
  '面板写明：页面里就完成、不用去外面复制提示词；AI 也不反问你',
  aiText.includes('不需要去外面复制任何提示词') && aiText.includes('不会反问你') && aiText.includes('我的假设'),
)
check('面板写明落盘位置（通用/项目可切）', aiText.includes('落盘目录') && aiText.includes('C:\\h\\agents'))

// 首选路径：页面里直接创建（工作台自己调模型并落盘）
const aiCreateNowBtn = collectByType(aiPanel, 'button').find((node) => collectText(node).join(' ').includes('AI 直接创建'))
aiFetch.length = 0
sessionSends.length = 0
await aiCreateNowBtn?.props?.onClick?.()
check(
  '点「AI 直接创建」：工作台调 /ai/create（带用户那句话与作用域），不需要对话参与',
  aiFetch.some((item) => item.url.includes('/ai/create') && item.body.includes('一个盯支付对账的后端专家') && item.body.includes('"kind":"expert"')),
  aiFetch.map((item) => `${item.url} ${item.body.slice(0, 60)}`),
)
check('「AI 直接创建」这条路上不会去碰对话（不需要用户复制提示词）', sessionSends.length === 0, sessionSends.length)

// 备选路径按钮仍在，并且走的是「发进当前对话」
const aiCreateBtn = collectByType(aiPanel, 'button').find((node) => collectText(node).join(' ').includes('发到对话里做'))
sessionSends.length = 0
await aiCreateBtn?.props?.onClick?.()
check(
  '点「发到对话里做」：养成指令真被发进当前对话（agent 模式开跑）',
  sessionSends.length === 1 &&
    String(sessionSends[0].parts?.[0]?.text).includes('一个盯支付对账的后端专家') &&
    String(sessionSends[0].parts?.[0]?.text).includes('pay-recon-expert.md') &&
    sessionSends[0].mode === 'queue',
  { sends: sessionSends.length, mode: sessionSends[0]?.mode },
)
check('发送前先问工作台「当前是哪个对话」', aiFetch.some((item) => item.url.includes('/composer/session')), aiFetch.map((item) => item.url))

// 结果卡：创建成功后当页显示名字、路径、成员，并能直接「选它开工」
const aiDonePanel = withInjectedState(
  {
    0: aiExpertData,
    9: 'team',
    10: { description: '要一个一条龙交付的团队', scope: 'harness' },
    14: { ok: true, kind: 'team', id: 'one-stop-team', name: '全栈交付一条龙专家团', path: 'C:\\h\\experts\\teams.json', members: ['a', 'b', 'c', 'd'], created: [{}, {}, {}, {}, {}], model: 'deepseek/deepseek-v4.1-flash', assumptions: ['假设是 Java 栈'] },
  },
  () => renderComponent('ExpertsModule', aiProps, '新建专家团（已创建）'),
)
const aiDoneText = collectText(aiDonePanel).join(' ')
check(
  '创建完成后当页就给结果：名字、落盘路径、成员、模型、假设',
  aiDoneText.includes('✓ 专家团已创建：全栈交付一条龙专家团') &&
    aiDoneText.includes('C:\\h\\experts\\teams.json') &&
    aiDoneText.includes('成员 4 位') &&
    aiDoneText.includes('deepseek/deepseek-v4.1-flash') &&
    aiDoneText.includes('假设是 Java 栈'),
  aiDoneText.slice(0, 260),
)
check('结果卡上有「选它开工」，不用再去别的页面选', collectByType(aiDonePanel, 'button').some((node) => collectText(node).join(' ').includes('选它开工')))
const aiTeamPanel = withInjectedState({ 0: aiExpertData, 9: 'team', 10: { description: '要一个一条龙交付的团队', scope: 'harness' } }, () =>
  renderComponent('ExpertsModule', aiProps, '新建专家团（交给 AI 完善）'),
)
const aiTeamText = collectText(aiTeamPanel).join(' ')
check(
  '专家团走同一条路：一句话 + 交给 AI 完善，并写清清单文件位置',
  aiTeamText.includes('新建专家团 · 交给 AI 完善') && aiTeamText.includes('一句话就够') && aiTeamText.includes('C:\\h\\experts\\teams.json'),
  aiTeamText.slice(0, 240),
)

entryClipboard.length = 0
const aiPanelNoService = withInjectedState({ 0: aiExpertData, 9: 'expert', 10: { description: '一个盯支付对账的后端专家', scope: 'harness' } }, () =>
  renderComponent('ExpertsModule', { state: { settings: {} }, expertData: aiExpertData, service: {} }, '新建专家（宿主没给会话服务）'),
)
const aiCreateBtnNoService = collectByType(aiPanelNoService, 'button').find((node) => collectText(node).join(' ').includes('发到对话里做'))
await aiCreateBtnNoService?.props?.onClick?.()
check(
  '发不出去（宿主没给会话服务）时复制养成指令兜底，结果不丢',
  entryClipboard.length === 1 && String(entryClipboard[0]).includes('一个盯支付对账的后端专家'),
  entryClipboard.map((text) => String(text).slice(0, 60)),
)

aiFetch.length = 0
const entryWithSession = withInjectedState({ 0: false }, () => renderComponent('ExpertComposerEntry', { inputActions: entryInputActions, sessionId: 'sess-9' }, '输入框入口（带会话）'))
await collectByType(entryWithSession, 'button')[0]?.props?.onClick?.()
check(
  '输入框入口把自己在哪个会话上报给工作台（否则不知道往哪发）',
  aiFetch.some((item) => item.url.includes('/composer/session') && item.body.includes('sess-9')),
  aiFetch.map((item) => `${item.url} ${item.body}`),
)

const sessionEmpty = await call('GET', '/composer/session')
const sessionSet = await call('POST', '/composer/session', { sessionId: 'sess-from-entry' })
const sessionRead = await call('GET', '/composer/session')
check(
  '/composer/session 能记住并取回「当前对话」',
  sessionEmpty.status === 200 && sessionSet.status === 200 && sessionRead.json?.sessionId === 'sess-from-entry',
  { empty: sessionEmpty.json, set: sessionSet.json, read: sessionRead.json },
)
const expertsWithTeamFiles = await call('GET', '/experts')
check(
  '/experts 带出专家团清单文件的绝对路径（AI 要知道写到哪）',
  expertsWithTeamFiles.status === 200 && Array.isArray(expertsWithTeamFiles.json?.teamFiles) && expertsWithTeamFiles.json.teamFiles.every((file) => typeof file.path === 'string' && file.path),
  expertsWithTeamFiles.json?.teamFiles,
)

console.log('\n[6h] 页面里「AI 直接创建」：工作台自己调模型并落盘（不经过对话）')
check(
  '模型把 JSON 包在代码围栏里也能解析',
  parseJsonLoose('```json\n{"id":"pay-expert","abilities":["a"]}\n```')?.id === 'pay-expert',
  parseJsonLoose('```json\n{"id":"pay-expert"}\n```'),
)
check(
  '模型在 JSON 前后加了解释文字也能解析（截取最外层大括号）',
  parseJsonLoose('好的，这是结果：\n{"id":"x","flow":["1","2"]}\n希望有帮助')?.flow?.length === 2,
  parseJsonLoose('好的，这是结果：{"id":"x"}'),
)
check('解析不出 JSON 时老实返回 null（不假装成功）', parseJsonLoose('抱歉，我没法完成') === null && parseJsonLoose('') === null && parseJsonLoose('[1,2]') === null)

// 专家：模型返回草稿 → 工作台按标准格式落盘
llmReplyText = JSON.stringify({
  id: 'recon-expert',
  displayName: '老付',
  profession: '支付对账专家',
  description: '盯支付对账，负责差异排查与批量修复',
  abilities: ['对账差异定位', '批量修复脚本'],
  flow: ['读对账规则', '拉差异明细', '出修复方案'],
  outputs: ['差异清单', '修复脚本与验证结果'],
  cautions: ['不擅自改对账规则'],
  assumptions: ['假设使用 MySQL'],
})
llmCalls.length = 0
const aiExpert = await call('POST', '/ai/create', { kind: 'expert', description: '一个盯支付对账的后端专家', scope: 'project' })
check(
  '/ai/create（专家）：页面里直接建成文件，返回路径与名字',
  aiExpert.status === 200 && aiExpert.json?.ok === true && aiExpert.json.id === 'recon-expert' && String(aiExpert.json.path).includes('recon-expert.md'),
  { status: aiExpert.status, body: aiExpert.json },
)
const expertFileText = String(await readFile(aiExpert.json.path, 'utf8'))
check(
  '落盘的专家文件是标准格式（frontmatter + 四段），工具自己也能读',
  expertFileText.includes('displayName: 老付') &&
    expertFileText.includes('profession: 支付对账专家') &&
    ['## 核心能力', '## 工作流程', '## 输出规范', '## 注意事项'].every((part) => expertFileText.includes(part)),
  expertFileText.slice(0, 140),
)
check(
  'AI 的假设只回给页面看，不写进角色定义正文',
  !expertFileText.includes('假设使用 MySQL') && aiExpert.json.assumptions?.[0] === '假设使用 MySQL',
  aiExpert.json.assumptions,
)
check(
  '调模型用的是宿主默认模型路由，且把用户那句话带上了',
  llmCalls.length === 1 && llmCalls[0].provider === 'deepseek' && llmCalls[0].model === 'deepseek-v4.1-flash' && String(llmCalls[0].messages?.[0]?.content?.[0]?.text).includes('一个盯支付对账的后端专家'),
  { provider: llmCalls[0]?.provider, model: llmCalls[0]?.model },
)

// 专家团：成员一并补齐 + 条目写进清单文件
llmReplyText = JSON.stringify({
  id: 'one-stop-team',
  name: '全栈交付一条龙专家团',
  profession: '需求 → 架构 → 开发 → 评审 → 测试 一条龙',
  description: '要交付一个功能时请他们',
  lead: 'team-architect',
  flow: ['先定需求', '再定方案', '实现后评审', '测试出结论'],
  members: [
    { id: 'team-architect', displayName: '老构', profession: '架构师', description: '定方案并实现', abilities: ['方案设计'], flow: ['出方案'], outputs: ['改动清单'], cautions: ['不越界改需求'] },
    { id: 'team-reviewer', displayName: '老审', profession: '评审', description: '独立评审', abilities: ['问题定位'], flow: ['看改动'], outputs: ['问题清单'], cautions: ['只评不改'] },
  ],
  assumptions: ['假设是 Java 技术栈'],
})
llmCalls.length = 0
const aiTeam = await call('POST', '/ai/create', { kind: 'team', description: '要一个从需求到测试一条龙的团队', scope: 'project' })
check(
  '/ai/create（专家团）：一次把团与成员都建好',
  aiTeam.status === 200 && aiTeam.json?.ok === true && aiTeam.json.id === 'one-stop-team' && (aiTeam.json.members ?? []).length === 2 && (aiTeam.json.created ?? []).length === 3,
  { status: aiTeam.status, created: (aiTeam.json?.created ?? []).map((item) => item.id), members: aiTeam.json?.members },
)
const teamListAfterAi = await call('GET', '/experts')
check(
  '新建的专家团立刻出现在专家列表里（页面刷新就能选）',
  (teamListAfterAi.json?.teams ?? []).some((team) => team.id === 'one-stop-team' && team.lead === 'team-architect'),
  (teamListAfterAi.json?.teams ?? []).map((team) => `${team.id}:${team.lead}`),
)

// 再次创建同一个团 → 覆盖前必须拦住（不静默覆盖）
llmCalls.length = 0
const aiTeamAgain = await call('POST', '/ai/create', { kind: 'team', description: '同样一个团', scope: 'project' })
check(
  '重复创建会被拦住并说明原因（不静默覆盖）',
  aiTeamAgain.status === 400 && aiTeamAgain.json?.ok === false && String(aiTeamAgain.json.error).includes('已存在'),
  aiTeamAgain.json,
)

// 各种失败路径：都要 ok:false + 人话原因
llmAvailable = false
const aiNoLlm = await call('POST', '/ai/create', { kind: 'expert', description: '随便一个专家', scope: 'project' })
llmAvailable = true
check('宿主没给 llm 服务时：如实说没这个能力，并指路备选', aiNoLlm.status === 400 && String(aiNoLlm.json?.error).includes('发到对话里做'), aiNoLlm.json)
llmReplyText = '我觉得这个需求是这样的……（没有 JSON）'
const aiBadJson = await call('POST', '/ai/create', { kind: 'expert', description: '随便一个专家', scope: 'project' })
check('模型没给 JSON 时：不落盘、返回原因并留原文片段，还指了退路', aiBadJson.status === 400 && String(aiBadJson.json?.error).includes('JSON') && String(aiBadJson.json?.error).includes('发到对话里做') && typeof aiBadJson.json?.raw === 'string', aiBadJson.json)
const aiNoDescription = await call('POST', '/ai/create', { kind: 'expert', description: '', scope: 'project' })
check('没写描述时不凭空造：要求先给一句话', aiNoDescription.status === 400 && String(aiNoDescription.json?.error).includes('一句话'), aiNoDescription.json)

console.log('\n[7] 多张飞书表：清单 / 表结构 / 跨表总览')
await writeFile(
  join(projectDir, '.dev-task-sources.json'),
  JSON.stringify(
    {
      version: 1,
      defaultProject: 'demo-project',
      projects: {
        'demo-project': {
          baseUrl: REAL_TASK_URL,
          tableName: '开发任务表',
          identity: 'user',
          fields: {
            id: '任务编号',
            title: '任务标题',
            requirementId: '关联需求编号',
            module: '所属模块',
            type: '任务类型',
            status: '状态',
            owner: '负责人',
            reviewer: '评审人',
            priority: '优先级',
            estimate: '预估工时',
            branch: '开发分支',
            mrLink: 'MR 链接',
            evidence: '交付证据',
          },
        },
      },
    },
    null,
    2,
  ),
  'utf8',
)

const tableList = await call('GET', '/tables')
check(
  '/tables 认出项目里的两张表',
  tableList.status === 200 && tableList.json?.tables?.length === 2 && tableList.json.tables.map((table) => table.kind).sort().join(',') === 'requirement,task',
  tableList.json?.tables?.map((table) => table.key),
)

const taskRecords = await call('GET', `/records?table=${encodeURIComponent('task:demo-project')}`)
if (taskRecords.json?.error) {
  warn('读开发任务表失败（环境/权限问题）', String(taskRecords.json.detail || '').slice(0, 200))
} else {
  check('读开发任务表记录', taskRecords.status === 200 && taskRecords.json?.table?.kind === 'task' && Array.isArray(taskRecords.json?.items), { count: taskRecords.json?.count })
  // 用户报过的坑：表是空的（0 条）被当成「ndjson 通道不可用」，点开就弹一段吓人的警告。
  // ndjson 正常退出、文件也写出来了，就该按 ndjson 通道显示 0 条，而不是退回值矩阵。
  check(
    '空表不再被当成「通道不可用」（ndjson 正常就是 0 条）',
    taskRecords.json?.fetchMode === 'ndjson' && !taskRecords.json?.warning,
    { fetchMode: taskRecords.json?.fetchMode, warning: taskRecords.json?.warning, count: taskRecords.json?.count },
  )
  if (taskRecords.json?.items?.length) {
    console.log(`       任务样例：${taskRecords.json.items.slice(0, 3).map((item) => `${item.code || '-'} ${item.title} [${item.status || '-'}] ${item.module || ''}`.trim()).join(' ｜ ')}`)
  }
}

// lark-cli 的 --output 只认「当前工作目录 / 账号临时目录 / home 下的 files」，
// 写到工作台数据目录会被判 unsafe output path（退出码 2）——所以必须落临时目录。
const serverSource = await readClient(new URL('../dsh/index.js', import.meta.url), 'utf8')
check(
  'ndjson 落在账号临时目录（不再写工作台数据目录）',
  serverSource.includes('larkOutputFile') && serverSource.includes('join(tmpdir()') && !serverSource.includes("join(config.root, 'pull')"),
)
check(
  'ndjson 失败与「表本来就是空的」分开判断',
  serverSource.includes('readRecordsWithFallback') && serverSource.includes('这张表就是空的') && !serverSource.includes('ndjson 输出里没有解析到记录'),
)
const tmpLeftover = (await readdir(tmpdir())).filter((name) => String(name).startsWith('dsh-rdw-pull-'))
check('读完就删，临时目录不留 ndjson 垃圾', tmpLeftover.length === 0, tmpLeftover.slice(0, 5))


const taskSchema = await call('GET', `/fields?table=${encodeURIComponent('task:demo-project')}`)
if ((taskSchema.json?.fields?.length ?? 0) > 0) {
  check('读开发任务表的表结构', taskSchema.status === 200, (taskSchema.json?.fields ?? []).map((field) => field.name).slice(0, 6))
} else {
  // 没配真实表（或本机 lark-cli 不可用）时，这条属环境问题，不能判代码失败
  warn('读开发任务表的表结构（跳过：没配真实表或 lark-cli 不可用）', String(taskSchema.json?.detail || taskSchema.json?.error || '').slice(0, 200))
}

/* 回写飞书：命令名/参数必须和本机 lark-cli 对得上（用 --dry-run 验证，不真的写） */

check('回写用 +record-batch-update 的批量结构', (() => {
  const payload = buildBatchUpdatePayload('recA', '状态', '已领取', 'singleSelect')
  return (
    Array.isArray(payload.update_records.recA['状态']) &&
    payload.update_records.recA['状态'][0] === '已领取' &&
    cellValueFor('12.5', 'number') === 12.5 &&
    cellValueFor(true, 'checkbox') === true &&
    cellValueFor('', 'singleSelect') === null
  )
})(), buildBatchUpdatePayload('recA', '状态', '已领取', 'singleSelect'))

const requirementRecords = await call('GET', `/records?table=${encodeURIComponent('requirement:demo-project')}`)
const writeRecord = requirementRecords.json?.items?.[0]
if (!writeRecord?.id) {
  warn('拿不到真实记录 ID，跳过回写 dry-run 检查', requirementRecords.json?.error ?? requirementRecords.json?.warning ?? '')
} else {
  const dry = await call('POST', '/requirement/status', {
    recordId: writeRecord.id,
    status: String(writeRecord.status || '待开发'),
    field: '状态',
    fieldType: 'singleSelect',
    dryRun: true,
  })
  check(
    '回写命令被本机 lark-cli 接受（--dry-run，未真的写）',
    dry.status === 200 && dry.json?.ok === true && dry.json?.dryRun === true,
    { status: dry.status, detail: String(dry.json?.detail ?? '').slice(0, 300), command: dry.json?.command },
  )
}

/* 卡片字段可配置（按表持久化） */

const cardFieldPatch = await call('POST', '/view', { tables: { 'requirement:demo-project': { cardFields: ['状态', '负责人'] } } })
check('卡片字段配置可保存', cardFieldPatch.status === 200, cardFieldPatch.json?.view?.tables?.['requirement:demo-project'])
const viewBack = await call('GET', '/view')
check(
  '卡片字段配置按表读回',
  (viewBack.json?.view?.tables?.['requirement:demo-project']?.cardFields ?? []).join(',') === '状态,负责人',
  viewBack.json?.view?.tables?.['requirement:demo-project'],
)
check('客户端有卡片字段配置入口与确认回写', clientSource.includes('卡片上展示哪些字段') && clientSource.includes('确认写回飞书'))

/* 侧边栏宽度 / 模块名称：写进 view.json 并在下次打开读回 */

await call('POST', '/view', { railWidth: 236 })
const railBack = await call('GET', '/view')
check('侧边栏宽度可保存并读回', railBack.json?.view?.railWidth === 236, railBack.json?.view?.railWidth)
await call('POST', '/view', { railWidth: 9999 })
check('侧边栏宽度超范围自动夹到 380', (await call('GET', '/view')).json?.view?.railWidth === 380)
await call('POST', '/view', { railWidth: 236 })

const renamePatch = await call('POST', '/view', { modules: [{ key: 'm1', tableKey: 'requirement:demo-project', title: '我的需求池', view: 'board' }] })
check('模块名称可保存', renamePatch.status === 200 && renamePatch.json?.view?.modules?.[0]?.title === '我的需求池', renamePatch.json?.view?.modules)
const renamed = await call('GET', '/view')
check(
  '模块名称按自定义值读回（不被表名覆盖）',
  renamed.json?.view?.modules?.[0]?.title === '我的需求池' && renamed.json?.view?.modules?.[0]?.tableKey === 'requirement:demo-project',
  renamed.json?.view?.modules?.[0],
)

const overview = await call('GET', '/overview')
check('/overview 汇总两张表', overview.status === 200 && Array.isArray(overview.json?.tables) && overview.json.tables.length === 2, overview.json?.tables?.map((table) => ({ key: table.key, total: table.total, error: table.error })))
const withProgress = (overview.json?.tables ?? []).find((table) => table.progress)
if (withProgress) {
  console.log(
    `       进度：${withProgress.label} 共 ${withProgress.progress.total} 条，按「${withProgress.progress.field}」分布 ${withProgress.progress.buckets.map((bucket) => `${bucket.value}:${bucket.count}`).join(' / ')}，完成 ${withProgress.progress.percent}%`,
  )
  check('总览带进度统计', withProgress.progress.total > 0 && Array.isArray(withProgress.progress.buckets))
} else {
  warn('总览没有拿到进度统计（两张表都没读到数据）')
}

/* --------------------------------------------- 工作台执行记录（新） */

console.log('\n[8] 工作台自己的执行记录')
const runCreate = await call('POST', '/runs', { tableKey: 'requirement:demo-project', recordId: 'recSMOKE1', title: '冒烟测试·执行记录', projectDir: projectDir, note: '冒烟测试写入' })
check('新增执行记录', runCreate.status === 200 && runCreate.json?.ok === true && runCreate.json.items.length === 1, runCreate.json?.error)
const runId = runCreate.json?.run?.id
const runUpdate = await call('POST', '/runs/status', { id: runId, status: 'done', note: '验证完成' })
check('更新执行记录状态', runUpdate.status === 200 && runUpdate.json?.items?.[0]?.status === 'done' && runUpdate.json.items[0].history.length === 2)
const runsBack = await call('GET', '/runs')
check('执行记录可读回', runsBack.status === 200 && runsBack.json?.items?.[0]?.id === runId)
check('执行记录按事件追加写在 runs.jsonl', await (async () => {
  const { readFile } = await import('node:fs/promises')
  const text = await readFile(join(root, 'runs.jsonl'), 'utf8').catch(() => '')
  return text.split('\n').filter(Boolean).length === 2
})())
check('非法状态被拒绝', (await call('POST', '/runs/status', { id: runId, status: '乱写' })).status === 400)

// 同一个任务只留一条：再点一次「生成开发指令并复制」要更新这一条，而不是又多一条
const runAgain = await call('POST', '/runs', { tableKey: 'requirement:demo-project', recordId: 'recSMOKE1', title: '冒烟测试·执行记录', projectDir: projectDir, note: '又点了一次' })
check(
  '同一条任务再点一次：regenerated=true，只有 1 条，次数 +1（不新增记录）',
  runAgain.status === 200 && runAgain.json?.regenerated === true && runAgain.json.items.length === 1 && runAgain.json.items[0].generated === 2 && runAgain.json.items[0].id === runId,
  { regenerated: runAgain.json?.regenerated, items: runAgain.json?.items?.length, generated: runAgain.json?.items?.[0]?.generated },
)
check('再生成只刷新时间/备注/项目，用户标过的状态不被冲掉', runAgain.json.items[0].status === 'done' && runAgain.json.items[0].note === '又点了一次' && runAgain.json.items[0].projectDir === projectDir)
check('这条记录的历史也留全了（首建 → 标完成 → 再生成）', (runAgain.json.items[0].history ?? []).length === 3)
check(
  '换一个任务照旧单独成一条（不会把不同任务并到一起）',
  (await call('POST', '/runs', { tableKey: 'requirement:demo-project', recordId: 'recSMOKE2', title: '冒烟测试·另一个任务' })).json.items.length === 2,
)
check('总览同口径：一个任务一条', (await call('GET', '/overview')).json.runs.length === 2)

// 老数据（同一个任务已经被点出好几条）读出来就该合并成一条
const legacyMerged = foldRuns([
  { type: 'create', id: 'a', at: '2026-10-24T01:00:00.000Z', tableKey: 't1', recordId: 'recL', title: '老数据任务', status: 'handed-off' },
  { type: 'create', id: 'b', at: '2026-10-24T02:00:00.000Z', tableKey: 't1', recordId: 'recL', title: '老数据任务', status: 'in-progress' },
  { type: 'create', id: 'c', at: '2026-10-24T03:00:00.000Z', tableKey: 't1', recordId: 'recL', title: '老数据任务', status: 'handed-off' },
  { type: 'update', id: 'c', at: '2026-10-24T03:30:00.000Z', status: 'done', note: '用户标完成' },
])
check(
  '老数据里同一条任务的 3 条重复记录，读出来只剩 1 条（次数 3、状态取最近一次显式改动 done）',
  legacyMerged.length === 1 && legacyMerged[0].generated === 3 && legacyMerged[0].status === 'done' && (legacyMerged[0].history ?? []).length === 4,
  { count: legacyMerged.length, generated: legacyMerged[0]?.generated, status: legacyMerged[0]?.status, history: legacyMerged[0]?.history?.length },
)
check('按「表 + 记录 id」归并，两张表里同名记录不会串起来', runTaskKey({ tableKey: 't1', recordId: 'x' }) !== runTaskKey({ tableKey: 't2', recordId: 'x' }))
check('没有记录 id 时退到标题归并（同标题算同一件事）', runTaskKey({ title: '只有标题' }) === runTaskKey({ tableKey: 't9', title: '只有标题', id: 'run-z' }))
check('没有 recordId 的重复记录也合并成一条', foldRuns([
  { type: 'create', id: 'p', at: '2026-10-24T01:00:00.000Z', title: '只有标题', status: 'handed-off' },
  { type: 'create', id: 'q', at: '2026-10-24T02:00:00.000Z', title: '只有标题', status: 'handed-off' },
]).length === 1)
check(
  '角标次数用记录里的生成次数（一条 deduped 记录也能显示 ×3）',
  pure.runBadge({ id: 'rec1', title: 'x' }, [{ recordId: 'rec1', at: '2026-10-24T03:00:00.000Z', status: 'done', generated: 3 }])?.count === 3,
)

/* ============ v4：飞书文档（取文档信息）+ AI 全流程（专家团流水线） ============ */

console.log('\n[9] 飞书文档：链接解析与返回体解析')
check('文档链接：/docx/ 链接', (() => {
  const parsed = parseDocInput('https://example.feishu.cn/docx/AbCdEf123456')
  return parsed.doc === 'AbCdEf123456' && parsed.kind === 'docx'
})())
check('文档链接：/wiki/ 链接也收', parseDocInput('https://example.feishu.cn/wiki/WkToken9988').kind === 'wiki')
check('文档链接：带 query 的链接照样认出 token', parseDocInput('https://x.feishu.cn/docx/Tok12345?from=space').doc === 'Tok12345')
check('文档链接：裸 token', parseDocInput('Tok12345abcde').doc === 'Tok12345abcde')
check('文档链接：空输入 / 明显不是 token 的一律不猜', parseDocInput('').doc === '' && parseDocInput('这是一句话不是链接').doc === '')

check('文档返回体：成功时取到标题与正文（<title> 不当正文）', (() => {
  const payload = parseDocPayload(JSON.stringify({
    ok: true,
    identity: 'user',
    data: { document: { document_id: 'D1', revision_id: 12, content: '<title>支付对账需求</title>\n\n正文第一段\n正文第二段', tips: '' } },
  }))
  return payload.ok && payload.title === '支付对账需求' && payload.text.startsWith('正文第一段') && payload.revision === 12 && !payload.text.includes('<title>')
})())
check('文档返回体：失败时把人话与错误码都带出来', (() => {
  const payload = parseDocPayload(JSON.stringify({ ok: false, error: { type: 'api', subtype: 'unknown', code: 3380002, message: 'Invalid document_id' } }))
  return payload.ok === false && payload.error.includes('Invalid document_id') && String(payload.detail).includes('3380002')
})())
check('文档返回体：不是 JSON 时不假装成功', parseDocPayload('command not found').ok === false)
check(
  '界面自检上报接通（服务端侧）：POST 存内存、GET 可读；排障时直接读，不用你猜',
  serverSource.includes("route === '/ui/metrics' && req.method === 'POST'") &&
    serverSource.includes("route === '/ui/metrics' && req.method === 'GET'") &&
    serverSource.includes('let uiMetrics = null') &&
    serverSource.includes('uiMetrics = { ...body, at: new Date().toISOString() }'),
)

console.log('\n[10] 飞书文档接口（真实 handler）')
const docsEmpty = await call('GET', '/docs')
check('还没拉取过文档时清单为空', docsEmpty.status === 200 && Array.isArray(docsEmpty.json?.items) && docsEmpty.json.items.length === 0)
const badDoc = await call('POST', '/doc/fetch', { input: '这不是链接' })
check('不给链接时明确要求先给链接（400/502 都算拦住，不是静默成功）', badDoc.status >= 400 && !badDoc.json?.ok, { status: badDoc.status, error: badDoc.json?.error })
const fakeDoc = await call('POST', '/doc/fetch', { input: 'https://example.feishu.cn/docx/FAKETOKENFAKETOKEN' })
if (fakeDoc.status === 502) {
  // 拿一篇不存在的文档去打真实 lark-cli：要的是「干净报错」，而不是崩掉或假装成功。
  check('文档读不到时：干净报错并带上实际命令，不落盘、不谎报成功', Boolean(fakeDoc.json?.error) && !fakeDoc.json?.ok, { error: String(fakeDoc.json?.error ?? '').slice(0, 120), command: fakeDoc.json?.command })
  check('拉取失败不会往清单里塞东西', (await call('GET', '/docs')).json?.items?.length === 0)
} else {
  warn('本地 lark-cli 这次没按预期报错（环境问题），跳过文档失败路径检查', { status: fakeDoc.status, error: fakeDoc.json?.error })
}
check('移除一篇不存在的文档也不报错（幂等）', (await call('POST', '/doc/remove', { id: 'nope' })).status === 200)

console.log('\n[11] AI 全流程：阶段与折叠')
check('四段流程就是需求分析 → 开发 → 评审 → QA', FLOW_STAGES.map((stage) => stage.name).join('→') === '需求分析→代码开发→代码评审→QA 测试', FLOW_STAGES)
check('每个阶段都挂了本机已有的专家角色（DSH_HOME/agents）', FLOW_STAGES.every((stage) => stage.role) && FLOW_STAGES.map((stage) => stage.role).join(',') === 'product-requirement-expert,fullstack-architect,code-review-expert,qa-test-expert')
check('阶段名可反查（未知 id 原样返回，不瞎编）', flowStageName('review') === '代码评审' && flowStageName('unknown-stage') === 'unknown-stage')
check('状态集合：待开始/进行中/已完成/已完成·无凭据/受阻', FLOW_STATUS.map((entry) => entry.label).join(',') === '待开始,进行中,已完成,已完成 · 无凭据,受阻')
check('凭据种类五类，且不含「备注」', FLOW_EVIDENCE_KINDS.map((entry) => entry.id).join(',') === 'command,files,test,url,spec')
check('每段都要求凭据（needsEvidence）', FLOW_STAGES.every((stage) => stage.needsEvidence === true))

check('折叠两条事件：创建 + 阶段更新', (() => {
  const flows = foldFlows([
    { type: 'create', id: 'f1', at: '2026-01-01T00:00:00.000Z', title: '对账导出', recordId: 'rec1', team: 'team:x', teamName: '专家团 · x' },
    { type: 'stage', id: 'f1', at: '2026-01-01T01:00:00.000Z', stage: 'analyze', status: 'done', note: '范围已确认' },
  ])
  const flow = flows[0]
  const analyze = flow.stages.find((stage) => stage.id === 'analyze')
  return flows.length === 1 && flow.stages.length === 4 && analyze.status === 'done' && analyze.note === '范围已确认' && flowPercent(flow) === 25
})())
check('非法阶段状态不写进去（脏数据挡在门外）', (() => {
  const flows = foldFlows([
    { type: 'create', id: 'f2', at: '2026-01-01T00:00:00.000Z', title: 't' },
    { type: 'stage', id: 'f2', at: '2026-01-01T01:00:00.000Z', stage: 'develop', status: '乱写' },
  ])
  return flows[0].stages.find((stage) => stage.id === 'develop').status === 'pending'
})())
check('移除后的流水线不再出现', foldFlows([
  { type: 'create', id: 'f3', at: '2026-01-01T00:00:00.000Z', title: 't' },
  { type: 'remove', id: 'f3', at: '2026-01-01T02:00:00.000Z' },
]).length === 0)
check('没有 create 的孤儿事件不会造出流水线', foldFlows([{ type: 'stage', id: 'ghost', stage: 'qa', status: 'done' }]).length === 0)

console.log('\n[11b] v4.2 阶段凭据：折叠、删除、老数据与台账口径')
check('凭据事件挂到对应阶段上（未知类型退成 command、空摘要丢弃）', (() => {
  const flows = foldFlows([
    { type: 'create', id: 'f4', at: '2026-01-01T00:00:00.000Z', title: 't' },
    { type: 'evidence', id: 'f4', at: '2026-01-01T00:30:00.000Z', stage: 'develop', kind: 'files', summary: 'src/a.ts | 12 +++++' },
    { type: 'evidence', id: 'f4', at: '2026-01-01T00:40:00.000Z', stage: 'develop', kind: '乱写', summary: '按命令处理' },
    { type: 'evidence', id: 'f4', at: '2026-01-01T00:50:00.000Z', stage: 'develop', kind: 'test', summary: '   ' },
  ])
  const develop = flows[0].stages.find((stage) => stage.id === 'develop')
  return develop.evidence.length === 2 && develop.evidence[1].kind === 'command'
})())
check('凭据可删（按事件时间匹配，别的凭据不受影响）', (() => {
  const flows = foldFlows([
    { type: 'create', id: 'f5', at: '2026-01-01T00:00:00.000Z', title: 't' },
    { type: 'evidence', id: 'f5', at: '2026-01-01T01:00:00.000Z', stage: 'qa', kind: 'test', summary: 'A' },
    { type: 'evidence', id: 'f5', at: '2026-01-01T02:00:00.000Z', stage: 'qa', kind: 'test', summary: 'B' },
    { type: 'evidence-remove', id: 'f5', at: '2026-01-01T03:00:00.000Z', stage: 'qa', targetAt: '2026-01-01T01:00:00.000Z' },
  ])
  const qa = flows[0].stages.find((stage) => stage.id === 'qa')
  return qa.evidence.length === 1 && qa.evidence[0].summary === 'B'
})())
check('老 flows.jsonl（阶段没有 evidence 字段）读出来不崩，按空数组处理', (() => {
  const flows = foldFlows([{ type: 'create', id: 'f6', at: '2026-01-01T00:00:00.000Z', title: 't' }])
  return Array.isArray(flows[0].stages[0].evidence) && flows[0].stages[0].evidence.length === 0
})())
check('「已完成 · 无凭据」也推进度，但台账里与有凭据完成分开数', (() => {
  const flows = foldFlows([
    { type: 'create', id: 'f7', at: '2026-01-01T00:00:00.000Z', title: 't' },
    { type: 'evidence', id: 'f7', at: '2026-01-01T00:10:00.000Z', stage: 'analyze', kind: 'files', summary: 'x' },
    { type: 'stage', id: 'f7', at: '2026-01-01T00:20:00.000Z', stage: 'analyze', status: 'done' },
    { type: 'stage', id: 'f7', at: '2026-01-01T00:30:00.000Z', stage: 'develop', status: 'done_unverified' },
  ])
  const stats = flowEvidenceStats(flows[0])
  return flowPercent(flows[0]) === 50 && stats.evidence === 1 && stats.unverified === 1 && stats.done === 2 && stats.stages === 4
})())
check('验收标准检查：能失败的通过，含糊的标黄', (() => {
  const text = [
    '# 某某需求 spec',
    '',
    '## 验收标准',
    '',
    '- 当邮箱已注册时，接口返回 409 并提示「邮箱已被占用」',
    '- 注册功能正常工作',
    '- 用户能登录',
    '',
    '## 其他',
    '- 这条不在验收标准段里，不该被算进去',
  ].join('\n')
  const result = checkAcceptanceCriteria(text)
  return result.found === true && result.total === 3 && result.weak.length === 2 && result.weak[0].index === 2 && result.weak[0].text === '注册功能正常工作'
})())
check('验收标准检查：没有「验收标准」段落时明确说没找到，不瞎判', (() => {
  const result = checkAcceptanceCriteria('# 设计说明\n\n这里只有背景和方案，没有验收标准段。')
  return result.found === false && result.total === 0 && result.weak.length === 0
})())

console.log('\n[12] AI 全流程接口（真实 handler）')
const flowsEmpty = await call('GET', '/flows')
check('还没建流水线时清单为空，且带出四段定义', flowsEmpty.status === 200 && flowsEmpty.json?.items?.length === 0 && flowsEmpty.json?.stages?.length === 4)
check('不带任务就开流水线会被拦住', (await call('POST', '/flows', { title: '' })).status === 400)
const flowCreate = await call('POST', '/flows', { recordId: 'recSMOKE2', tableKey: 'task:demo-project', title: '冒烟测试·全流程', team: 'team:fullstack-delivery-team', teamName: '专家团 · 全栈交付' })
check('开一条全流程：四段都是待开始', flowCreate.status === 200 && flowCreate.json?.items?.[0]?.stages?.length === 4 && flowCreate.json.items[0].stages.every((stage) => stage.status === 'pending'), flowCreate.json?.error)
const flowId = flowCreate.json?.items?.[0]?.id
const flowStage = await call('POST', '/flows/stage', { id: flowId, stage: 'analyze', status: 'done', note: '需求说明已出' })
check('无凭据标完成：被降级成「已完成 · 无凭据」，不是 done', flowStage.status === 200 && flowStage.json?.downgraded === true && flowStage.json?.items?.[0]?.stages?.[0]?.status === 'done_unverified' && flowStage.json.items[0].stages[0].note === '需求说明已出')
check('凭据不能为空（一句话「已完成」不算数）', (await call('POST', '/flows/evidence', { id: flowId, stage: 'analyze', kind: 'command', summary: '   ' })).status === 400)
check('凭据类型必须在白名单里', (await call('POST', '/flows/evidence', { id: flowId, stage: 'analyze', kind: '乱写', summary: 'x' })).status === 400)
const evAdd = await call('POST', '/flows/evidence', { id: flowId, stage: 'analyze', kind: 'files', summary: 'src/a.ts | 12 +++++' })
check('贴一条凭据能读回，并挂在对应阶段上', evAdd.status === 200 && evAdd.json?.items?.[0]?.stages?.[0]?.evidence?.length === 1 && evAdd.json.items[0].stages[0].evidence[0].kind === 'files')
const flowStageDone = await call('POST', '/flows/stage', { id: flowId, stage: 'analyze', status: 'done', note: '需求说明已出' })
check('有凭据再标完成：就是 done，不被降级', flowStageDone.status === 200 && flowStageDone.json?.downgraded === false && flowStageDone.json?.items?.[0]?.stages?.[0]?.status === 'done')
check('非法阶段状态被拒绝', (await call('POST', '/flows/stage', { id: flowId, stage: 'analyze', status: '乱写' })).status === 400)
check('缺阶段 id 被拒绝', (await call('POST', '/flows/stage', { id: flowId, status: 'done' })).status === 400)
const flowsBack = await call('GET', '/flows')
check('流水线可读回（刷新后还在，且带凭据）', flowsBack.json?.items?.[0]?.id === flowId && (() => {
  const analyze = flowsBack.json.items[0].stages.find((stage) => stage.id === 'analyze')
  return analyze.status === 'done' && analyze.evidence.length === 1
})())
check('流水线按事件追加写在 flows.jsonl（create + 两次状态 + 一条凭据）', await (async () => {
  const { readFile } = await import('node:fs/promises')
  const text = await readFile(join(root, 'flows.jsonl'), 'utf8').catch(() => '')
  const events = text.split('\n').filter(Boolean).map((line) => JSON.parse(line))
  return events.length === 4 && events.filter((event) => event.type === 'stage').length === 2 && events.filter((event) => event.type === 'evidence').length === 1
})())
check('移除流水线后不再出现在清单里', (await call('POST', '/flows/remove', { id: flowId })).json?.items?.length === 0)

console.log('\n[12b] v4.2 spec 文档：扫描、读取、验收标准检查')
const specScan = await call('GET', '/spec-scan')
check('扫到项目里 skill 产出的 spec 文档', specScan.status === 200 && specScan.json?.ok === true && (specScan.json.items ?? []).some((item) => item.name === 'cursor-paging.spec.md'), specScan.json?.error)
const specPath = (specScan.json?.items ?? []).find((item) => item.name === 'cursor-paging.spec.md')?.path
const specRead = await call('POST', '/spec-read', { path: specPath })
check('读 spec：正文拉得到，验收标准 2 条、其中 1 条不可判定', specRead.status === 200 && specRead.json?.checks?.found === true && specRead.json.checks.total === 2 && specRead.json.checks.weak.length === 1 && specRead.json.checks.weak[0].text === '分页要正常工作', specRead.json?.error)
check('读 spec 走白名单：扫描范围外的文件一律拒绝', (await call('POST', '/spec-read', { path: join(projectDir, 'AGENTS.md') })).status === 400)
check('认不出的表不静默丢弃：直接写表名会给出原因', await (async () => {
  const dir = join(root, 'fake-dropped')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, '.requirement-sources.json'), JSON.stringify({
    sources: {
      正常表: { baseUrl: `https://x.feishu.cn/base/${BASE_TOKEN}?table=tblABCDEF123456` },
      写错表: { baseUrl: `https://x.feishu.cn/base/${BASE_TOKEN}?table=需求池` },
    },
  }), 'utf8')
  const result = await listTables({ root, identity: 'user', skillsRoots: [], larkCli: '' }, { projectDir: dir })
  return result.tables.length === 1 && result.dropped.length === 1 && result.dropped[0].label === '开发需求 · 写错表' && /不像飞书表 id/.test(result.dropped[0].reason)
})())

console.log('\n[13] v4 客户端：新模块与改名都到位，没留旧名字')
check('已改名并定位为「AI Native 工作台」', clientSource.includes("title: 'AI Native 工作台'") && clientSource.includes("panelTitle: 'AI Native'"))
check('注册时仍是自定义整块框架（整页业务 + 按需对话）', clientSource.includes('customFrame: true'))
check('左边导航里有「AI 全流程」和「飞书文档」两个新模块', clientSource.includes("label: 'AI 全流程'") && clientSource.includes("label: '飞书文档'"))
check('全流程模块：四段 + 复制指令 + 发进对话 + 受阻可重试', clientSource.includes('FLOW_STAGE_BRIEF') && clientSource.includes('复制指令') && clientSource.includes('发进对话') && clientSource.includes('重试这一阶段'))
check('阶段指令带上专家/专家团角色与前面阶段的进展', clientSource.includes('function stageInstruction') && clientSource.includes('前面阶段的进展') && clientSource.includes('expertInstructionLines(pick)'))
check('飞书文档模块：拉取 + 复制正文 + 送进对话', clientSource.includes('function DocsModule') && clientSource.includes('拉取文档') && clientSource.includes('复制正文') && clientSource.includes('送进对话'))
check('新增样式按业务容器宽度自适应（窄容器不塌）', clientSource.includes('.rdw-stage{') && clientSource.includes('.rdw-select{') && clientSource.includes('.rdw-docbody{'))

/* --------- 更新日志：包内 CHANGELOG.md -> /changelog -> 版本号弹窗 --------- */

const changelogText = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8').catch(() => '')
const changelogSections = changelogText ? parseChangelog(changelogText) : []
check(
  '更新日志能解析出版本段（版本号 + 日期 + 条目）',
  changelogSections.length > 0 && changelogSections.every((section) => /^\d+\.\d+\.\d+$/u.test(section.version) && section.items.length > 0),
  changelogSections.slice(0, 3).map((section) => `v${section.version}(${section.items.length})`),
)
check(
  '更新日志最新一段就是 package.json 里的版本（发版前必须先写这页）',
  changelogSections[0]?.version === JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version,
  [changelogSections[0]?.version],
)
check(
  '更新日志只取版本段内的条目，说明性文字不进列表',
  parseChangelog('# 更新日志\n\n说明段落\n\n## v9.9.9 — 2026-01-01\n\n- 第一条\n- 第二条\n\n### 小节标题\n\n- 小节里的不算\n\n## 维护约定\n\n- 约定不算').length === 1 &&
    parseChangelog('## v9.9.9 — 2026-01-01\n\n- 第一条\n- 第二条\n\n### 小节标题\n\n- 小节里的不算\n\n## 维护约定\n\n- 约定不算')[0]?.items.join('|') === '第一条|第二条',
  parseChangelog('## v9.9.9 — 2026-01-01\n\n- 第一条\n- 第二条\n\n### 小节标题\n\n- 小节里的不算\n\n## 维护约定\n\n- 约定不算')[0]?.items,
)
check('更新日志接口挂在 /changelog 且只读', clientSource.includes("api('/changelog')") && serverSource.includes("route === '/changelog'") && serverSource.includes("req.method === 'GET'"))
check(
  '左栏底部有「更新日志」入口，点开是弹窗且标出当前版本',
  clientSource.includes("'更新日志'") &&
    clientSource.includes('ChangelogDialog') &&
    clientSource.includes('当前版本') &&
    clientSource.includes('rdw-cl-section'),
)
check('v4.2 阶段凭据：贴凭据入口、无凭据角标、二次确认都在', ['贴凭据', '无凭据', '仍标为已完成（无凭据）', '备注不算凭据'].every((text) => clientSource.includes(text)))
check('v4.2 阶段指令要求给出能贴回工作台的凭据', clientSource.includes('不能只写「已完成」') && clientSource.includes('凭据要能一行一条贴回工作台'))
check('v4.2 上一阶段的凭据（含 spec 路径）会带进下一阶段指令', clientSource.includes('function evidenceBrief') && clientSource.includes('凭据来自上一阶段自己的产出'))
check('v4.2 空表文案分清「表就是空的」与「被筛选掉了」', clientSource.includes('function emptyTableText') && clientSource.includes('已成功读取，表内暂无记录') && clientSource.includes("'任务' : '需求'"))
check('v4.2 总览：0 条时标「表内暂无记录」，认不出的表给出原因', clientSource.includes('0 条（表内暂无记录）') && clientSource.includes('张表没被认出来'))
check('仓库身份没有被改掉（仍是同一个工作台，不会变成第二个入口）', clientSource.includes("repository: 'https://github.com/local-dev-workbench/dsh-requirement-dev-workbench'"))
check('界面上不再出现旧名字「需求开发工作台」', !clientSource.includes('需求开发工作台'))

console.log('\n[14] 两个新模块真的能渲染（桩 React 跑组件函数体）')

const docsEmptyNode = withInjectedState({}, () => renderComponent('DocsModule', { service: {} }, 'DocsModule（还没拉取）'))
check('飞书文档模块：空态给引导语而不是空白', collectText(docsEmptyNode).join(' ').includes('还没拉取过文档'))
const docsListNode = withInjectedState(
  {
    3: [{ id: 'D1', title: '支付对账需求说明（Payment reconciliation spec）', kind: 'docx', chars: 12345, addedAt: '2026-10-24T02:00:00.000Z', url: 'https://x.feishu.cn/docx/D1' }],
    4: 'D1',
    5: { id: 'D1', title: '支付对账需求说明（Payment reconciliation spec）' },
    6: '正文第一段：对账页支持批量导出。\nSecond paragraph in English.',
  },
  () => renderComponent('DocsModule', { service: {} }, 'DocsModule（有文档）'),
)
const docsText = collectText(docsListNode).join(' ')
check(
  '飞书文档模块：清单 + 正文 + 复制 / 送进对话都在',
  docsText.includes('支付对账需求说明') && docsText.includes('12345 字') && docsText.includes('复制正文') && docsText.includes('送进对话') && docsText.includes('正文第一段'),
  docsText.slice(0, 160),
)

const sampleFlow = {
  id: 'f1',
  at: '2026-10-24T02:00:00.000Z',
  title: '对账页支持批量导出',
  recordId: 'rec1',
  tableKey: 'task:x',
  team: 'team:fullstack-delivery-team',
  teamName: '专家团 · 全栈交付',
  stages: [
    { id: 'analyze', status: 'done', note: '范围已确认', at: '2026-10-24T03:00:00.000Z' },
    { id: 'develop', status: 'running', note: '', at: '' },
    { id: 'review', status: 'blocked', note: '等接口联调', at: '' },
    { id: 'qa', status: 'pending', note: '', at: '' },
  ],
}
const flowProps = {
  state: { settings: { projectDir: 'D:\\workspace\\demo-project', expert: 'team:fullstack-delivery-team' } },
  tables: [{ key: 'task:x', label: '开发任务 · x', kind: 'task' }],
  expertData: sampleExpertData,
  service: {},
}
const flowEmptyNode = withInjectedState({}, () => renderComponent('FlowModule', flowProps, 'FlowModule（还没建流水线）'))
check('全流程模块：没流水线时给引导语而不是空白', collectText(flowEmptyNode).join(' ').includes('还没有流水线'))
const flowNode = withInjectedState(
  { 0: [sampleFlow], 1: [{ id: 'rec1', title: '对账页支持批量导出', code: 'T-1' }], 3: 'rec1', 4: 'team:fullstack-delivery-team' },
  () => renderComponent('FlowModule', flowProps, 'FlowModule（有一条流水线）'),
)
const flowText = collectText(flowNode).join(' ')
check(
  '全流程模块：四段 + 状态角标 + 复制指令 / 发进对话都在',
  ['需求分析', '代码开发', '代码评审', 'QA 测试'].every((name) => flowText.includes(name)) &&
    flowText.includes('已完成') && flowText.includes('受阻') && flowText.includes('进行中') &&
    flowText.includes('复制指令') && flowText.includes('发进对话') && flowText.includes('存备注'),
  flowText.slice(0, 200),
)
check('全流程模块：完成度按阶段算出来（1/4 = 25%）', flowText.includes('25%'), flowText.match(/\d+%/g))
check('全流程模块：受阻的阶段才出现「重试这一阶段」', flowText.includes('重试这一阶段'))
check(
  '全流程模块：每段备注回填到各自输入框 + 角色显示出来',
  collectByType(flowNode, 'input').map((node) => String(node.props.value ?? '')).includes('范围已确认') &&
    collectByType(flowNode, 'input').map((node) => String(node.props.value ?? '')).includes('等接口联调') &&
    collectText(flowNode).join(' ').includes('专家团 · 全栈交付'),
  collectByType(flowNode, 'input').map((node) => String(node.props.value ?? '')),
)
check('左边导航同时有「AI 全流程」与「飞书文档」入口', collectText(railFrame).join(' ').includes('AI 全流程') && collectText(railFrame).join(' ').includes('飞书文档'), collectText(railFrame).join(' ').slice(0, 150))
check('顶栏与左栏都显示新名字「AI Native 工作台」', collectText(frameClosed).join(' ').includes('AI Native 工作台'))
check('新增阶段行会换行不塌（窄容器也不裁切）', clientSource.includes('.rdw-stage{') && clientSource.includes('flex-wrap:wrap') && clientSource.includes('.rdw-stage-note{'))

await rm(root, { recursive: true, force: true })

console.log(`\n结果：PASS ${passed} · WARN ${warned} · FAIL ${failed}`)
process.exitCode = failed === 0 ? 0 : 1
