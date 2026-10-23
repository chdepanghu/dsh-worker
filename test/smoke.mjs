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
import { apply, alignMatrixColumns, buildBatchUpdatePayload, cellValueFor, matrixShape, normalizeRecord, parseBaseInput, parseLarkRecords, recordsFromMatrix } from '../dsh/index.js'

const LARK = process.env.RDW_LARK_CLI || 'D:\\soft\\nodejs\\lark-cli.ps1'
const BASE_TOKEN = process.env.RDW_TEST_BASE || 'I3YnbPQp6awaxWsC1FZc8v89nyc'
const TABLE_ID = process.env.RDW_TEST_TABLE || '知识目录'
const REAL_BASE_URL =
  process.env.RDW_TEST_REAL_BASE || 'https://gaiaworks.feishu.cn/base/C61gbfm4fa5DIIs1tuVc93KHnoe?table=tbl4rWKwWr1tL1io'
const REAL_TASK_URL =
  process.env.RDW_TEST_TASK_BASE || 'https://gaiaworks.feishu.cn/base/C61gbfm4fa5DIIs1tuVc93KHnoe?table=tbluJCHiLRNUpTYl'

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
})()
await call('POST', '/settings', { projectDir })
const scanned = await call('GET', '/skills')
const skillNames = (scanned.json?.items ?? []).map((item) => item.name)
check('扫到项目 skill 并解析出 frontmatter 描述', skillNames.includes('feature-dev'), skillNames)
check('扫到规范文档', (scanned.json?.docs ?? []).some((doc) => doc.name === '03-coding'), (scanned.json?.docs ?? []).map((d) => d.name))
const readable = await call('GET', `/skill?path=${encodeURIComponent(join(projectDir, '.claude', 'skills', 'feature-dev', 'SKILL.md'))}`)
check('能读出 skill 正文', readable.status === 200 && String(readable.json?.text ?? '').includes('# feature-dev'))

/* ------------------------------------------- 真实需求源（端到端） */

console.log('\n[4] 真实需求源：项目内 .requirement-sources.json → 飞书需求表')
await writeFile(
  join(projectDir, '.requirement-sources.json'),
  JSON.stringify(
    {
      version: 1,
      defaultSource: 'dahua-skill-service',
      sources: {
        'dahua-skill-service': {
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
check('认出项目里的需求源配置', detected.status === 200 && detected.json?.found === true && detected.json.sources?.[0]?.name === 'dahua-skill-service', detected.json?.path)

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
const sampleTable = { key: 'requirement:dahua-skill-service', label: '开发需求 · dahua-skill-service', tableName: '需求池', kind: 'requirement', configPath: 'D:\\p\\.requirement-sources.json', fieldMap: null }
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
  state: { configured: true, settings: { projectDir: 'D:\\workspace\\dahua-skill\\dahua-skill-service' }, larkCli: 'lark-cli.cmd' },
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
  runs: [{ id: 'run1', at: '2026-10-22T10:00:00.000Z', title: sampleItem.title, status: 'handed-off', tableKey: sampleTable.key, projectDir: 'D:\\workspace\\dahua-skill\\dahua-skill-service', note: '已复制开发指令' }],
  onRefresh: () => {},
  onOpenTable: () => {},
  onUpdateRun: () => {},
  onAddModule: () => {},
  projectDir: 'D:\\workspace\\dahua-skill\\dahua-skill-service',
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
const tableData = { configured: true, items: [sampleItem, secondItem], count: 2, source: { label: '开发需求 · dahua-skill-service', tableName: '需求池', configPath: 'x' } }
const schemaResult = { configured: true, fields: sampleSchema }
const tableProps = {
  state: { configured: true, settings: { projectDir: 'D:\\workspace\\dahua-skill\\dahua-skill-service' }, larkCli: 'lark-cli.cmd' },
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
check('详情是弹窗（遮罩 + role=dialog），带执行记录角标', (() => {
  const masks = collectByType(detailNode, 'div').filter((entry) => String(entry.props?.className ?? '') === 'rdw-mask')
  const modals = collectByType(detailNode, 'div').filter((entry) => String(entry.props?.className ?? '') === 'rdw-modal')
  return masks.length === 1 && modals.length === 1 && modals[0].props.role === 'dialog' && modals[0].props['aria-modal'] === 'true' && collectText(modals[0]).join(' ').includes('已交付')
})())

/* --------- 自定义框架（customFrame）：顶栏 / 左导航 / 右侧原生对话 --------- */

const frameProps = { service: {}, entry: {}, active: true, conversation: stubReact.createElement('div', { className: 'host-chat' }, '原生对话占位') }
const frameState = { 1: { configured: true, settings: { projectDir: 'D:\\workspace\\dahua-skill\\dahua-skill-service' } } }
const frameClosed = withInjectedState(frameState, () => renderComponent('BusinessPanel', frameProps, 'BusinessPanel（框架·对话收起）'))
const frameOpen = withInjectedState({ ...frameState, 10: true }, () => renderComponent('BusinessPanel', frameProps, 'BusinessPanel（框架·对话展开）'))
check('照 SEO/GEO 工作台改用自定义框架（customFrame）', clientSource.includes('customFrame: true') && !clientSource.includes("businessSide: 'right'"))
check('框架外壳 = 顶栏 + 左导航 + 内容区', frameClosed?.props?.className === 'rdw-frame' && collectText(frameClosed).join(' ').includes('收起工作台') && collectByType(frameClosed, 'nav').length === 1, frameClosed?.props?.className)
const chatWrapOpen = collectByType(frameOpen, 'div').find((node) => node.props?.['aria-label'] === '原生对话')
const chatWrapClosed = collectByType(frameClosed, 'div').find((node) => node.props?.['aria-label'] === '原生对话')
check('「展开对话」把宿主原生对话挂到右侧', collectText(frameOpen).join(' ').includes('收起对话') && chatWrapOpen?.props?.style?.display === 'flex' && collectText(chatWrapOpen).join(' ').includes('原生对话占位'), chatWrapOpen?.props?.style)
check('「收起对话」时对话区隐藏', chatWrapClosed?.props?.style?.display === 'none' && collectText(frameOpen).join(' ').includes('收起工作台'))

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

/* ------------------------------------------------------- 纯函数（页面逻辑） */

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

/* ------------------------------------- 多表：需求池 + 开发任务表（新） */

console.log('\n[7] 多张飞书表：清单 / 表结构 / 跨表总览')
await writeFile(
  join(projectDir, '.dev-task-sources.json'),
  JSON.stringify(
    {
      version: 1,
      defaultProject: 'dahua-skill-service',
      projects: {
        'dahua-skill-service': {
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

const taskRecords = await call('GET', `/records?table=${encodeURIComponent('task:dahua-skill-service')}`)
if (taskRecords.json?.error) {
  warn('读开发任务表失败（环境/权限问题）', String(taskRecords.json.detail || '').slice(0, 200))
} else {
  check('读开发任务表记录', taskRecords.status === 200 && taskRecords.json?.table?.kind === 'task' && Array.isArray(taskRecords.json?.items), { count: taskRecords.json?.count })
  if (taskRecords.json?.items?.length) {
    console.log(`       任务样例：${taskRecords.json.items.slice(0, 3).map((item) => `${item.code || '-'} ${item.title} [${item.status || '-'}] ${item.module || ''}`.trim()).join(' ｜ ')}`)
  }
}

const taskSchema = await call('GET', `/fields?table=${encodeURIComponent('task:dahua-skill-service')}`)
check('读开发任务表的表结构', taskSchema.status === 200 && (taskSchema.json?.fields?.length ?? 0) > 0, (taskSchema.json?.fields ?? []).map((field) => field.name).slice(0, 6))

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

const requirementRecords = await call('GET', `/records?table=${encodeURIComponent('requirement:dahua-skill-service')}`)
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

const cardFieldPatch = await call('POST', '/view', { tables: { 'requirement:dahua-skill-service': { cardFields: ['状态', '负责人'] } } })
check('卡片字段配置可保存', cardFieldPatch.status === 200, cardFieldPatch.json?.view?.tables?.['requirement:dahua-skill-service'])
const viewBack = await call('GET', '/view')
check(
  '卡片字段配置按表读回',
  (viewBack.json?.view?.tables?.['requirement:dahua-skill-service']?.cardFields ?? []).join(',') === '状态,负责人',
  viewBack.json?.view?.tables?.['requirement:dahua-skill-service'],
)
check('客户端有卡片字段配置入口与确认回写', clientSource.includes('卡片上展示哪些字段') && clientSource.includes('确认写回飞书'))

/* 侧边栏宽度 / 模块名称：写进 view.json 并在下次打开读回 */

await call('POST', '/view', { railWidth: 236 })
const railBack = await call('GET', '/view')
check('侧边栏宽度可保存并读回', railBack.json?.view?.railWidth === 236, railBack.json?.view?.railWidth)
await call('POST', '/view', { railWidth: 9999 })
check('侧边栏宽度超范围自动夹到 380', (await call('GET', '/view')).json?.view?.railWidth === 380)
await call('POST', '/view', { railWidth: 236 })

const renamePatch = await call('POST', '/view', { modules: [{ key: 'm1', tableKey: 'requirement:dahua-skill-service', title: '我的需求池', view: 'board' }] })
check('模块名称可保存', renamePatch.status === 200 && renamePatch.json?.view?.modules?.[0]?.title === '我的需求池', renamePatch.json?.view?.modules)
const renamed = await call('GET', '/view')
check(
  '模块名称按自定义值读回（不被表名覆盖）',
  renamed.json?.view?.modules?.[0]?.title === '我的需求池' && renamed.json?.view?.modules?.[0]?.tableKey === 'requirement:dahua-skill-service',
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
const runCreate = await call('POST', '/runs', { tableKey: 'requirement:dahua-skill-service', recordId: 'recSMOKE1', title: '冒烟测试·执行记录', projectDir: projectDir, note: '冒烟测试写入' })
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

await rm(root, { recursive: true, force: true })

console.log(`\n结果：PASS ${passed} · WARN ${warned} · FAIL ${failed}`)
process.exitCode = failed === 0 ? 0 : 1
