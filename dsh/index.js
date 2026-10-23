/**
 * 需求开发工作台 · 服务端入口
 *
 * 职责：
 *  - 把工作台设置（飞书多维表格地址、所选项目目录、技能根目录）持久化到 DSH 数据目录；
 *  - 通过 lark-cli 读取飞书多维表格里的开发需求；
 *  - 扫描并读取项目/全局 skill 与开发规范文档；
 *  - 在本工作台自己的路径前缀 /api/requirement-dev-workbench/ 下提供本机接口。
 *
 * 不持有任何凭证：一律调用用户本机已登录的 lark-cli。
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { readFile, mkdir, readdir, rm, writeFile, appendFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import Schema from '@deepseek-ai/schemastery'

export const name = 'requirement-dev-workbench'
export const inject = ['webServer']
export const Config = Schema.object({
  root: Schema.string().required(),
  larkCli: Schema.string().default(''),
  identity: Schema.string().default('user'),
  skillsRoots: Schema.array(Schema.string()).default([]),
})

const API_PREFIX = '/api/requirement-dev-workbench'
const MAX_OUTPUT = 4 * 1024 * 1024
const LARK_TIMEOUT_MS = 45_000

/* ------------------------------------------------------------------ 进程 */

function runCommand(command, args, { timeoutMs = LARK_TIMEOUT_MS } = {}) {
  return new Promise((resolvePromise) => {
    let child
    try {
      child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      resolvePromise({ ok: false, code: -1, stdout: '', stderr: String(error?.message ?? error) })
      return
    }
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise(result)
    }
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* 已退出 */ }
      finish({ ok: false, code: -1, stdout, stderr: `${stderr}\n[工作台] 命令超时（${timeoutMs}ms）` })
    }, timeoutMs)
    child.stdout?.on('data', (chunk) => {
      if (stdout.length < MAX_OUTPUT) stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      if (stderr.length < MAX_OUTPUT) stderr += String(chunk)
    })
    child.on('error', (error) => finish({ ok: false, code: -1, stdout, stderr: String(error?.message ?? error) }))
    child.on('close', (code) => finish({ ok: code === 0, code: code ?? -1, stdout, stderr }))
  })
}

/** .cmd/.bat 包装脚本里的真实入口（本机 lark-cli 是 node 脚本，见 %dp0%\node_modules\...\run.js）。 */
function cmdShimTarget(command) {
  try {
    const text = readFileSync(command, 'utf8')
    const match = /%dp0%\\([^"\s]+\.js)/i.exec(text) || /%dp0%\\?([^"\s]+\.js)/i.exec(text)
    if (!match) return ''
    const target = resolve(dirname(command), match[1])
    return existsSync(target) ? target : ''
  } catch {
    return ''
  }
}

/**
 * lark-cli 在本机是 .cmd/.ps1 包装。
 * 能解析到真实 node 入口就直接跑（参数不再被 cmd.exe 重新解释一遍——带引号的 --json 经过 cmd.exe 会卡住），
 * 解析不到才退回 cmd.exe/PowerShell 包装。
 */
function shellWrapper(command) {
  const lower = command.toLowerCase()
  if (lower.endsWith('.ps1')) {
    return { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', command] }
  }
  if (lower.endsWith('.cmd') || lower.endsWith('.bat')) {
    const direct = cmdShimTarget(command)
    if (direct) {
      const nodeExe = join(dirname(command), 'node.exe')
      return {
        file: existsSync(nodeExe) ? nodeExe : 'node',
        args: [direct],
        fallback: { file: 'cmd.exe', args: ['/d', '/s', '/c', command] },
      }
    }
    return { file: 'cmd.exe', args: ['/d', '/s', '/c', command] }
  }
  return { file: command, args: [] }
}

/** 跑 lark-cli：直接跑真身失败（例如找不到 node）时，自动退回包装脚本再试一次。 */
async function runLark(wrapper, args) {
  const first = await runCommand(wrapper.file, [...wrapper.args, ...args])
  if (first.ok || !wrapper.fallback || first.code !== -1) return first
  return runCommand(wrapper.fallback.file, [...wrapper.fallback.args, ...args])
}

/** 解析 lark-cli 的位置：先配置、再 PATH（where.exe），最后退回裸名。 */
async function resolveLarkCli(configured) {
  if (configured) return configured
  if (process.platform === 'win32') {
    const probe = await runCommand('where.exe', ['lark-cli'], { timeoutMs: 10_000 })
    const lines = probe.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    // where.exe 会同时列出一个没有扩展名的 shell 垫片（spawn 不了），优先可执行的扩展名。
    const ranked = [...lines].sort((a, b) => extensionRank(a) - extensionRank(b))
    for (const candidate of ranked) {
      if (extensionRank(candidate) < 9) return candidate
      for (const ext of ['.cmd', '.exe', '.bat', '.ps1']) {
        const withExt = `${candidate}${ext}`
        if (existsSync(withExt)) return withExt
      }
    }
    if (lines[0]) return lines[0]
  }
  return 'lark-cli'
}

/** 越小越优先：真正的可执行入口排在没有扩展名的垫片前面。 */
function extensionRank(file) {
  const lower = String(file).toLowerCase()
  if (lower.endsWith('.cmd') || lower.endsWith('.exe') || lower.endsWith('.bat')) return 0
  if (lower.endsWith('.ps1')) return 1
  return 9
}

/* ----------------------------------------------------------------- 设置 */

const DEFAULT_SETTINGS = {
  sourceName: '',
  baseToken: '',
  tableId: '',
  viewId: '',
  titleField: '',
  statusField: '',
  projectField: '',
  ownerField: '',
  projectDir: '',
  skillsRoots: [],
  updatedAt: '',
}

function settingsFile(config) {
  return join(config.root, 'settings.json')
}

async function readSettings(config) {
  try {
    const raw = await readFile(settingsFile(config), 'utf8')
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_SETTINGS, ...(parsed && typeof parsed === 'object' ? parsed : {}) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

async function writeSettings(config, patch) {
  const current = await readSettings(config)
  const next = { ...current }
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (!(key in DEFAULT_SETTINGS)) continue
    if (value === undefined || value === null) continue
    next[key] = Array.isArray(value) ? value.map(String) : String(value)
  }
  next.updatedAt = new Date().toISOString()
  await mkdir(dirname(settingsFile(config)), { recursive: true })
  await writeFile(settingsFile(config), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}

/* --------------------------------------------------- 清单/看板的视图配置 */

const DEFAULT_VIEW = {
  // v3：多表 + 可扩展模块
  modules: [], // [{ key, tableKey, title, view: 'list' | 'board' | 'progress' }]
  activeModule: '',
  tables: {}, // tableKey -> 该表的页面配置切片
  // v2 单表时代的字段，保留为「任何表的兜底默认值」
  filters: [], // [{ field, values: [], text: '' }] 字段级筛选（选项多选 / 文本包含）
  groupField: '状态', // 卡片看板按哪个字段分模块
  cardSummaryField: '', // 卡片上展示的内容字段（空 = 原始需求）
  listFields: [], // 汇总清单显示的列（空 = 自动挑）
  cardFields: [], // 卡片上展示的字段（空 = 状态/负责人/优先级/期望完成时间）
  moduleOrder: [], // 模块手工排序
  hiddenModules: [], // 隐藏的模块
  collapsedModules: [], // 折叠的模块
  writeBackOnDrag: false, // 拖动卡片换模块时是否回写飞书
  railWidth: 168, // 左侧模块栏宽度（可拖动调整，120~380）
}

/** 侧边栏宽度：只收 120~380 之间的整数，别的当默认值。 */
function clampRailWidth(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return DEFAULT_VIEW.railWidth
  return Math.min(380, Math.max(120, Math.round(number)))
}

/** 单张表的配置切片：只接受已知键，防脏数据。 */
function sanitizeTableSlice(slice) {
  const out = {}
  if (!slice || typeof slice !== 'object') return out
  if (Array.isArray(slice.filters)) {
    out.filters = slice.filters
      .filter((item) => item && typeof item.field === 'string' && item.field)
      .map((item) => ({ field: item.field, values: asStringArray(item.values), text: String(item.text ?? '') }))
  }
  for (const key of ['groupField', 'cardSummaryField']) {
    if (typeof slice[key] === 'string') out[key] = slice[key]
  }
  for (const key of ['listFields', 'cardFields', 'moduleOrder', 'hiddenModules', 'collapsedModules']) {
    if (Array.isArray(slice[key])) out[key] = asStringArray(slice[key])
  }
  if (typeof slice.writeBackOnDrag === 'boolean') out.writeBackOnDrag = slice.writeBackOnDrag
  return out
}

/** 一个模块项：key 唯一，指向某张表 + 一种视图。 */
function sanitizeModule(item, index) {
  if (!item || typeof item !== 'object' || typeof item.tableKey !== 'string' || !item.tableKey) return null
  return {
    key: String(item.key || `${item.tableKey}#${index}`),
    tableKey: item.tableKey,
    title: String(item.title || item.tableKey),
    view: ['list', 'board', 'progress'].includes(item.view) ? item.view : 'list',
  }
}

function viewFile(config) {
  return join(config.root, 'view.json')
}

function asStringArray(value) {
  return Array.isArray(value) ? value.map(String) : []
}

async function readView(config) {
  try {
    const raw = await readFile(viewFile(config), 'utf8')
    const parsed = JSON.parse(raw)
    const source = parsed && typeof parsed === 'object' ? parsed : {}
    const tables = {}
    for (const [key, slice] of Object.entries(source.tables && typeof source.tables === 'object' ? source.tables : {})) {
      tables[key] = sanitizeTableSlice(slice)
    }
    return {
      ...DEFAULT_VIEW,
      ...source,
      modules: Array.isArray(source.modules) ? source.modules.map(sanitizeModule).filter(Boolean) : [],
      tables,
      filters: Array.isArray(source.filters)
        ? source.filters
            .filter((item) => item && typeof item.field === 'string' && item.field)
            .map((item) => ({ field: item.field, values: asStringArray(item.values), text: String(item.text ?? '') }))
        : [],
      listFields: asStringArray(source.listFields),
      cardFields: asStringArray(source.cardFields),
      moduleOrder: asStringArray(source.moduleOrder),
      hiddenModules: asStringArray(source.hiddenModules),
      collapsedModules: asStringArray(source.collapsedModules),
      writeBackOnDrag: Boolean(source.writeBackOnDrag),
      railWidth: clampRailWidth(source.railWidth),
    }
  } catch {
    return { ...DEFAULT_VIEW, modules: [], tables: {}, filters: [], listFields: [], cardFields: [], moduleOrder: [], hiddenModules: [], collapsedModules: [] }
  }
}

async function writeView(config, patch) {
  const current = await readView(config)
  const next = { ...current }
  if (Array.isArray(patch?.modules)) {
    next.modules = patch.modules.map(sanitizeModule).filter(Boolean)
  }
  if (typeof patch?.activeModule === 'string') next.activeModule = patch.activeModule
  if (patch?.tables && typeof patch.tables === 'object') {
    next.tables = { ...(current.tables ?? {}) }
    for (const [key, slice] of Object.entries(patch.tables)) {
      next.tables[key] = { ...(next.tables[key] ?? {}), ...sanitizeTableSlice(slice) }
    }
  }
  if (Array.isArray(patch?.filters)) {
    next.filters = patch.filters
      .filter((item) => item && typeof item.field === 'string' && item.field)
      .map((item) => ({ field: item.field, values: asStringArray(item.values), text: String(item.text ?? '') }))
  }
  if (typeof patch?.groupField === 'string') next.groupField = patch.groupField
  if (typeof patch?.cardSummaryField === 'string') next.cardSummaryField = patch.cardSummaryField
  if (Array.isArray(patch?.listFields)) next.listFields = asStringArray(patch.listFields)
  if (Array.isArray(patch?.cardFields)) next.cardFields = asStringArray(patch.cardFields)
  if (Array.isArray(patch?.moduleOrder)) next.moduleOrder = asStringArray(patch.moduleOrder)
  if (Array.isArray(patch?.hiddenModules)) next.hiddenModules = asStringArray(patch.hiddenModules)
  if (Array.isArray(patch?.collapsedModules)) next.collapsedModules = asStringArray(patch.collapsedModules)
  if (typeof patch?.writeBackOnDrag === 'boolean') next.writeBackOnDrag = patch.writeBackOnDrag
  if (patch?.railWidth !== undefined) next.railWidth = clampRailWidth(patch.railWidth)
  next.updatedAt = new Date().toISOString()
  await mkdir(dirname(viewFile(config)), { recursive: true })
  await writeFile(viewFile(config), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}

/* ----------------------------------- 多张飞书表（需求池 + 开发任务表…） */

const TASK_CONFIG_FILES = ['.dev-task-sources.json', join('doc', 'dev-task-sources.json')]

/** 读项目里已有的开发任务表配置（dev-task-sync 用的那一份）。 */
export async function loadTaskTables(projectDir) {
  if (!projectDir) return null
  for (const rel of TASK_CONFIG_FILES) {
    const file = join(projectDir, rel)
    const text = await readFile(file, 'utf8').catch(() => null)
    if (text === null) continue
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      continue
    }
    const raw = parsed?.projects && typeof parsed.projects === 'object' ? parsed.projects : {}
    const names = Object.keys(raw)
    if (!names.length) continue
    return {
      path: file,
      defaultProject: parsed.defaultProject && raw[parsed.defaultProject] ? parsed.defaultProject : names[0],
      projects: names.map((name) => ({ name, ...raw[name] })),
    }
  }
  return null
}

function tableSpecFrom({ key, label, kind, sourceName, entry, configPath, defaultIdentity }) {
  const url = parseBaseInput(entry?.baseUrl ?? '')
  return {
    key,
    label,
    kind,
    sourceName,
    tableName: String(entry?.tableName ?? ''),
    baseToken: url.baseToken,
    tableId: url.tableId || '',
    viewId: url.viewId || '',
    fieldMap: entry?.fields ?? null,
    filter: entry?.filter ?? null,
    identity: entry?.identity || defaultIdentity || 'user',
    configPath: configPath ?? '',
  }
}

/** 所有可用的表：项目里配了几张就有几张。 */
export async function listTables(config, settings) {
  const tables = []
  const requirement = await loadRequirementSources(settings.projectDir)
  for (const source of requirement?.sources ?? []) {
    tables.push(
      tableSpecFrom({
        key: `requirement:${source.name}`,
        label: `开发需求 · ${source.name}`,
        kind: 'requirement',
        sourceName: source.name,
        entry: source,
        configPath: requirement.path,
        defaultIdentity: config.identity,
      }),
    )
  }
  const tasks = await loadTaskTables(settings.projectDir)
  for (const project of tasks?.projects ?? []) {
    tables.push(
      tableSpecFrom({
        key: `task:${project.name}`,
        label: `开发任务 · ${project.name}`,
        kind: 'task',
        sourceName: project.name,
        entry: project,
        configPath: tasks.path,
        defaultIdentity: config.identity,
      }),
    )
  }
  const usable = tables.filter((table) => table.baseToken && table.tableId)
  return { tables: usable, requirementConfig: requirement?.path ?? '', taskConfig: tasks?.path ?? '' }
}

export async function findTable(config, settings, key) {
  const { tables, requirementConfig, taskConfig } = await listTables(config, settings)
  const wanted = String(key ?? '').trim()
  const found = wanted
    ? tables.find((table) => table.key === wanted) ??
      tables.find((table) => table.sourceName === wanted) ??
      tables.find((table) => table.tableId === wanted)
    : null
  return { table: found ?? tables[0] ?? null, tables, requirementConfig, taskConfig }
}

const recordCache = new Map()
const RECORD_CACHE_MS = 60_000

/** 读一张表的原始记录（60 秒内存缓存，可 fresh 强制刷新）。 */
async function fetchTableRecords(config, table, { fresh = false, limit = 2000 } = {}) {
  const cacheId = `${config.root}|${table.key}`
  const hit = recordCache.get(cacheId)
  if (!fresh && hit && Date.now() - hit.at < RECORD_CACHE_MS) return hit.payload
  const larkCli = await resolveLarkCli(config.larkCli)
  const wrapper = shellWrapper(larkCli)
  const common = ['base', '+record-list', '--base-token', table.baseToken, '--table-id', table.tableId, '--as', table.identity]
  if (table.viewId) common.push('--view-id', table.viewId)
  const pullDir = join(config.root, 'pull')
  await mkdir(pullDir, { recursive: true })
  const outFile = join(pullDir, `${String(table.tableId).replace(/[^\w.-]/g, '_') || 'records'}.ndjson`)
  const ndjson = await runLark(wrapper, [...common, '--limit', String(limit), '--format', 'ndjson', '--output', outFile, '--overwrite'])
  // 退出码不可全信：.cmd 包装下 lark-cli 会以非 0 退出，但 ndjson 文件其实写好了。以文件里的记录为准。
  const ndjsonText = await readFile(outFile, 'utf8').catch(() => '')
  await rm(outFile, { force: true }).catch(() => {})
  let records = parseLarkRecords(ndjsonText)
  let fetchMode = 'ndjson'
  let warning = ''
  let ndjsonError = ''
  if (!records.length) {
    ndjsonError = ndjson.ok ? 'ndjson 输出里没有解析到记录' : `lark-cli 退出码 ${ndjson.code ?? '?'}：${(ndjson.stderr || ndjson.stdout || '').trim().slice(0, 400)}`
  } else if (!ndjson.ok) {
    warning = `lark-cli 退出码 ${ndjson.code ?? '?'}，但 ndjson 文件里已有 ${records.length} 条记录，按记录显示。`
  }
  if (!records.length) {
    fetchMode = 'json'
    const json = await runLark(wrapper, [...common, '--limit', '200', '--format', 'json'])
    if (!json.ok) {
      return {
        ok: false,
        records: [],
        error: '读取飞书多维表格失败',
        detail: (json.stderr || json.stdout || ndjsonError || '').trim().slice(0, 1500),
        command: `lark-cli base +record-list --base-token ${table.baseToken} --table-id ${table.tableId} --as ${table.identity}`,
      }
    }
    const matrix = await matrixToRecords(wrapper, table, json.stdout)
    if (!matrix.aligned) {
      // 值矩阵没法对齐字段：宁可报错，也不能显示串了位的字段。
      return {
        ok: false,
        records: [],
        error: '这张表读到的列和字段名对不上，已停下不展示（避免显示错的字段）',
        detail: `${matrix.reason}；ndjson 通道失败原因：${ndjsonError || '未知'}`,
        command: `lark-cli base +record-list --base-token ${table.baseToken} --table-id ${table.tableId} --as ${table.identity} --format ndjson`,
      }
    }
    records = matrix.records
    warning = `ndjson 通道不可用，已退回值矩阵并按选项值校正列顺序（${matrix.reason}）。`
    if (ndjsonError) warning += `ndjson 失败原因：${ndjsonError.slice(0, 200)}`
  }
  const payload = { ok: true, records, fetchMode, warning, ndjsonError, at: Date.now() }
  recordCache.set(cacheId, { at: Date.now(), payload })
  return payload
}

/** 任意一张表的记录 -> 统一结构（标题/状态/负责人等按该表的字段映射取）。 */
export function normalizeTableRecord(record, fieldMap) {
  const fields = record?.fields && typeof record.fields === 'object' ? record.fields : record ?? {}
  const names = Object.keys(fields)
  const mapped = (logical) => {
    const actual = fieldMap?.[logical]
    return actual && actual in fields ? toPlain(fields[actual]) : ''
  }
  const title = mapped('title') || toPlain(fields[pickField(fields, '', ['需求标题', '任务标题', '标题', '名称', 'title', 'name'])]) || toPlain(fields[names[0]]) || '（无标题记录）'
  return {
    id: String(record?.record_id ?? record?.recordId ?? ''),
    title,
    status: mapped('status') || toPlain(fields[pickField(fields, '', ['状态', 'status', '进度'])]),
    owner: mapped('owner') || toPlain(fields[pickField(fields, '', ['负责人', '指派', 'owner', 'assignee', '处理人'])]),
    reviewer: mapped('reviewer'),
    priority: mapped('priority'),
    type: mapped('type'),
    module: mapped('module'),
    code: mapped('id'),
    requirementId: mapped('requirementId'),
    branch: mapped('branch'),
    mrLink: mapped('mrLink'),
    evidence: mapped('evidence'),
    estimate: mapped('estimate'),
    fieldNames: names,
    fields: Object.fromEntries(names.map((key) => [key, toPlain(fields[key])])),
  }
}

const PROGRESS_DONE = ['已完成', '通过', '已验收', '已合并', 'done', 'closed']
const PROGRESS_ACTIVE = ['开发中', '联调中', '评审中', '进行中', '已领取', 'in progress']

/** 按某个字段统计一张表的进度分布。 */
export function summarizeProgress(items, field) {
  const buckets = new Map()
  for (const item of items) {
    const value = String(item.fields?.[field] ?? '').trim() || '（未填写）'
    buckets.set(value, (buckets.get(value) ?? 0) + 1)
  }
  const list = [...buckets.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count)
  const sumOf = (words) =>
    list.filter((entry) => words.some((word) => entry.value.toLowerCase().includes(word.toLowerCase()))).reduce((sum, entry) => sum + entry.count, 0)
  const done = sumOf(PROGRESS_DONE)
  const active = sumOf(PROGRESS_ACTIVE)
  const total = items.length
  return { field, total, buckets: list, done, active, todo: Math.max(0, total - done - active), percent: total ? Math.round((done / total) * 100) : 0 }
}

/** 跨表总览：每张表的总数、按状态字段的进度分布、几条样例。 */
async function buildOverview(config, settings, { fresh = false } = {}) {
  const { tables } = await listTables(config, settings)
  const out = []
  for (const table of tables) {
    const payload = await fetchTableRecords(config, table, { fresh })
    if (!payload.ok) {
      out.push({ key: table.key, label: table.label, kind: table.kind, tableName: table.tableName, error: payload.error, detail: payload.detail })
      continue
    }
    const items = payload.records.map((record) => normalizeTableRecord(record, table.fieldMap))
    const field = table.fieldMap?.status || pickField(items[0]?.fields ?? {}, '', ['状态', 'status', '进度'])
    out.push({
      key: table.key,
      label: table.label,
      kind: table.kind,
      tableName: table.tableName,
      configPath: table.configPath,
      total: items.length,
      fetchMode: payload.fetchMode,
      warning: payload.warning,
      progress: field ? summarizeProgress(items, field) : null,
      sample: items.slice(0, 4).map((item) => ({ id: item.id, title: item.title, status: item.status, owner: item.owner })),
    })
  }
  return { tables: out, generatedAt: new Date().toISOString() }
}

/* ------------------------------------------- 工作台自己的执行记录（runs） */

function runsFile(config) {
  return join(config.root, 'runs.jsonl')
}

/** 事件流 -> 最新状态（每个 id 一条，附历史）。 */
export function foldRuns(events) {
  const map = new Map()
  for (const event of events) {
    if (!event || typeof event !== 'object') continue
    if (event.type === 'create') {
      const status = event.status || 'handed-off'
      map.set(event.id, { ...event, status, history: [{ at: event.at, status, note: event.note ?? '' }] })
      continue
    }
    if (event.type === 'update' && map.has(event.id)) {
      const run = map.get(event.id)
      run.status = event.status || run.status
      if (event.note !== undefined) run.note = event.note
      run.updatedAt = event.at
      run.history = [...(run.history ?? []), { at: event.at, status: run.status, note: event.note ?? '' }]
    }
  }
  return [...map.values()].sort((a, b) => String(b.at).localeCompare(String(a.at)))
}

async function readRuns(config) {
  const text = await readFile(runsFile(config), 'utf8').catch(() => '')
  const events = text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)
  return foldRuns(events)
}

async function appendRun(config, event) {
  await mkdir(dirname(runsFile(config)), { recursive: true })
  await appendFile(runsFile(config), `${JSON.stringify(event)}\n`, 'utf8')
  return event
}

/* ------------------------------------------------------------- 飞书需求 */

/** 从粘贴的飞书链接里抽出 base_token（/base/<token>）、table_id 与 view_id。 */
export function parseBaseInput(input) {
  const text = String(input ?? '').trim()
  if (!text) return { baseToken: '', tableId: '', viewId: '' }
  if (/^https?:/i.test(text)) {
    const base = /\/base\/([A-Za-z0-9]+)/.exec(text)
    const table = /[?&]table=([^&#]+)/.exec(text)
    const view = /[?&]view=([^&#]+)/.exec(text)
    return {
      baseToken: base ? base[1] : '',
      tableId: table ? decodeURIComponent(table[1]) : '',
      viewId: view ? decodeURIComponent(view[1]) : '',
    }
  }
  const parts = text.split(/[\s,|]+/).filter(Boolean)
  return { baseToken: parts[0] ?? '', tableId: parts[1] ?? '', viewId: '' }
}

function pickField(fields, explicit, hints) {
  if (explicit && explicit in fields) return explicit
  const names = Object.keys(fields)
  for (const hint of hints) {
    const hit = names.find((fieldName) => fieldName.toLowerCase().includes(hint.toLowerCase()))
    if (hit) return hit
  }
  return ''
}

function toPlain(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(toPlain).filter(Boolean).join('、')
  if (typeof value === 'object') {
    for (const key of ['text', 'name', 'value', 'link', 'en_name']) {
      if (key in value) return toPlain(value[key])
    }
    if ('file_token' in value) return '[附件]'
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

/** ndjson 里的一行可能就是一个裸记录对象（带 record_id），先认出来，别当成容器继续往下找。 */
function looksLikeRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && ('record_id' in value || 'recordId' in value)
}

export function extractRecords(payload) {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  if (looksLikeRecord(payload)) return [payload]
  for (const key of ['items', 'records', 'data']) {
    const value = payload[key]
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') {
      const nested = extractRecords(value)
      if (nested.length) return nested
    }
  }
  return []
}

export function parseLarkRecords(stdout) {
  const text = stdout.trim()
  if (!text) return []
  try {
    return extractRecords(JSON.parse(text))
  } catch {
    /* 不是整段 JSON，按 ndjson 逐行解析 */
  }
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) continue
    try {
      rows.push(...extractRecords(JSON.parse(trimmed)))
    } catch {
      /* 跳过无法解析的行 */
    }
  }
  return rows
}

export function normalizeRecord(record, settings, fieldMap) {
  const fields = record?.fields && typeof record.fields === 'object' ? record.fields : record ?? {}
  const names = Object.keys(fields)
  const mapped = (logical) => {
    const actual = fieldMap?.[logical]
    return actual && actual in fields ? toPlain(fields[actual]) : ''
  }
  const titleKey = pickField(fields, settings?.titleField, ['需求标题', '标题', '名称', 'title', 'name'])
  const statusKey = pickField(fields, settings?.statusField, ['状态', 'status', '进度'])
  const projectKey = pickField(fields, settings?.projectField, ['所属项目', '项目', '仓库', 'project', 'repo'])
  const ownerKey = pickField(fields, settings?.ownerField, ['负责人', '指派', 'owner', 'assignee', '处理人'])
  const title = mapped('title') || toPlain(fields[titleKey]) || toPlain(fields[names[0]]) || '（无标题记录）'
  return {
    id: String(record?.record_id ?? record?.recordId ?? record?.id ?? mapped('id') ?? ''),
    title,
    status: mapped('status') || toPlain(fields[statusKey]),
    project: mapped('project') || toPlain(fields[projectKey]),
    owner: mapped('owner') || toPlain(fields[ownerKey]),
    code: mapped('id'),
    rawRequirement: mapped('rawRequirement'),
    design: mapped('design'),
    designLink: mapped('designLink'),
    devSupplement: mapped('devSupplement'),
    acceptance: mapped('acceptance'),
    priority: mapped('priority'),
    type: mapped('type'),
    prompt: mapped('prompt'),
    fieldNames: names,
    fields: Object.fromEntries(names.map((key) => [key, toPlain(fields[key])])),
  }
}

/* ---------------------------------------------- 需求源（复用项目内配置） */

const SOURCE_CONFIG_FILES = ['.requirement-sources.json', join('doc', 'requirement-sources.json')]

/** 读项目里已有的需求源配置（就是 feishu-requirement-intake 用的那一份）。 */
export async function loadRequirementSources(projectDir) {
  if (!projectDir) return null
  for (const rel of SOURCE_CONFIG_FILES) {
    const file = join(projectDir, rel)
    const text = await readFile(file, 'utf8').catch(() => null)
    if (text === null) continue
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      continue
    }
    const raw = parsed?.sources && typeof parsed.sources === 'object' ? parsed.sources : {}
    const names = Object.keys(raw)
    if (!names.length) continue
    return {
      path: file,
      defaultSource: parsed.defaultSource && raw[parsed.defaultSource] ? parsed.defaultSource : names[0],
      sources: names.map((name) => ({ name, ...raw[name] })),
    }
  }
  return null
}

/** 决定这次读哪张表：优先项目里已有的需求源配置，其次工作台设置里手填的。 */
export async function resolveRequirementsSource(config, settings) {
  const detected = await loadRequirementSources(settings.projectDir)
  const wanted = settings.sourceName || detected?.defaultSource || ''
  const chosen = detected?.sources?.find((source) => source.name === wanted) ?? null
  const fromUrl = parseBaseInput(chosen?.baseUrl ?? '')
  const baseToken = fromUrl.baseToken || settings.baseToken
  const tableId = fromUrl.tableId || settings.tableId || chosen?.tableName || ''
  return {
    label: chosen ? chosen.name : '手动填写',
    sourceName: chosen ? chosen.name : '',
    configPath: detected?.path ?? '',
    baseToken,
    tableId,
    viewId: fromUrl.viewId || chosen?.viewId || settings.viewId,
    fieldMap: chosen?.fields ?? null,
    filter: chosen?.filter ?? null,
    identity: chosen?.identity || config.identity || 'user',
    configured: Boolean(baseToken && tableId),
  }
}

function publicSource(source) {
  return {
    label: source.label,
    sourceName: source.sourceName,
    configPath: source.configPath,
    tableId: source.tableId,
    viewId: source.viewId,
    identity: source.identity,
    filter: source.filter,
    fieldMap: source.fieldMap,
  }
}

/** json matrix（值矩阵）兜底：列名取自 +field-list，列数不一致就不猜。 */
/**
 * 值矩阵的列顺序不一定等于 +field-list 的顺序（真机上就遇到过整体错位）。
 * 用字段类型/选项值做校验：能唯一对上就用纠正后的顺序，对不上就明确报错，绝不猜着显示。
 */
export function alignMatrixColumns(rows, schema) {
  const width = Array.isArray(rows?.[0]) ? rows[0].length : 0
  if (!schema?.length || !width) return { names: [], aligned: false, reason: '没有可用的字段清单' }
  if (schema.length !== width) return { names: [], aligned: false, reason: `列数不一致（字段 ${schema.length} / 数据 ${width}）` }
  const byName = new Map(schema.map((field) => [field.name, field]))
  const optionSet = (field) => new Set((field?.options ?? []).map(String))
  const partsOf = (value) => {
    if (value === null || value === undefined || value === '') return []
    const list = Array.isArray(value) ? value : [value]
    return list.flatMap((item) => String(item).split(/[,，]/)).map((item) => item.trim()).filter(Boolean)
  }
  /** 某字段放在第 index 列时的违规数：选项字段的值必须落在它的选项里。 */
  const violations = (field, index) => {
    const options = optionSet(field)
    if (!options.size) return 0
    let bad = 0
    for (const row of rows) {
      const parts = partsOf(row[index])
      if (parts.some((part) => !options.has(part))) bad += 1
    }
    return bad
  }
  const scoreOf = (names) => names.reduce((sum, name, index) => sum + violations(byName.get(name), index), 0)
  const natural = schema.map((field) => field.name)
  const naturalScore = scoreOf(natural)
  if (naturalScore === 0) return { names: natural, aligned: true, reason: '列顺序与字段清单一致' }

  // 用「有选项的字段」去认列：能唯一装下它的列就钉住，其余字段按原顺序补空位。
  const pinned = new Map()
  const pinnedFields = new Set()
  for (const field of schema.filter((item) => (item.options ?? []).length)) {
    const matches = []
    for (let index = 0; index < width; index += 1) {
      if (pinned.has(index) || violations(field, index) !== 0) continue
      const filled = rows.some((row) => partsOf(row[index]).length)
      if (filled) matches.push(index)
    }
    if (matches.length === 1) {
      pinned.set(matches[0], field.name)
      pinnedFields.add(field.name)
    }
  }
  const rest = natural.filter((name) => !pinnedFields.has(name))
  const candidate = []
  for (let index = 0; index < width; index += 1) candidate.push(pinned.get(index) ?? rest.shift() ?? '')
  const candidateScore = scoreOf(candidate)
  if (candidate.length === width && candidate.every(Boolean) && candidateScore === 0) {
    return { names: candidate, aligned: true, reason: `按选项值纠正了列顺序（原违规 ${naturalScore} 处，纠正后 0 处）` }
  }
  return { names: [], aligned: false, reason: `列顺序对不上字段清单（违规 ${naturalScore} 处，自动纠正后仍有 ${candidateScore} 处）` }
}

/** 值矩阵自带字段名与记录 id：`data.fields` / `data.record_id_list` 与列一一对应，是权威顺序。 */
export function matrixShape(parsed) {
  const rows = parsed?.data?.data
  if (!Array.isArray(rows) || !rows.length || rows.every((row) => !Array.isArray(row))) return null
  const names = Array.isArray(parsed?.data?.fields)
    ? parsed.data.fields.map((field) => (typeof field === 'string' ? field : String(field?.name ?? '')))
    : []
  const recordIds = Array.isArray(parsed?.data?.record_id_list) ? parsed.data.record_id_list.map(String) : []
  return { rows, names, recordIds }
}

/** 值矩阵 + 字段名 -> 记录；列数与字段名对不上就返回空（宁可不显示，也不能串字段）。 */
export function recordsFromMatrix(rows, names, recordIds = []) {
  const width = Array.isArray(rows?.[0]) ? rows[0].length : -1
  if (!rows?.length || !names?.length || names.length !== width || names.some((name) => !name)) return []
  return rows.map((row, index) => ({
    record_id: recordIds[index] ?? '',
    fields: Object.fromEntries(names.map((name, column) => [name, row[column] ?? ''])),
  }))
}

/** 值矩阵 + 字段清单 -> 记录；对不上就返回空并带上原因（宁可不显示，也不能串字段）。 */
async function matrixToRecords(wrapper, source, stdout) {
  let parsed
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return { records: [], aligned: false, reason: '返回内容不是 JSON' }
  }
  const shape = matrixShape(parsed)
  if (!shape) return { records: extractRecords(parsed), aligned: true, reason: '按对象形式解析' }
  const { rows, names, recordIds } = shape
  // 首选返回体自带的字段名：它和列严格一一对应。
  const inline = recordsFromMatrix(rows, names, recordIds)
  if (inline.length) return { records: inline, aligned: true, reason: `按返回体自带的 ${names.length} 个字段名对齐` }

  // 没有自带字段名时，才退回 +field-list 并用选项值校正列顺序。
  const listed = await runLark(wrapper, [
    'base',
    '+field-list',
    '--base-token',
    source.baseToken,
    '--table-id',
    source.tableId,
    '--as',
    source.identity,
    '--format',
    'json',
  ])
  const schema = parseFieldSchema(listed.stdout)
  const alignment = alignMatrixColumns(rows, schema)
  if (!alignment.aligned) return { records: [], aligned: false, reason: alignment.reason }
  return { records: recordsFromMatrix(rows, alignment.names, recordIds), aligned: true, reason: alignment.reason }
}

function describeRead(source) {
  return `lark-cli base +record-list --base-token ${source.baseToken} --table-id ${source.tableId} --as ${source.identity}`
}

/** 给前端用的表信息（不含 token）。 */
function publicTable(table) {
  return {
    key: table.key,
    label: table.label,
    kind: table.kind,
    sourceName: table.sourceName,
    tableName: table.tableName,
    tableId: table.tableId,
    identity: table.identity,
    configPath: table.configPath,
    filter: table.filter,
    fieldMap: table.fieldMap,
  }
}

async function fetchRequirements(config, settings) {
  const source = await resolveRequirementsSource(config, settings)
  const described = publicSource(source)
  if (!source.configured) {
    return { configured: false, items: [], source: described, message: '还没有配置飞书多维表格（可以选项目里已有的需求源，或手动粘贴链接）' }
  }
  const larkCli = await resolveLarkCli(config.larkCli)
  const wrapper = shellWrapper(larkCli)
  const common = [
    'base',
    '+record-list',
    '--base-token',
    source.baseToken,
    '--table-id',
    source.tableId,
    '--as',
    source.identity,
  ]
  if (source.viewId) common.push('--view-id', source.viewId)

  const pullDir = join(config.root, 'pull')
  await mkdir(pullDir, { recursive: true })
  const outFile = join(pullDir, `${String(source.tableId).replace(/[^\w.-]/g, '_') || 'records'}.ndjson`)

  const ndjson = await runLark(wrapper, [...common, '--limit', '2000', '--format', 'ndjson', '--output', outFile, '--overwrite'])
  // 同上：.cmd 包装下退出码可能非 0，但文件里有记录就照样用。
  const ndjsonText = await readFile(outFile, 'utf8').catch(() => '')
  await rm(outFile, { force: true }).catch(() => {})
  let records = parseLarkRecords(ndjsonText)
  let fetchMode = 'ndjson'
  let warning = ''
  let ndjsonError = ''
  if (!records.length) {
    ndjsonError = ndjson.ok ? 'ndjson 输出里没有解析到记录' : `lark-cli 退出码 ${ndjson.code ?? '?'}：${(ndjson.stderr || ndjson.stdout || '').trim().slice(0, 400)}`
  } else if (!ndjson.ok) {
    warning = `lark-cli 退出码 ${ndjson.code ?? '?'}，但 ndjson 文件里已有 ${records.length} 条记录，按记录显示。`
  }
  if (!records.length) {
    fetchMode = 'json'
    const json = await runLark(wrapper, [...common, '--limit', '200', '--format', 'json'])
    if (!json.ok) {
      return {
        configured: true,
        items: [],
        source: described,
        error: '读取飞书多维表格失败',
        detail: (json.stderr || json.stdout || ndjsonError || '').trim().slice(0, 1500),
        command: describeRead(source),
      }
    }
    const matrix = await matrixToRecords(wrapper, source, json.stdout)
    if (!matrix.aligned) {
      return {
        configured: true,
        items: [],
        source: described,
        error: '这张表读到的列和字段名对不上，已停下不展示（避免显示错的字段）',
        detail: `${matrix.reason}；ndjson 通道失败原因：${ndjsonError || '未知'}`,
        command: `${describeRead(source)} --format ndjson`,
      }
    }
    records = matrix.records
    warning = `ndjson 通道不可用，已退回值矩阵并按选项值校正列顺序（${matrix.reason}）。`
    if (ndjsonError) warning += `ndjson 失败原因：${ndjsonError.slice(0, 200)}`
  }

  const items = records.map((record) => normalizeRecord(record, settings, source.fieldMap))
  return { configured: true, items, count: items.length, source: described, fetchMode, warning }
}

/** 单元格值的写法按字段类型来（单选/多选要数组，勾选是布尔，数字不加引号）。 */
export function cellValueFor(value, fieldType = '') {
  const type = String(fieldType ?? '').toLowerCase()
  if (value === null || value === undefined || value === '') return null
  if (type.includes('checkbox') || type.includes('check')) return value === true || value === 'true' || value === '是'
  if (type.includes('number') || type.includes('currency') || type.includes('percent') || type.includes('rating') || type === 'num') {
    const number = Number(value)
    return Number.isFinite(number) ? number : String(value)
  }
  if (type.includes('select')) return Array.isArray(value) ? value : [value]
  return Array.isArray(value) ? value : String(value)
}

/** 回写用 +record-batch-update：一次一条记录一个字段。 */
export function buildBatchUpdatePayload(recordId, field, value, fieldType) {
  return { update_records: { [String(recordId)]: { [String(field)]: cellValueFor(value, fieldType) } } }
}

async function updateRequirementStatus(config, settings, body) {
  const source = await resolveRequirementsSource(config, settings)
  if (!source.configured) return { ok: false, error: '还未配置飞书多维表格' }
  const recordId = String(body?.recordId ?? '').trim()
  const status = String(body?.status ?? '').trim()
  if (!recordId || !status) return { ok: false, error: '缺少记录 ID 或状态值' }
  const statusField = String(body?.field ?? '').trim() || settings.statusField || source.fieldMap?.status || '状态'
  const fieldType = String(body?.fieldType ?? '').trim() || (await cachedFieldType(config, source.tableId, statusField))
  const payload = buildBatchUpdatePayload(recordId, statusField, status, fieldType)
  const larkCli = await resolveLarkCli(config.larkCli)
  const wrapper = shellWrapper(larkCli)
  // 带引号的 JSON 经过 cmd.exe / PowerShell 包装会被再解释一遍，所以走 --json @文件；
  // lark-cli 只允许读当前目录、系统临时目录或 ~/files 下的文件。
  const payloadFile = join(tmpdir(), `dsh-rdw-write-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`)
  await writeFile(payloadFile, JSON.stringify(payload), 'utf8')
  const args = [
    'base',
    '+record-batch-update',
    '--base-token',
    source.baseToken,
    '--table-id',
    source.tableId,
    '--json',
    `@${payloadFile}`,
    '--as',
    source.identity,
  ]
  if (body?.dryRun) args.push('--dry-run')
  const result = await runLark(wrapper, args)
  await rm(payloadFile, { force: true }).catch(() => {})
  if (!result.ok) {
    return {
      ok: false,
      error: '回写飞书失败',
      detail: (result.stderr || result.stdout || '').trim().slice(0, 1500),
      command: `lark-cli base +record-batch-update --base-token ${source.baseToken} --table-id ${source.tableId} --json '${JSON.stringify(payload)}' --as ${source.identity}`,
      hint: '本机 lark-cli 写回用 +record-batch-update；字段名与选项值必须和表里完全一致。',
    }
  }
  return { ok: true, field: statusField, status, payload, dryRun: Boolean(body?.dryRun), result: (result.stdout || '').trim().slice(0, 400) }
}

/** 从缓存的字段清单里查某个字段的类型（拿不到就返回空，值按字符串写）。 */
async function cachedFieldType(config, tableId, fieldName) {
  try {
    const text = await readFile(fieldSchemaFile(config, tableId), 'utf8')
    const fields = parseFieldSchema(text)
    return fields.find((field) => field.name === fieldName)?.type ?? ''
  } catch {
    return ''
  }
}

/* --------------------------------------------------------- 表结构（字段） */

const FIELD_SCHEMA_TTL_MS = 10 * 60 * 1000

function fieldSchemaFile(config, tableId) {
  return join(config.root, `fields-${String(tableId).replace(/[^\w.-]/g, '_') || 'table'}.json`)
}

/** +field-list 的返回 -> 精简的字段清单（名称/类型/选项值）。 */
export function parseFieldSchema(stdout) {
  let parsed
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return []
  }
  const list = parsed?.data?.fields
  if (!Array.isArray(list)) return []
  return list
    .map((field) => ({
      name: String(field?.name ?? ''),
      type: String(field?.type ?? ''),
      options: Array.isArray(field?.options) ? field.options.map((option) => String(option?.name ?? '')).filter(Boolean) : [],
    }))
    .filter((field) => field.name)
}

async function fetchFieldSchema(config, settings, explicitTable) {
  const source = explicitTable ?? (await resolveRequirementsSource(config, settings))
  if (!source.configured && !explicitTable) {
    return { configured: false, fields: [], source: described, message: '还没有配置飞书多维表格' }
  }
  const described = explicitTable ? publicTable(explicitTable) : publicSource(source)
  const cacheFile = fieldSchemaFile(config, source.tableId)
  const cached = await readFile(cacheFile, 'utf8')
    .then((text) => JSON.parse(text))
    .catch(() => null)
  if (cached && Array.isArray(cached.fields) && Date.now() - Number(cached.cachedAt ?? 0) < FIELD_SCHEMA_TTL_MS) {
    return { configured: true, fields: cached.fields, source: described, cachedAt: cached.cachedAt, fromCache: true }
  }
  const larkCli = await resolveLarkCli(config.larkCli)
  const wrapper = shellWrapper(larkCli)
  const result = await runLark(wrapper, [
    'base',
    '+field-list',
    '--base-token',
    source.baseToken,
    '--table-id',
    source.tableId,
    '--as',
    source.identity,
    '--format',
    'json',
  ])
  const fields = result.ok ? parseFieldSchema(result.stdout) : []
  if (!fields.length) {
    if (cached?.fields?.length) {
      return { configured: true, fields: cached.fields, source: described, cachedAt: cached.cachedAt, fromCache: true, warning: '读表结构失败，用的是上次缓存' }
    }
    return {
      configured: true,
      fields: [],
      source: described,
      error: '读取表结构失败',
      detail: (result.stderr || result.stdout || '').trim().slice(0, 1000),
      command: `lark-cli base +field-list --base-token ${source.baseToken} --table-id ${source.tableId} --as ${source.identity}`,
    }
  }
  const cachedAt = Date.now()
  await mkdir(dirname(cacheFile), { recursive: true })
  await writeFile(cacheFile, `${JSON.stringify({ tableId: source.tableId, cachedAt, fields }, null, 2)}\n`, 'utf8')
  return { configured: true, fields, source: described, cachedAt }
}

/* ------------------------------------------------------------ 技能/规范 */

function isInside(child, parent) {
  const rel = relative(resolve(parent), resolve(child))
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(`..${sep}`))
}

function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!match) return {}
  const out = {}
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (!pair) continue
    let value = pair[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (value && value !== '>' && value !== '|') out[pair[1]] = value
  }
  return out
}

async function collectSkillsInRoot(root, group, items) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const file = join(root, entry.name, 'SKILL.md')
    const text = await readFile(file, 'utf8').catch(() => null)
    if (text === null) continue
    const front = parseFrontmatter(text)
    items.push({
      group,
      id: `${group}:${entry.name}`,
      name: front.name || entry.name,
      description: front.description || '',
      path: file,
      chars: text.length,
    })
  }
}

async function collectDocs(projectDir, items) {
  if (!projectDir) return
  const standardsDir = join(projectDir, 'doc', 'standards')
  const entries = await readdir(standardsDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
    items.push({ id: `doc:${entry.name}`, name: entry.name.replace(/\.md$/i, ''), path: join(standardsDir, entry.name) })
  }
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    const file = join(projectDir, name)
    const text = await readFile(file, 'utf8').catch(() => null)
    if (text !== null) items.push({ id: `doc:${name}`, name, path: file })
  }
}

function skillRootsFor(config, settings) {
  const roots = []
  const push = (label, path) => {
    if (!path) return
    if (roots.some((root) => root.path === path)) return
    roots.push({ label, path })
  }
  const dshHome = process.env.DSH_HOME
  if (dshHome) {
    push('全局 skill', join(dshHome, 'skills'))
  }
  const projectDir = settings.projectDir
  if (projectDir) {
    push('项目 skill (.claude)', join(projectDir, '.claude', 'skills'))
    push('项目 skill (.agents)', join(projectDir, '.agents', 'skills'))
    push('项目 skill (skills)', join(projectDir, 'skills'))
  }
  for (const extra of config.skillsRoots ?? []) push('自定义 skill', extra)
  for (const extra of settings.skillsRoots ?? []) push('自定义 skill', extra)
  return roots
}

async function listSkills(config, settings) {
  const roots = skillRootsFor(config, settings)
  const items = []
  for (const root of roots) await collectSkillsInRoot(root.path, root.label, items)
  const docs = []
  await collectDocs(settings.projectDir, docs)
  return { roots, items, docs, projectDir: settings.projectDir }
}

async function readSkillFile(config, settings, target) {
  const wanted = String(target ?? '').trim()
  if (!wanted) return { ok: false, error: '缺少文件路径' }
  const listing = await listSkills(config, settings)
  const allowed = [
    ...listing.items.map((item) => item.path),
    ...listing.docs.map((item) => item.path),
  ]
  const hit = allowed.find((path) => resolve(path) === resolve(wanted))
  if (!hit) return { ok: false, error: '该路径不在本工作台可读的技能/规范范围内' }
  const text = await readFile(hit, 'utf8').catch(() => null)
  if (text === null) return { ok: false, error: '文件读不到' }
  return { ok: true, path: hit, text }
}

/* -------------------------------------------------------------- HTTP 层 */

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolvePromise) => {
    let data = ''
    let settled = false
    const done = (payload) => {
      if (settled) return
      settled = true
      resolvePromise(payload)
    }
    const parse = () => {
      if (!data) return {}
      try {
        return JSON.parse(data)
      } catch {
        return {}
      }
    }
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 1024 * 1024) req.destroy()
    })
    req.on('end', () => done(parse()))
    // 客户端半路断开时也别把请求挂死
    req.on('close', () => done(parse()))
    req.on('error', () => done({}))
  })
}

export function apply(ctx, config) {
  const handler = async (req, res) => {
    let url
    try {
      url = new URL(req.url ?? '/', 'http://127.0.0.1')
    } catch {
      return sendJson(res, 400, { error: 'bad url' })
    }
    const route = url.pathname.slice(API_PREFIX.length) || '/'
    try {
      if (route === '/state' && req.method === 'GET') {
        const settings = await readSettings(config)
        const larkCli = await resolveLarkCli(config.larkCli)
        const resolved = await resolveRequirementsSource(config, settings)
        return sendJson(res, 200, {
          settings,
          larkCli,
          identity: config.identity || 'user',
          configured: resolved.configured,
          source: publicSource(resolved),
        })
      }

      if (route === '/settings' && req.method === 'POST') {
        const body = await readBody(req)
        const next = { ...body }
        if (typeof next.baseInput === 'string' && next.baseInput.trim()) {
          const parsed = parseBaseInput(next.baseInput)
          if (parsed.baseToken) next.baseToken = parsed.baseToken
          if (parsed.tableId) next.tableId = parsed.tableId
        }
        delete next.baseInput
        const settings = await writeSettings(config, next)
        return sendJson(res, 200, { settings })
      }

      if (route === '/sources' && req.method === 'GET') {
        const settings = await readSettings(config)
        const detected = await loadRequirementSources(settings.projectDir)
        const names = (detected?.sources ?? []).map((item) => item.name)
        return sendJson(res, 200, {
          found: Boolean(detected),
          path: detected?.path ?? '',
          defaultSource: detected?.defaultSource ?? '',
          selected: names.includes(settings.sourceName) ? settings.sourceName : detected?.defaultSource ?? '',
          sources: (detected?.sources ?? []).map((item) => ({
            name: item.name,
            tableName: item.tableName ?? '',
            baseUrl: item.baseUrl ?? '',
            identity: item.identity ?? '',
            fields: item.fields ?? null,
            filter: item.filter ?? null,
          })),
        })
      }

      if (route === '/fields' && req.method === 'GET') {
        const settings = await readSettings(config)
        const tableKey = url.searchParams.get('table')
        if (tableKey) {
          const { table } = await findTable(config, settings, tableKey)
          if (!table) return sendJson(res, 404, { error: '没有找到这张表' })
          return sendJson(res, 200, await fetchFieldSchema(config, settings, table))
        }
        return sendJson(res, 200, await fetchFieldSchema(config, settings))
      }

      if (route === '/tables' && req.method === 'GET') {
        const settings = await readSettings(config)
        const { tables } = await listTables(config, settings)
        return sendJson(res, 200, {
          projectDir: settings.projectDir,
          tables: tables.map((table) => ({
            key: table.key,
            label: table.label,
            kind: table.kind,
            sourceName: table.sourceName,
            tableName: table.tableName,
            tableId: table.tableId,
            identity: table.identity,
            configPath: table.configPath,
            fields: table.fieldMap,
            filter: table.filter,
          })),
        })
      }

      if (route === '/records' && req.method === 'GET') {
        const settings = await readSettings(config)
        const fresh = url.searchParams.get('fresh') === '1'
        const { table, tables } = await findTable(config, settings, url.searchParams.get('table'))
        if (!table) return sendJson(res, 200, { configured: false, items: [], message: '项目里还没有配到飞书表' })
        const payload = await fetchTableRecords(config, table, { fresh })
        if (!payload.ok) {
          return sendJson(res, 200, { configured: true, items: [], table: publicTable(table), error: payload.error, detail: payload.detail, command: payload.command })
        }
        const items = payload.records.map((record) => normalizeTableRecord(record, table.fieldMap))
        return sendJson(res, 200, {
          configured: true,
          table: publicTable(table),
          availableTables: tables.map((entry) => ({ key: entry.key, label: entry.label, kind: entry.kind })),
          items,
          count: items.length,
          fetchMode: payload.fetchMode,
          warning: payload.warning,
        })
      }

      if (route === '/overview' && req.method === 'GET') {
        const settings = await readSettings(config)
        const fresh = url.searchParams.get('fresh') === '1'
        const overview = await buildOverview(config, settings, { fresh })
        const runs = await readRuns(config)
        return sendJson(res, 200, { ...overview, runs })
      }

      if (route === '/runs' && req.method === 'GET') {
        return sendJson(res, 200, { items: await readRuns(config) })
      }

      if (route === '/runs' && req.method === 'POST') {
        const body = await readBody(req)
        const title = String(body?.title ?? '').trim()
        if (!title) return sendJson(res, 400, { error: '缺少需求/任务标题' })
        const event = {
          type: 'create',
          id: `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          at: new Date().toISOString(),
          tableKey: String(body?.tableKey ?? ''),
          recordId: String(body?.recordId ?? ''),
          title,
          projectDir: String(body?.projectDir ?? ''),
          status: ['handed-off', 'in-progress', 'done', 'blocked'].includes(body?.status) ? body.status : 'handed-off',
          note: String(body?.note ?? ''),
        }
        await appendRun(config, event)
        return sendJson(res, 200, { ok: true, run: event, items: await readRuns(config) })
      }

      if (route === '/runs/status' && req.method === 'POST') {
        const body = await readBody(req)
        const id = String(body?.id ?? '').trim()
        const status = String(body?.status ?? '').trim()
        if (!id || !['handed-off', 'in-progress', 'done', 'blocked'].includes(status)) {
          return sendJson(res, 400, { error: '缺少执行记录 id 或状态不合法' })
        }
        await appendRun(config, { type: 'update', id, at: new Date().toISOString(), status, note: String(body?.note ?? '') })
        return sendJson(res, 200, { ok: true, items: await readRuns(config) })
      }

      if (route === '/view' && req.method === 'GET') {
        return sendJson(res, 200, { view: await readView(config) })
      }

      if (route === '/view' && req.method === 'POST') {
        const body = await readBody(req)
        return sendJson(res, 200, { view: await writeView(config, body) })
      }

      if (route === '/requirements' && req.method === 'GET') {
        const settings = await readSettings(config)
        const tableKey = url.searchParams.get('table')
        if (!tableKey) return sendJson(res, 200, await fetchRequirements(config, settings))
        const fresh = url.searchParams.get('fresh') === '1'
        const { table, tables } = await findTable(config, settings, tableKey)
        if (!table) return sendJson(res, 200, { configured: false, items: [], message: '没有找到这张表（项目里还没配到）' })
        const payload = await fetchTableRecords(config, table, { fresh })
        if (!payload.ok) {
          return sendJson(res, 200, { configured: true, items: [], source: publicTable(table), error: payload.error, detail: payload.detail, command: payload.command })
        }
        const items = payload.records.map((record) => normalizeTableRecord(record, table.fieldMap))
        return sendJson(res, 200, {
          configured: true,
          source: publicTable(table),
          availableTables: tables.map((entry) => ({ key: entry.key, label: entry.label, kind: entry.kind })),
          items,
          count: items.length,
          fetchMode: payload.fetchMode,
          warning: payload.warning,
        })
      }

      if (route === '/requirement/status' && req.method === 'POST') {
        const settings = await readSettings(config)
        const body = await readBody(req)
        const result = await updateRequirementStatus(config, settings, body)
        return sendJson(res, result.ok ? 200 : 502, result)
      }

      if (route === '/skills' && req.method === 'GET') {
        const settings = await readSettings(config)
        return sendJson(res, 200, await listSkills(config, settings))
      }

      if (route === '/skill' && req.method === 'GET') {
        const settings = await readSettings(config)
        const result = await readSkillFile(config, settings, url.searchParams.get('path'))
        return sendJson(res, result.ok ? 200 : 404, result)
      }

      return sendJson(res, 404, { error: `未知接口 ${route}` })
    } catch (error) {
      return sendJson(res, 500, { error: String(error?.message ?? error) })
    }
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler }))
}
