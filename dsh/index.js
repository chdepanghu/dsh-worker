/**
 * AI Native 工作台（包名沿用 dsh-requirement-dev-workbench）· 服务端入口
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
import { readFile, mkdir, readdir, rm, stat, writeFile, appendFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
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
  expert: '',
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
  // 不静默丢表：认不出来的表要留下原因，界面上可见（诊断报告 P3）。
  const usable = []
  const dropped = []
  for (const table of tables) {
    if (!table.baseToken) {
      dropped.push({ key: table.key, label: table.label, configPath: table.configPath, reason: '缺 baseToken：配置里的链接认不出多维表格 base，请贴完整链接' })
      continue
    }
    if (!table.tableId) {
      dropped.push({ key: table.key, label: table.label, configPath: table.configPath, reason: '缺 tableId：配置里没有 table 参数' })
      continue
    }
    // 飞书表 id 恒为 tblxxxx。以前把「表名」当 id 传下去，lark-cli 只会报一句看不懂的错。
    if (!/^tbl[A-Za-z0-9]+$/.test(table.tableId)) {
      dropped.push({
        key: table.key,
        label: table.label,
        configPath: table.configPath,
        reason: `tableId 不像飞书表 id（${table.tableId}）：链接里应该是 ?table=tblxxxx，不能直接写表名`,
      })
      continue
    }
    usable.push(table)
  }
  return { tables: usable, dropped, requirementConfig: requirement?.path ?? '', taskConfig: tasks?.path ?? '' }
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
// 最近一次上报的会话 id（来自对话输入框的专家入口），只存内存，不落盘、不含任何凭证。
let composerSession = { id: '', at: 0 }
/** 界面自检上报的最后一帧（内存里，用于排障；不落盘、无凭证）。 */
let uiMetrics = null
const RECORD_CACHE_MS = 60_000

/** 读一张表的原始记录（60 秒内存缓存，可 fresh 强制刷新）。 */
/**
 * lark-cli 的 `--output` 只认三个根：当前工作目录、账号临时目录、home 下的 files。
 * 写到 DSH 数据目录会被判为 "unsafe output path"（退出码 2），所以这里统一落临时目录，
 * 读完立刻删。文件名带随机后缀，避免同一张表并发读时互相覆盖。
 */
function larkOutputFile(tableId, label = 'records') {
  const safe = String(tableId).replace(/[^\w.-]/g, '_') || label
  const rand = Math.random().toString(36).slice(2, 8)
  return join(tmpdir(), `dsh-rdw-pull-${safe}-${Date.now().toString(36)}-${rand}.ndjson`)
}

/** 从 lark-cli 的 stderr/stdout 里摘一小段人话，用于报错。 */
function larkSnippet(result) {
  return String(result?.stderr || result?.stdout || '').trim().slice(0, 400)
}

/** 删掉一次 ndjson 拉取留下的全部文件：本体 + lark-cli 伴生的 .manifest.json。 */
async function cleanupLarkOutput(outFile) {
  const manifest = String(outFile).replace(/\.ndjson$/, '.manifest.json')
  await rm(outFile, { force: true }).catch(() => {})
  if (manifest !== outFile) await rm(manifest, { force: true }).catch(() => {})
}

/**
 * 读一张表的记录：ndjson 优先，只有 ndjson **真的坏了** 才退回值矩阵。
 *
 * 关键区分（v3.7.1 修正）：ndjson 正常退出、文件也写出来了，只是 0 条记录 —— 那多半是
 * 这张表本来就是空的，不该报「通道不可用」。所以此时再用值矩阵交叉确认一次：
 * 值矩阵也 0 条 → 安静地按空表显示；值矩阵有数据 → 用值矩阵并说明原因。
 * 返回 { records, fetchMode, warning, ndjsonError, failure }，failure 非空表示读失败要报错。
 */
async function readRecordsWithFallback({ wrapper, common, outFile, limit = 2000, matrixReader, command = '' }) {
  const ndjson = await runLark(wrapper, [...common, '--limit', String(limit), '--format', 'ndjson', '--output', outFile, '--overwrite'])
  // 退出码不可全信：.cmd 包装下 lark-cli 会以非 0 退出，但 ndjson 文件其实写好了。以文件里的记录为准。
  const ndjsonText = await readFile(outFile, 'utf8').catch(() => null)
  // lark-cli 除了 ndjson 还会写一个伴生的 .manifest.json，两个都要清掉，别在临时目录留垃圾。
  await cleanupLarkOutput(outFile)
  const records = ndjsonText === null ? [] : parseLarkRecords(ndjsonText)
  let ndjsonError = ''
  if (ndjsonText === null) ndjsonError = `lark-cli 没写出 ndjson 文件（退出码 ${ndjson.code ?? '?'}）：${larkSnippet(ndjson)}`
  else if (!ndjson.ok) ndjsonError = `lark-cli 退出码 ${ndjson.code ?? '?'}：${larkSnippet(ndjson)}`
  if (records.length) {
    return {
      records,
      fetchMode: 'ndjson',
      warning: ndjson.ok ? '' : `lark-cli 退出码 ${ndjson.code ?? '?'}，但 ndjson 里已有 ${records.length} 条记录，按记录显示。`,
      ndjsonError,
      failure: null,
    }
  }
  // ndjson 一条都没有：用值矩阵交叉确认「表是空的」还是「通道坏了」。
  const json = await runLark(wrapper, [...common, '--limit', '200', '--format', 'json'])
  if (!json.ok) {
    if (ndjsonError) {
      return { records: [], fetchMode: 'ndjson', warning: '', ndjsonError, failure: { error: '读取飞书多维表格失败', detail: (json.stderr || json.stdout || ndjsonError).trim().slice(0, 1500), command } }
    }
    return { records: [], fetchMode: 'ndjson', warning: `值矩阵通道这次没读到（${larkSnippet(json) || '无输出'}），本次按 0 条显示。`, ndjsonError, failure: null }
  }
  const matrix = await matrixReader(json.stdout)
  if (!matrix.aligned) {
    // 值矩阵没法对齐字段：宁可报错，也不能显示串了位的字段。
    if (ndjsonError) {
      return { records: [], fetchMode: 'ndjson', warning: '', ndjsonError, failure: { error: '这张表读到的列和字段名对不上，已停下不展示（避免显示错的字段）', detail: `${matrix.reason}；ndjson 通道失败原因：${ndjsonError}`, command } }
    }
    return { records: [], fetchMode: 'ndjson', warning: '', ndjsonError, failure: null }
  }
  if (!matrix.records.length) {
    // 两个通道都读到 0 条：这张表就是空的（不是通道坏），安静显示。
    return { records: [], fetchMode: 'ndjson', warning: '', ndjsonError: '', failure: null }
  }
  return {
    records: matrix.records,
    fetchMode: 'json',
    warning: `ndjson 通道没解析到记录，已用值矩阵读到 ${matrix.records.length} 条（${matrix.reason}）。${ndjsonError ? `ndjson 失败原因：${ndjsonError.slice(0, 200)}` : ''}`,
    ndjsonError,
    failure: null,
  }
}

async function fetchTableRecords(config, table, { fresh = false, limit = 2000 } = {}) {
  const cacheId = `${config.root}|${table.key}`
  const hit = recordCache.get(cacheId)
  if (!fresh && hit && Date.now() - hit.at < RECORD_CACHE_MS) return hit.payload
  const larkCli = await resolveLarkCli(config.larkCli)
  const wrapper = shellWrapper(larkCli)
  const common = ['base', '+record-list', '--base-token', table.baseToken, '--table-id', table.tableId, '--as', table.identity]
  if (table.viewId) common.push('--view-id', table.viewId)
  const read = await readRecordsWithFallback({
    wrapper,
    common,
    outFile: larkOutputFile(table.tableId, 'records'),
    limit,
    command: `lark-cli base +record-list --base-token ${table.baseToken} --table-id ${table.tableId} --as ${table.identity} --format ndjson`,
    matrixReader: (stdout) => matrixToRecords(wrapper, table, stdout),
  })
  if (read.failure) {
    return { ok: false, records: [], error: read.failure.error, detail: read.failure.detail, command: read.failure.command }
  }
  const payload = { ok: true, records: read.records, fetchMode: read.fetchMode, warning: read.warning, ndjsonError: read.ndjsonError, at: Date.now() }
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
  const { tables, dropped } = await listTables(config, settings)
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
  return { tables: out, dropped, generatedAt: new Date().toISOString() }
}

/* ------------------------------------------- 工作台自己的执行记录（runs） */

function runsFile(config) {
  return join(config.root, 'runs.jsonl')
}

/**
 * 一条执行记录属于哪个任务：优先「表 + 记录 id」，没有 id 时退到标题。
 * 「同一个任务只留一条记录」全靠这个键 —— 重复生成开发指令时更新这一条，而不是再加一条。
 */
export function runTaskKey(run) {
  const recordId = String(run?.recordId ?? '').trim()
  if (recordId) return `${String(run?.tableKey ?? '').trim()}|${recordId}`
  const title = String(run?.title ?? '').trim()
  if (title) return `title|${title}`
  return `id|${String(run?.id ?? '').trim()}`
}

/** 事件流 -> 最新状态（每个任务一条，附历史与「生成过几次」）。 */
export function foldRuns(events) {
  const map = new Map()
  for (const event of events) {
    if (!event || typeof event !== 'object') continue
    if (event.type === 'create') {
      const status = event.status || 'handed-off'
      map.set(event.id, { ...event, status, generated: Number(event.generated ?? 1), history: [{ at: event.at, status, note: event.note ?? '' }] })
      continue
    }
    if (event.type === 'regenerate' && map.has(event.id)) {
      // 同一条任务又生成了一次：刷新时间/项目/备注，保留用户已经标好的状态，只把次数 +1。
      const run = map.get(event.id)
      run.at = event.at ?? run.at
      if (event.title) run.title = event.title
      if (event.projectDir !== undefined) run.projectDir = event.projectDir
      if (event.note) run.note = event.note
      run.generated = Number(run.generated ?? 1) + 1
      run.history = [...(run.history ?? []), { at: event.at, status: run.status, note: event.note || '再次生成开发指令' }]
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
  // 老记录里同一条任务可能已经被点出好几条：这里按任务键合并，取最近的一条当代表，
  // 历史合并、次数累加，状态以「最近一次显式改动」为准 —— 于是总览里一个任务只有一条。
  const byTask = new Map()
  for (const run of [...map.values()].sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
    const key = runTaskKey(run)
    const hit = byTask.get(key)
    if (!hit) {
      byTask.set(key, { ...run, generated: Number(run.generated ?? 1) })
      continue
    }
    const rank = (item) => String(item.updatedAt ?? item.at ?? '')
    const newer = String(run.at ?? '') >= String(hit.at ?? '') ? run : hit
    const older = newer === run ? hit : run
    const statusSource = rank(newer) >= rank(older) ? newer : older
    byTask.set(key, {
      ...newer,
      status: statusSource.status ?? newer.status,
      note: (rank(newer) >= rank(older) ? newer.note : older.note) ?? newer.note ?? '',
      generated: Number(older.generated ?? 1) + Number(newer.generated ?? 1),
      history: [...(older.history ?? []), ...(newer.history ?? [])].sort((a, b) => String(a.at).localeCompare(String(b.at))),
      mergedIds: [...new Set([...(older.mergedIds ?? [older.id]), ...(newer.mergedIds ?? [newer.id])])],
    })
  }
  return [...byTask.values()].sort((a, b) => String(b.at).localeCompare(String(a.at)))
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

  const read = await readRecordsWithFallback({
    wrapper,
    common,
    outFile: larkOutputFile(source.tableId, 'source-records'),
    limit: 2000,
    command: `${describeRead(source)} --format ndjson`,
    matrixReader: (stdout) => matrixToRecords(wrapper, source, stdout),
  })
  if (read.failure) {
    return { configured: true, items: [], source: described, error: read.failure.error, detail: read.failure.detail, command: read.failure.command }
  }
  const { records, fetchMode, warning } = read

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

/** 角色/专家定义：<目录>/agents/<id>.md（WorkBuddy 的专家也是这一种文件）。 */
async function collectExpertsInRoot(root, items) {
  const agentsDir = join(dirname(root.path), 'agents')
  const agentEntries = await readdir(agentsDir, { withFileTypes: true }).catch(() => [])
  for (const entry of agentEntries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue
    const file = join(agentsDir, entry.name)
    const text = await readFile(file, 'utf8').catch(() => null)
    if (text === null) continue
    const front = parseFrontmatter(text)
    const id = entry.name.replace(/\.md$/i, '')
    items.push({
      kind: 'agent',
      scope: root.scope,
      convention: root.convention,
      rootPath: agentsDir,
      group: `${root.label} · 角色/规范`,
      id: `agent:${id}`,
      agentId: id,
      name: front.name || id,
      dirName: id,
      displayName: front.displayName || '',
      profession: front.profession || '',
      description: front.description || '',
      maxTurns: front.maxTurns ? Number(front.maxTurns) || 0 : 0,
      tags: front.tags ? String(front.tags).split(/[,，]/).map((tag) => tag.trim()).filter(Boolean) : [],
      path: file,
      chars: text.length,
    })
  }
  return agentsDir
}

/** 技能目录：技能本体 + 同名目录下的角色/专家文件（.claude/agents/*.md 这类）。 */
async function collectSkillsInRoot(root, items) {
  const entries = await readdir(root.path, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const file = join(root.path, entry.name, 'SKILL.md')
    const text = await readFile(file, 'utf8').catch(() => null)
    if (text === null) continue
    const front = parseFrontmatter(text)
    items.push({
      kind: 'skill',
      scope: root.scope,
      convention: root.convention,
      rootPath: root.path,
      group: root.label,
      id: `${root.label}:${entry.name}`,
      name: front.name || entry.name,
      dirName: entry.name,
      description: front.description || '',
      path: file,
      chars: text.length,
    })
  }
  await collectExpertsInRoot(root, items)
}

/** DeepSeek Harness 通用技能根（跨项目可用）；没有就返回空。 */
function harnessSkillDir() {
  const dshHome = process.env.DSH_HOME
  return dshHome ? join(dshHome, 'skills') : ''
}

/** 技能名统一成 kebab-case，顺带挡掉路径穿越。 */
export function slugifySkillName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

/** 生成一份能直接被 DSH 识别的 SKILL.md（frontmatter + 正文）。 */
export function renderSkillMarkdown({ name, description, whenToUse = '', steps = [], notes = [] }) {
  const lines = ['---', `name: ${name}`, `description: ${String(description).replace(/\s+/g, ' ').trim()}`, '---', '', `# ${name}`, '']
  lines.push('## 什么时候用', '', whenToUse || String(description).trim() || '（补一句：什么场景下该用这个技能）', '')
  lines.push('## 怎么做', '')
  const stepLines = (steps ?? []).map((line) => String(line).trim()).filter(Boolean)
  if (stepLines.length) for (const [index, line] of stepLines.entries()) lines.push(`${index + 1}. ${line}`)
  else lines.push('1. （写下这个技能的固定步骤）')
  lines.push('', '## 注意', '')
  const noteLines = (notes ?? []).map((line) => String(line).trim()).filter(Boolean)
  if (noteLines.length) for (const line of noteLines) lines.push(`- ${line}`)
  else lines.push('- （写下易错点/红线）')
  return `${lines.join('\n')}\n`
}

/** 新建技能：默认写进 DeepSeek Harness 通用技能根，也可以写进当前项目的 .claude/skills。 */
async function createSkill(config, settings, body) {
  const name = slugifySkillName(body?.name)
  if (!name) return { ok: false, error: '技能名称请用小写字母、数字和连字符（例如 java-code-review）' }
  const description = String(body?.description ?? '').trim()
  if (!description) return { ok: false, error: '请写一句技能描述（AI 靠它判断什么时候用这个技能）' }
  const scope = body?.scope === 'project' ? 'project' : 'harness'
  let dir = ''
  if (scope === 'project') {
    const projectDir = String(settings.projectDir ?? '').trim()
    if (!projectDir) return { ok: false, error: '还没选项目目录，先选一个再创建项目内技能' }
    dir = join(projectDir, '.claude', 'skills', name)
  } else {
    const root = harnessSkillDir()
    if (!root) return { ok: false, error: '取不到 DSH_HOME，定位不到 DeepSeek Harness 技能目录' }
    dir = join(root, name)
  }
  const file = join(dir, 'SKILL.md')
  if (existsSync(file) && !body?.overwrite) {
    return { ok: false, error: `技能「${name}」已存在，换个名字或先删掉它`, path: file, exists: true }
  }
  const text = renderSkillMarkdown({
    name,
    description,
    whenToUse: String(body?.whenToUse ?? '').trim(),
    steps: String(body?.steps ?? '').split('\n'),
    notes: String(body?.notes ?? '').split('\n'),
  })
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(file, text, 'utf8')
  } catch (error) {
    return { ok: false, error: `写技能文件失败：${String(error?.message ?? error)}`, path: file }
  }
  return { ok: true, name, scope, path: file, dir, chars: text.length, overwrote: Boolean(body?.overwrite) }
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

/** 项目内的技能目录约定：与 DSH 技能管理器的项目来源一致，另加 .agent / .code 两个别名。 */
const SKILL_CONVENTIONS = [
  { dir: '.dsh', label: '.dsh（本项目专用）' },
  { dir: '.agents', label: '.agents' },
  { dir: '.agent', label: '.agent' },
  { dir: '.claude', label: '.claude' },
  { dir: '.codex', label: '.codex' },
  { dir: '.code', label: '.code' },
  { dir: '.cursor', label: '.cursor' },
  { dir: '.gemini', label: '.gemini' },
  { dir: '.github', label: '.github' },
  { dir: '.opencode', label: '.opencode' },
  { dir: '', label: 'skills' },
]

/** 用户级（全局）技能目录：环境变量可以改根，和 DSH 技能管理器保持一致。 */
function globalSkillDirs() {
  const home = process.env.USERPROFILE || process.env.HOME || ''
  if (!home) return []
  const pick = (envName, fallback) => process.env[envName] || join(home, fallback)
  return [
    { convention: '.agents', label: '全局 skill · .agents（公共 Agent）', path: join(pick('DSH_AGENTS_HOME', '.agents'), 'skills') },
    { convention: '.claude', label: '全局 skill · .claude（Claude）', path: join(pick('DSH_CLAUDE_HOME', '.claude'), 'skills') },
    { convention: '.codex', label: '全局 skill · .codex（Codex）', path: join(pick('DSH_CODEX_HOME', '.codex'), 'skills') },
    { convention: '.gemini', label: '全局 skill · .gemini（Gemini）', path: join(pick('DSH_GEMINI_HOME', '.gemini'), 'skills') },
    { convention: '.cursor', label: '全局 skill · .cursor', path: join(home, '.cursor', 'skills') },
    { convention: '.cc-switch', label: '全局 skill · .cc-switch', path: join(home, '.cc-switch', 'skills') },
    { convention: '.opencode', label: '全局 skill · .opencode', path: join(home, '.opencode', 'skills') },
    { convention: 'skills', label: '全局 skill · 用户 skills 目录', path: join(home, 'skills') },
  ]
}

function skillRootsFor(config, settings) {
  const roots = []
  const push = (scope, convention, label, path, note = '') => {
    if (!path) return
    const key = resolve(path).toLowerCase()
    if (roots.some((root) => resolve(root.path).toLowerCase() === key)) return
    roots.push({ scope, convention, label, path, note, exists: existsSync(path) })
  }
  // 1) DeepSeek Harness 自己的技能根：跨项目通用，也是「新建技能」默认写入的位置
  const harness = harnessSkillDir()
  if (harness) push('harness', '', 'DeepSeek Harness · 通用技能', harness, 'DSH 全局技能根，任何项目都能用')
  // 2) 全局（用户级）约定目录
  for (const entry of globalSkillDirs()) push('global', entry.convention, entry.label, entry.path)
  // 3) 项目内约定目录
  const projectDir = settings.projectDir
  if (projectDir) {
    for (const convention of SKILL_CONVENTIONS) {
      const path = convention.dir ? join(projectDir, convention.dir, 'skills') : join(projectDir, 'skills')
      push('project', convention.dir || 'skills', `项目 skill · ${convention.label}`, path)
    }
  }
  // 4) 自定义目录（主机配置或工作台设置里加的）
  for (const extra of config.skillsRoots ?? []) push('custom', '', '自定义 skill', extra)
  for (const extra of settings.skillsRoots ?? []) push('custom', '', '自定义 skill', extra)
  return roots
}

async function listSkills(config, settings) {
  const roots = skillRootsFor(config, settings)
  const items = []
  for (const root of roots) {
    if (!root.exists) continue
    await collectSkillsInRoot(root, items)
  }
  const docs = []
  await collectDocs(settings.projectDir, docs)
  const summary = {}
  for (const scope of ['harness', 'global', 'project', 'custom']) summary[scope] = { scope, roots: 0, exists: 0, skills: 0, agents: 0 }
  for (const root of roots) {
    const bucket = summary[root.scope]
    if (!bucket) continue
    bucket.roots += 1
    if (root.exists) bucket.exists += 1
  }
  for (const item of items) {
    const bucket = summary[item.scope]
    if (!bucket) continue
    if (item.kind === 'agent') bucket.agents += 1
    else bucket.skills += 1
  }
  return {
    roots,
    items,
    docs,
    projectDir: settings.projectDir,
    harnessSkillDir: harnessSkillDir(),
    summary: Object.values(summary),
  }
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

/* -------------------------------------------- 专家 / 专家团（参考 WorkBuddy） */

/** 专家文件放哪：通用 = DSH_HOME/agents；项目 = <项目>/<约定>/agents（默认 .claude）。 */
function expertDirFor(scope, convention, settings) {
  if (scope === 'project') {
    const projectDir = String(settings.projectDir ?? '').trim()
    if (!projectDir) return ''
    const safe = SKILL_CONVENTIONS.some((entry) => entry.dir && entry.dir === convention) ? convention : '.claude'
    return join(projectDir, safe, 'agents')
  }
  return process.env.DSH_HOME ? join(process.env.DSH_HOME, 'agents') : ''
}

function expertTargets(config, settings) {
  return {
    harness: { dir: expertDirFor('harness', '', settings), label: 'DeepSeek Harness 通用专家（所有项目可用）' },
    project: { dir: expertDirFor('project', '.claude', settings), label: '当前项目专家（写进 <.claude>/agents）' },
  }
}

/** 专家团清单文件：通用放 DSH_HOME/experts，项目放 <项目>/.dsh/experts。 */
function teamFiles(config, settings) {
  const projectDir = String(settings.projectDir ?? '').trim()
  const list = []
  if (process.env.DSH_HOME) list.push({ scope: 'harness', path: join(process.env.DSH_HOME, 'experts', 'teams.json'), label: 'DeepSeek Harness 通用专家团' })
  if (projectDir) list.push({ scope: 'project', path: join(projectDir, '.dsh', 'experts', 'teams.json'), label: '当前项目专家团' })
  return list
}

async function readTeamFile(file) {
  const raw = await readFile(file.path, 'utf8').catch(() => null)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    const teams = Array.isArray(parsed?.teams) ? parsed.teams : []
    return teams
      .filter((team) => team && typeof team.id === 'string' && team.id)
      .map((team) => ({
        kind: 'team',
        scope: file.scope,
        path: file.path,
        id: String(team.id),
        name: String(team.name || team.id),
        profession: String(team.profession || ''),
        description: String(team.description || ''),
        lead: String(team.lead || ''),
        members: Array.isArray(team.members) ? team.members.map(String) : [],
        flow: Array.isArray(team.flow) ? team.flow.map(String) : [],
        createdAt: String(team.createdAt || ''),
      }))
  } catch {
    return []
  }
}

/** 专家作用域优先级：同名时以「当前项目」的为准（最贴近这个仓库的上下文）。 */
const EXPERT_SCOPE_ORDER = { project: 0, harness: 1, global: 2, custom: 3 }

async function listExperts(config, settings) {
  const roots = skillRootsFor(config, settings)
  const found = []
  const agentDirs = []
  for (const root of roots) {
    // 技能目录可能还没建，但同级的 agents 目录里可能已经有专家：所以这里不看 root.exists
    const dir = await collectExpertsInRoot(root, found)
    if (dir) agentDirs.push({ scope: root.scope, convention: root.convention, label: root.label, path: dir, exists: existsSync(dir) })
  }
  // 同一个专家名字常在 .claude/agents 和 .agents/agents 各放一份：只留一份，其余位置记进 alsoIn
  const byId = new Map()
  const experts = []
  for (const expert of [...found].sort((a, b) => (EXPERT_SCOPE_ORDER[a.scope] ?? 9) - (EXPERT_SCOPE_ORDER[b.scope] ?? 9))) {
    const hit = byId.get(expert.agentId)
    if (hit) {
      hit.alsoIn = [...(hit.alsoIn ?? []), expert.path]
      continue
    }
    const copy = { ...expert }
    byId.set(expert.agentId, copy)
    experts.push(copy)
  }
  const teams = []
  for (const file of teamFiles(config, settings)) teams.push(...(await readTeamFile(file)))
  const summary = { harness: 0, global: 0, project: 0, custom: 0 }
  for (const expert of experts) if (expert.scope in summary) summary[expert.scope] += 1
  return {
    experts,
    teams,
    agentDirs,
    summary,
    duplicates: found.length - experts.length,
    selected: String(settings.expert ?? ''),
    targets: expertTargets(config, settings),
    // 「交给 AI 完善并创建」要把落盘位置原样告诉 agent，所以把专家团清单文件的绝对路径也带出去。
    teamFiles: teamFiles(config, settings),
    projectDir: settings.projectDir,
  }
}

/** 生成一份专家角色定义（frontmatter 用扁平键，正文参考 WorkBuddy 的四段式）。 */
export function renderExpertMarkdown({ id, name, displayName = '', profession = '', description, maxTurns = 0, abilities = [], flow = [], outputs = [], cautions = [] }) {
  const lines = ['---', `name: ${id}`, `description: ${String(description).replace(/\s+/g, ' ').trim()}`, `displayName: ${displayName || name || id}`, `profession: ${profession || name || id}`]
  if (Number(maxTurns) > 0) lines.push(`maxTurns: ${Number(maxTurns)}`)
  lines.push('---', '', `# ${displayName || name || id} · ${profession || name || id}`, '')
  lines.push(String(description).trim(), '')
  const section = (title, items, fallback) => {
    lines.push(`## ${title}`, '')
    const list = (items ?? []).map((line) => String(line).trim()).filter(Boolean)
    if (list.length) for (const [index, line] of list.entries()) lines.push(`${index + 1}. ${line}`)
    else lines.push(fallback)
    lines.push('')
  }
  section('核心能力', abilities, '1. （写下这个专家最擅长的几件事）')
  section('工作流程', flow, '1. （写下他接到需求后的固定步骤）')
  section('输出规范', outputs, '1. （写下他交付时要给什么：结构、字段、示例）')
  section('注意事项', cautions, '1. （写下他的红线与不越界的地方）')
  return `${lines.join('\n')}`
}

async function createExpert(config, settings, body) {
  const id = slugifySkillName(body?.id || body?.name)
  if (!id) return { ok: false, error: '专家标识请用小写字母、数字和连字符（例如 java-backend-expert）' }
  const description = String(body?.description ?? '').trim()
  if (!description) return { ok: false, error: '请写一句这个专家是干什么的（AI 靠它判断什么时候请他）' }
  const scope = body?.scope === 'project' ? 'project' : 'harness'
  const dir = expertDirFor(scope, String(body?.convention || '.claude'), settings)
  if (!dir) return { ok: false, error: scope === 'project' ? '还没选项目目录，选一个再创建项目专家' : '取不到 DSH_HOME，定位不到通用专家目录' }
  const convention = scope === 'project' ? String(body?.convention || '.claude') : ''
  const file = join(dir, `${id}.md`)
  if (existsSync(file) && !body?.overwrite) return { ok: false, error: `专家「${id}」已存在，换个标识或先删掉它`, path: file, exists: true }
  const text = renderExpertMarkdown({
    id,
    name: String(body?.name ?? '').trim(),
    displayName: String(body?.displayName ?? '').trim(),
    profession: String(body?.profession ?? '').trim(),
    description,
    maxTurns: Number(body?.maxTurns ?? 0) || 0,
    abilities: String(body?.abilities ?? '').split('\n'),
    flow: String(body?.flow ?? '').split('\n'),
    outputs: String(body?.outputs ?? '').split('\n'),
    cautions: String(body?.cautions ?? '').split('\n'),
  })
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(file, text, 'utf8')
  } catch (error) {
    return { ok: false, error: `写专家文件失败：${String(error?.message ?? error)}`, path: file }
  }
  return { ok: true, kind: 'expert', id, scope, convention, path: file, chars: text.length, overwrote: Boolean(body?.overwrite) }
}

async function createTeam(config, settings, body) {
  const id = slugifySkillName(body?.id || body?.name)
  if (!id) return { ok: false, error: '专家团标识请用小写字母、数字和连字符（例如 hr-delivery-team）' }
  const name = String(body?.name ?? '').trim() || id
  const scope = body?.scope === 'project' ? 'project' : 'harness'
  const file = teamFiles(config, settings).find((entry) => entry.scope === scope)
  if (!file) return { ok: false, error: scope === 'project' ? '还没选项目目录，选一个再建项目专家团' : '取不到 DSH_HOME，定位不到通用专家团目录' }
  const listing = await listExperts(config, settings)
  const known = new Map(listing.experts.map((expert) => [expert.agentId, expert]))
  const members = [...new Set((Array.isArray(body?.members) ? body.members : []).map((value) => slugifySkillName(value)).filter(Boolean))]
  const missing = members.filter((member) => !known.has(member))
  if (missing.length) return { ok: false, error: `这些专家还没找到：${missing.join('、')}（先创建专家，或从列表里选）` }
  if (!members.length) return { ok: false, error: '专家团至少要有 1 名专家' }
  const lead = slugifySkillName(body?.lead) || members[0]
  if (!members.includes(lead)) members.unshift(lead)
  const existing = await readTeamFile(file)
  const team = {
    id,
    name,
    profession: String(body?.profession ?? '').trim(),
    description: String(body?.description ?? '').trim(),
    lead,
    members,
    flow: String(body?.flow ?? '').split('\n').map((line) => line.trim()).filter(Boolean),
    createdAt: new Date().toISOString(),
  }
  const kept = existing.filter((entry) => entry.id !== id)
  if (existing.some((entry) => entry.id === id) && !body?.overwrite) return { ok: false, error: `专家团「${id}」已存在，勾上覆盖再建`, path: file.path, exists: true }
  const payload = { version: 1, updatedAt: new Date().toISOString(), teams: [...kept.map(({ kind, scope: _s, path: _p, ...rest }) => rest), team] }
  try {
    await mkdir(dirname(file.path), { recursive: true })
    await writeFile(file.path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  } catch (error) {
    return { ok: false, error: `写专家团失败：${String(error?.message ?? error)}`, path: file.path }
  }
  return { ok: true, kind: 'team', id, scope, path: file.path, members, lead, overwrote: Boolean(body?.overwrite) }
}

/* ------------------------------------------------- 飞书文档（文档信息） */

/** 从粘贴的飞书链接/token 里认出文档坐标（/docx/、/docs/、/wiki/、/file/ 都收）。 */
export function parseDocInput(input) {
  const text = String(input ?? '').trim()
  if (!text) return { doc: '', kind: '', url: '' }
  if (/^https?:/i.test(text)) {
    const hit = /\/(docx|docs|wiki|file)\/([A-Za-z0-9]+)/.exec(text)
    return { doc: hit ? hit[2] : '', kind: hit ? hit[1] : '', url: text }
  }
  const token = text.split(/[\s,|]+/).filter(Boolean)[0] ?? ''
  return { doc: /^[A-Za-z0-9_-]{6,}$/.test(token) ? token : '', kind: '', url: '' }
}

/**
 * `lark-cli docs +fetch` 的返回 -> { title, text }。
 * 成功：{ ok:true, data:{ document:{ document_id, revision_id, content, tips } } }
 * 失败：{ ok:false, error:{ type, subtype, code, message, hint } }（授权类的 JSON 走 stderr）
 */
export function parseDocPayload(stdout) {
  const raw = String(stdout ?? '').trim()
  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = null
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'lark-cli 没返回可解析的 JSON', detail: raw.slice(0, 600) }
  }
  if (parsed.ok === false) {
    const error = parsed.error ?? {}
    return {
      ok: false,
      error: String(error.message || error.subtype || '读取飞书文档失败'),
      detail: `type=${error.type ?? '?'} code=${error.code ?? '?'}`,
      hint: String(error.hint ?? ''),
      source: 'lark-cli',
    }
  }
  const document = parsed?.data?.document ?? {}
  const content = String(document.content ?? '')
  const titleTag = /<title>([\s\S]*?)<\/title>/i.exec(content)
  const heading = /^#{1,3}\s+(.+)$/m.exec(content)
  const title = String(titleTag ? titleTag[1] : heading ? heading[1] : '').trim()
  const text = content.replace(/<title>[\s\S]*?<\/title>/i, '').trim()
  return {
    ok: true,
    documentId: String(document.document_id ?? ''),
    revision: Number(document.revision_id ?? 0) || 0,
    title,
    text,
    chars: text.length,
    tips: String(document.tips ?? ''),
  }
}

const DOC_SCOPES = ['full', 'outline', 'keyword']

function safeFilePart(value, fallback = 'doc') {
  return String(value ?? '').replace(/[^\w.-]/g, '_') || fallback
}

function docsIndexFile(config) {
  return join(config.root, 'docs.json')
}

function docsContentDir(config) {
  return join(config.root, 'docs')
}

/** 已拉取过的文档清单（只记来源与标题，不记凭证）。 */
async function readDocs(config) {
  try {
    const parsed = JSON.parse(await readFile(docsIndexFile(config), 'utf8'))
    const items = Array.isArray(parsed?.items) ? parsed.items : []
    return items
      .filter((item) => item && typeof item.id === 'string' && item.id)
      .map((item) => ({
        id: String(item.id),
        title: String(item.title ?? ''),
        url: String(item.url ?? ''),
        kind: String(item.kind ?? ''),
        revision: Number(item.revision ?? 0) || 0,
        chars: Number(item.chars ?? 0) || 0,
        addedAt: String(item.addedAt ?? ''),
      }))
  } catch {
    return []
  }
}

async function writeDocs(config, items) {
  await mkdir(dirname(docsIndexFile(config)), { recursive: true })
  await writeFile(docsIndexFile(config), `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), items }, null, 2)}\n`, 'utf8')
  return items
}

/** 拉一篇飞书文档：lark-cli docs +fetch -> 正文落盘 + 记进清单。 */
async function fetchFeishuDoc(config, body) {
  const input = String(body?.input ?? '').trim()
  const parsed = parseDocInput(input)
  if (!parsed.doc) return { ok: false, error: '请粘贴飞书文档链接（/docx/ 或 /wiki/），或直接给文档 token' }
  const scope = DOC_SCOPES.includes(body?.scope) ? body.scope : 'full'
  const identity = String(body?.identity ?? '').trim() || config.identity || 'user'
  const larkCli = await resolveLarkCli(config.larkCli)
  const wrapper = shellWrapper(larkCli)
  const args = ['docs', '+fetch', '--doc', parsed.doc, '--doc-format', 'markdown', '--scope', scope, '--as', identity]
  if (scope === 'keyword' && body?.keyword) args.push('--keyword', String(body.keyword))
  const command = `lark-cli docs +fetch --doc ${parsed.doc} --doc-format markdown --scope ${scope} --as ${identity}`
  const result = await runLark(wrapper, args)
  // 授权/权限类的 JSON 走 stderr，业务成功走 stdout：两边都试一遍再决定报错。
  const payload = parseDocPayload(result.stdout).ok ? parseDocPayload(result.stdout) : parseDocPayload(result.stderr)
  if (!payload.ok) {
    if (!result.ok && /not JSON|没返回可解析/.test(String(payload.error))) {
      return { ok: false, error: '读取飞书文档失败', detail: (result.stderr || result.stdout || '').trim().slice(0, 1200), command }
    }
    return { ok: false, error: payload.error, detail: payload.detail, hint: payload.hint, command }
  }
  if (!payload.text) {
    return { ok: false, error: '这篇文档没读到正文（可能是空文档或没有权限）', command, revision: payload.revision }
  }
  const id = payload.documentId || parsed.doc
  const dir = docsContentDir(config)
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${safeFilePart(id)}.md`), `${payload.text}\n`, 'utf8')
  } catch (error) {
    return { ok: false, error: `文档正文落盘失败：${String(error?.message ?? error)}` }
  }
  const item = {
    id,
    title: payload.title || input.slice(0, 60),
    url: parsed.url || input,
    kind: parsed.kind,
    revision: payload.revision,
    chars: payload.chars,
    addedAt: new Date().toISOString(),
  }
  const items = await readDocs(config)
  const next = [item, ...items.filter((entry) => entry.id !== id)]
  await writeDocs(config, next)
  return { ok: true, item, items: next, text: payload.text, chars: payload.chars, revision: payload.revision, scope, command }
}

async function readDocContent(config, id) {
  const wanted = String(id ?? '').trim()
  if (!wanted) return { ok: false, error: '缺少文档 id' }
  const items = await readDocs(config)
  const item = items.find((entry) => entry.id === wanted)
  if (!item) return { ok: false, error: '这篇文档不在已拉取清单里' }
  const text = await readFile(join(docsContentDir(config), `${safeFilePart(item.id)}.md`), 'utf8').catch(() => null)
  if (text === null) return { ok: false, error: '正文文件读不到，重新拉取一次即可' }
  return { ok: true, item, text }
}

async function removeDoc(config, id) {
  const wanted = String(id ?? '').trim()
  const items = await readDocs(config)
  const next = items.filter((entry) => entry.id !== wanted)
  await rm(join(docsContentDir(config), `${safeFilePart(wanted)}.md`), { force: true }).catch(() => {})
  await writeDocs(config, next)
  return { ok: true, items: next }
}

/* ----------------------------------------- 专家团全流程（需求→开发→评审→QA） */

/**
 * 四段固定流程；role 是本机已有的专家角色标识（DSH_HOME/agents/<role>.md）。
 * needsEvidence：这一段必须能落成凭据，界面上会提示；没凭据也能完成，但会记成 done_unverified。
 * required：v4.2 恒为 true，等 v4.3 做「阶段可裁剪」时才会真正参与完成度分母。
 */
export const FLOW_STAGES = [
  { id: 'analyze', name: '需求分析', role: 'product-requirement-expert', needsEvidence: true, required: true },
  { id: 'develop', name: '代码开发', role: 'fullstack-architect', needsEvidence: true, required: true },
  { id: 'review', name: '代码评审', role: 'code-review-expert', needsEvidence: true, required: true },
  { id: 'qa', name: 'QA 测试', role: 'qa-test-expert', needsEvidence: true, required: true },
]

export const FLOW_STATUS = [
  { id: 'pending', label: '待开始' },
  { id: 'running', label: '进行中' },
  { id: 'done', label: '已完成' },
  { id: 'done_unverified', label: '已完成 · 无凭据' },
  { id: 'blocked', label: '受阻' },
]

/**
 * 凭据的种类。刻意把「备注」排除在外：一句「已完成」不是凭据，一段人写的说明也不是。
 * 只有命令输出 / 文件清单 / 测试结果 / 链接 / spec 文档路径算。
 */
export const FLOW_EVIDENCE_KINDS = [
  { id: 'command', label: '命令', hint: '跑过的命令 + 输出摘要' },
  { id: 'files', label: '文件', hint: '改动的文件清单（如 git diff --stat）' },
  { id: 'test', label: '测试', hint: '用例数 / 通过失败条数' },
  { id: 'url', label: '链接', hint: 'PR / CI / 构建结果链接' },
  { id: 'spec', label: '规格', hint: '项目里 skill 产出的 spec 文档路径' },
]

const FLOW_STATUS_IDS = FLOW_STATUS.map((entry) => entry.id)
const FLOW_EVIDENCE_KIND_IDS = FLOW_EVIDENCE_KINDS.map((entry) => entry.id)
const EVIDENCE_MAX_CHARS = 200

export function flowStageName(stageId) {
  return FLOW_STAGES.find((entry) => entry.id === stageId)?.name ?? String(stageId ?? '')
}

/** 「已完成 · 无凭据」也推进进度，但它不是有证据的完成 —— 台账里要分开数。 */
export function isStageDone(stage) {
  return stage?.status === 'done' || stage?.status === 'done_unverified'
}

/** 一条流水线的阶段完成度（已完成 / 全部）。 */
export function flowPercent(flow) {
  const stages = flow?.stages ?? []
  if (!stages.length) return 0
  const done = stages.filter(isStageDone).length
  return Math.round((done / stages.length) * 100)
}

/** 台账口径：这条流水线有几条凭据、几个阶段是「无凭据完成」的。 */
export function flowEvidenceStats(flow) {
  const stages = flow?.stages ?? []
  const evidence = stages.reduce((sum, stage) => sum + (Array.isArray(stage.evidence) ? stage.evidence.length : 0), 0)
  const unverified = stages.filter((stage) => stage.status === 'done_unverified').length
  const done = stages.filter(isStageDone).length
  return { evidence, unverified, done, stages: stages.length }
}

/** 事件流 -> 最新流水线（每个 id 一条，附各阶段状态）。 */
export function foldFlows(events) {
  const map = new Map()
  for (const event of events) {
    if (!event || typeof event !== 'object' || !event.id) continue
    if (event.type === 'create') {
      const ids = (Array.isArray(event.stages) && event.stages.length ? event.stages : FLOW_STAGES.map((stage) => stage.id)).map(String)
      map.set(String(event.id), {
        id: String(event.id),
        at: String(event.at ?? ''),
        title: String(event.title ?? ''),
        recordId: String(event.recordId ?? ''),
        tableKey: String(event.tableKey ?? ''),
        team: String(event.team ?? ''),
        teamName: String(event.teamName ?? ''),
        stages: ids.map((id) => ({ id, status: 'pending', note: '', at: '', evidence: [] })),
      })
      continue
    }
    const flow = map.get(String(event.id))
    if (!flow) continue
    if (event.type === 'stage') {
      const stage = flow.stages.find((entry) => entry.id === event.stage)
      if (!stage) continue
      if (FLOW_STATUS_IDS.includes(event.status)) stage.status = event.status
      if (event.note !== undefined) stage.note = String(event.note)
      stage.at = String(event.at ?? '')
      flow.updatedAt = String(event.at ?? '')
    }
    if (event.type === 'evidence') {
      // 凭据是追加式的：先贴凭据再标完成、或反过来都行。老事件没有 evidence 字段就当没贴。
      const stage = flow.stages.find((entry) => entry.id === event.stage)
      if (!stage) continue
      const kind = FLOW_EVIDENCE_KIND_IDS.includes(event.kind) ? event.kind : 'command'
      const summary = String(event.summary ?? '').trim().slice(0, EVIDENCE_MAX_CHARS)
      if (!summary) continue
      stage.evidence = [
        ...(stage.evidence ?? []),
        { kind, summary, ref: String(event.ref ?? '').slice(0, 300), at: String(event.at ?? '') },
      ]
      flow.updatedAt = String(event.at ?? '')
    }
    if (event.type === 'evidence-remove') {
      const stage = flow.stages.find((entry) => entry.id === event.stage)
      if (!stage) continue
      const targetAt = String(event.targetAt ?? '')
      stage.evidence = (stage.evidence ?? []).filter((entry) => entry.at !== targetAt)
      flow.updatedAt = String(event.at ?? '')
    }
    if (event.type === 'remove') flow.removed = true
  }
  return [...map.values()]
    .filter((flow) => !flow.removed)
    .sort((a, b) => String(b.updatedAt ?? b.at).localeCompare(String(a.updatedAt ?? a.at)))
}

function flowsFile(config) {
  return join(config.root, 'flows.jsonl')
}

async function readFlows(config) {
  const text = await readFile(flowsFile(config), 'utf8').catch(() => '')
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
  return foldFlows(events)
}

async function appendFlow(config, event) {
  await mkdir(dirname(flowsFile(config)), { recursive: true })
  await appendFile(flowsFile(config), `${JSON.stringify(event)}\n`, 'utf8')
  return event
}

/* --------------------------------- 项目里的 spec 文档（开发 skill 产出，工作台只认不造） */

/**
 * spec 不由本工作台生成 —— 它来自项目里的开发 skill 流程（dev-task-sync 的 .dev-tasks/、
 * OpenSpec 的 openspec/changes/、Spec Kit 的 specs/ 等）。工作台做三件事：
 * 认出来、允许作为「规格」类凭据引用、对验收标准做一次「能不能失败」的机械检查。
 */
const SPEC_DIRS = [
  { dir: 'specs', label: 'specs/' },
  { dir: 'openspec/specs', label: 'openspec/specs/' },
  { dir: 'openspec/changes', label: 'openspec/changes/' },
  { dir: '.dev-tasks', label: '.dev-tasks/（dev-task-sync 产出）' },
  { dir: 'doc/specs', label: 'doc/specs/' },
  { dir: 'docs/specs', label: 'docs/specs/' },
]

const SPEC_ROOT_PATTERNS = [/\.spec\.md$/i, /^requirements\.md$/i, /^spec\.md$/i]
const SPEC_MAX_DEPTH = 4
const SPEC_MAX_FILES = 120
const SPEC_MAX_BYTES = 200 * 1024
const SPEC_SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'target', 'vendor'])

async function collectSpecFiles(rootDir, items, depth = 0) {
  if (depth > SPEC_MAX_DEPTH || items.length >= SPEC_MAX_FILES) return
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (items.length >= SPEC_MAX_FILES) return
    const name = String(entry.name ?? '')
    if (!name) continue
    if (entry.isDirectory()) {
      if (name.startsWith('.') || SPEC_SKIP_DIRS.has(name)) continue
      await collectSpecFiles(join(rootDir, name), items, depth + 1)
      continue
    }
    if (!entry.isFile() || !/\.md$/i.test(name)) continue
    const path = join(rootDir, name)
    const info = await stat(path).catch(() => null)
    if (!info || info.size > SPEC_MAX_BYTES) continue
    if (items.some((item) => resolve(item.path) === resolve(path))) continue
    items.push({ path, name, bytes: info.size, mtime: info.mtime.toISOString() })
  }
}

export async function listSpecFiles(config, settings) {
  const projectDir = String(settings?.projectDir ?? '').trim()
  if (!projectDir) {
    return { ok: false, error: '先在设置里选项目目录，才能扫项目里 skill 产出的 spec 文档', items: [], roots: [] }
  }
  const items = []
  const roots = []
  for (const entry of SPEC_DIRS) {
    const dir = join(projectDir, entry.dir)
    const before = items.length
    if (existsSync(dir)) {
      await collectSpecFiles(dir, items)
      roots.push({ dir: entry.dir, label: entry.label, exists: true, files: items.length - before })
    } else {
      roots.push({ dir: entry.dir, label: entry.label, exists: false, files: 0 })
    }
  }
  // 项目根下的 *.spec.md / requirements.md / spec.md（skill 常把 spec 放在根上）
  const rootEntries = await readdir(projectDir, { withFileTypes: true }).catch(() => [])
  for (const entry of rootEntries) {
    if (!entry.isFile()) continue
    const name = String(entry.name ?? '')
    if (!SPEC_ROOT_PATTERNS.some((pattern) => pattern.test(name))) continue
    const path = join(projectDir, name)
    const info = await stat(path).catch(() => null)
    if (!info || info.size > SPEC_MAX_BYTES) continue
    if (items.some((item) => resolve(item.path) === resolve(path))) continue
    items.push({ path, name, bytes: info.size, mtime: info.mtime.toISOString() })
  }
  items.sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)))
  return { ok: true, projectDir, items, roots }
}

const ACCEPTANCE_HEADING = /(验收标准|验收条件|验收准则|acceptance\s*criteria|acceptance)/i
const CONDITION_RULES = [
  /当[^。；]{1,40}?(时|后)/,
  /如果/,
  /假如/,
  /若[^。；]{1,30}?(则|就)/,
  /一旦/,
  /在[^。；]{1,40}?时/,
  /\bwhen\b/i,
  /\bgiven\b/i,
  /\bif\b/i,
]
const DECIDABLE_RULES = [
  /返回/,
  /拒绝/,
  /提示/,
  /显示/,
  /保存/,
  /写入/,
  /跳转/,
  /抛出/,
  /不允许/,
  /禁止/,
  /失败/,
  /成功/,
  /变更为|改为/,
  /等于|大于|小于/,
  /不得|必须|应当/,
  /校验|拦截/,
  /记录|生成|删除|创建|更新|提交/,
  /\breturn\b|\breject\b|\bshow\b|\bsave\b|\bwrite\b|\bthrow\b|\bfail\b|\bmust\b|\bshould\b/i,
]
const MAX_CRITERION_CHARS = 60

/**
 * 验收标准的「能不能失败」机械检查（纯规则，不调模型）。
 * 「注册功能正常工作」无法失败；「当邮箱已注册时，接口返回 409」可以失败 —— 后者在成为代码
 * 之前就已经是一条测试。只标黄、不阻断：误报的代价是没人再看黄条。
 */
export function checkAcceptanceCriteria(text) {
  const lines = String(text ?? '').split(/\r?\n/)
  const criteria = []
  let inSection = false
  let headingLevel = 0
  for (const raw of lines) {
    const line = raw.trim()
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      if (ACCEPTANCE_HEADING.test(heading[2])) {
        inSection = true
        headingLevel = level
        continue
      }
      if (inSection && level <= headingLevel) inSection = false
      continue
    }
    if (!inSection) continue
    const bullet = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (!bullet) continue
    const item = bullet[1].trim()
    if (item) criteria.push(item)
  }
  if (!criteria.length) return { found: false, total: 0, weak: [] }
  const weak = []
  for (const [index, item] of criteria.entries()) {
    const reasons = []
    if (!CONDITION_RULES.some((rule) => rule.test(item))) reasons.push('没有触发条件（当…时 / 如果…）')
    if (!DECIDABLE_RULES.some((rule) => rule.test(item))) reasons.push('没有可判定的结果（返回 / 拒绝 / 显示…）')
    const length = [...item].length
    if (length > MAX_CRITERION_CHARS) reasons.push(`太长（${length} 字 > ${MAX_CRITERION_CHARS} 字，拆成几条）`)
    if (reasons.length) weak.push({ index: index + 1, text: item.slice(0, 160), reasons })
  }
  return { found: true, total: criteria.length, weak }
}

/* --------------------------------------- 更新日志（包内 CHANGELOG.md） */

/**
 * 读包自带的 CHANGELOG.md，交给界面「版本号 → 更新日志」弹窗渲染。
 * 只读包内文件，不接受任何外部路径；文件缺失就返回空，不当成错误。
 */
async function readChangelog() {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [join(here, '..', 'CHANGELOG.md'), join(here, 'CHANGELOG.md')]
  for (const file of candidates) {
    const text = await readFile(file, 'utf8').catch(() => null)
    if (text === null) continue
    return { found: true, path: file, text, sections: parseChangelog(text) }
  }
  return { found: false, path: '', text: '', sections: [] }
}

/**
 * 把 CHANGELOG 拆成 `[{ version, date, items: string[] }]`。
 * 只认 `## vX.Y.Z — 日期` 形式的标题（兼容 `–`/`-` 破折号），
 * 正文里以 `- ` 开头的是条目；其它说明性文字丢掉，界面只展示条目。
 */
export function parseChangelog(text) {
  const sections = []
  let current = null
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim()
    const heading = /^##\s+v?(\d+\.\d+\.\d+)\s*(?:[—–-]+\s*(\d{4}-\d{2}-\d{2}))?/u.exec(line)
    if (heading) {
      current = { version: heading[1], date: heading[2] ?? '', items: [] }
      sections.push(current)
      continue
    }
    if (!current) continue
    if (/^#{2,}\s/u.test(line)) {
      current = null
      continue
    }
    const item = /^[-*]\s+(.*)$/u.exec(line)
    if (item && item[1]) current.items.push(item[1])
  }
  return sections.filter((section) => section.items.length > 0)
}

async function readSpecFile(config, settings, target) {
  const wanted = String(target ?? '').trim()
  if (!wanted) return { ok: false, error: '缺少 spec 文件路径' }
  const listing = await listSpecFiles(config, settings)
  if (!listing.ok) return { ok: false, error: listing.error }
  // 白名单：只读扫描结果里的文件，别的一律拒绝（路径由客户端传，不能全信）。
  const hit = listing.items.find((item) => resolve(item.path) === resolve(wanted))
  if (!hit) return { ok: false, error: '该路径不在本工作台可读的 spec 范围内（先刷新 spec 扫描）' }
  const text = await readFile(hit.path, 'utf8').catch((error) => {
    return `__READ_ERROR__${String(error?.message ?? error)}`
  })
  if (text.startsWith('__READ_ERROR__')) return { ok: false, error: text.slice('__READ_ERROR__'.length) }
  const checks = checkAcceptanceCriteria(text)
  return {
    ok: true,
    path: hit.path,
    name: hit.name,
    bytes: hit.bytes,
    truncated: text.length > 40_000,
    text: text.length > 40_000 ? `${text.slice(0, 40_000)}\n\n…（已截断，共 ${text.length} 字）` : text,
    checks,
  }
}

/* ------------------------------------------------ 页面内 AI 直接创建（不走对话） */

/** 模型可能把 JSON 包在代码围栏或解释文字里：剥掉围栏、截取最外层大括号再试。 */
export function parseJsonLoose(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return null
  const fenced = raw
    .replace(/^```[a-zA-Z]*\s*/, '')
    .replace(/```\s*$/, '')
    .trim()
  const candidates = [fenced]
  const start = fenced.indexOf('{')
  const end = fenced.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(fenced.slice(start, end + 1))
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch {
      /* 试下一种截法 */
    }
  }
  return null
}

/** 取当前默认模型路由：优先会话默认，其次插件配置里的显式指定。 */
export function resolveLlmRoute(ctx, settings) {
  const explicitProvider = String(settings?.aiProvider ?? '').trim()
  const explicitModel = String(settings?.aiModel ?? '').trim()
  if (explicitProvider && explicitModel) return { provider: explicitProvider, model: explicitModel }
  const service = typeof ctx?.get === 'function' ? ctx.get('agentDefaultModel') : undefined
  let selection = null
  try {
    selection = typeof service?.currentSelection === 'function' ? service.currentSelection() : null
  } catch {
    selection = null
  }
  const provider = String(selection?.provider ?? selection?.providerId ?? selection?.route?.provider ?? '').trim()
  const model = String(selection?.model ?? selection?.modelId ?? selection?.route?.model ?? '').trim()
  if (!provider || !model) return null
  return { provider, model, reasoningEffort: selection?.reasoningEffort }
}

const AI_DRAFT_SYSTEM =
  '你是 DeepSeek Harness 的「专家架构师」，负责把用户一句粗略描述完善成能立刻上岗的专家角色定义。' +
  '你只输出一个 JSON 对象：不要解释、不要代码围栏、不要多余文字。描述里没写到的细节按专业判断补齐，不要反问用户、不要要求确认。'

const AI_FLOW_STEPS = [
  '定位与边界：属于哪条链路（前端 / 后端 / 数据 / 测试 / 评审 / 交付…）、和相邻角色怎么分工',
  '能力清单：从擅长的技术栈与场景倒推 4-6 项可独立交付的能力',
  '工作流程：按「读规范 → 理解需求 → 出方案 → 实现 → 自测 → 交付」写成固定动作',
  '输出规范：交付物形态（代码 / 文档 / 单测 / 评审意见）与必须给出的证据',
  '红线与自检：最容易出错的 3-5 个点，以及什么情况必须停下报告',
  '触发场景：写清「什么时候该请他」，让调度的人一眼能判断',
]

/** 单个专家的 JSON 作业单。 */
export function aiExpertPrompt({ description, id = '', displayName = '' }) {
  const lines = [
    '请按下面的专业流程，把用户这句粗略描述完善成一位能立刻上岗的专家，并以 JSON 返回。',
    '',
    '## 用户的原话（唯一输入）',
    '"""',
    String(description ?? '').trim(),
    '"""',
    '',
    '## 内部专业流程（照这个想，不要把过程写进 JSON）',
    ...AI_FLOW_STEPS.map((step, index) => `${index + 1}. ${step}`),
    '',
    '## 只输出这个 JSON 对象（字段全部必填，数组元素是字符串）',
    '{',
    `  "id": "${id || 'kebab-case 小写英文标识，例如 payment-reconcile-expert'}",`,
    `  "displayName": "${displayName || '中文短名，2-4 字，如「老付」'}",`,
    '  "profession": "职业定位，如「支付对账专家」",',
    '  "description": "一句话：他负责什么、什么时候该请他",',
    '  "abilities": ["4-6 条能独立交付的具体能力（不要空话）"],',
    '  "flow": ["5-8 步他接到需求后的固定动作"],',
    '  "outputs": ["3-5 条交付时给什么、必须附什么证据"],',
    '  "cautions": ["3-5 条红线与必须停下报告的情况"],',
    '  "assumptions": ["最多 5 条你替他做的假设"]',
    '}',
  ]
  if (id || displayName) lines.push('', `用户已指定：${id ? `标识 \`${id}\`` : ''}${id && displayName ? '、' : ''}${displayName ? `显示名 \`${displayName}\`` : ''}，请直接采用。`)
  return lines.join('\n')
}

/** 专家团的 JSON 作业单：一次把团长、成员分工和缺的成员定义都给全。 */
export function aiTeamPrompt({ description, id = '', known = [] }) {
  const lines = [
    '请按下面的专业流程，把用户这句粗略描述完善成一个能立刻开工的专家团（团长 + 成员分工），并以 JSON 返回。',
    '',
    '## 用户的原话（唯一输入）',
    '"""',
    String(description ?? '').trim(),
    '"""',
    '',
    '## 内部专业流程（照这个想，不要把过程写进 JSON）',
    ...AI_FLOW_STEPS.map((step, index) => `${index + 1}. ${step}`),
    '7. 团队编排：谁先动、谁拍板、谁验收，交接点交付什么',
    '',
    '## 只输出这个 JSON 对象（字段全部必填）',
    '{',
    `  "id": "${id || 'kebab-case 小写英文标识，例如 fullstack-delivery-team'}",`,
    '  "name": "中文团名，如「全栈交付一条龙专家团」",',
    '  "profession": "这个团整体干什么，如「需求 → 架构 → 开发 → 评审 → 测试 一条龙交付」",',
    '  "description": "一句话：什么时候该请这个团",',
    '  "lead": "members 里最该拍板那位的 id",',
    '  "flow": ["3-6 条协作步骤（谁做什么、交接什么）"],',
    '  "members": [',
    '    {',
    '      "id": "成员的 kebab-case 标识",',
    '      "displayName": "中文短名 2-4 字",',
    '      "profession": "职业定位",',
    '      "description": "一句话：他负责什么、什么时候该请他",',
    '      "abilities": ["4-6 条能独立交付的具体能力"],',
    '      "flow": ["5-8 步固定动作"],',
    '      "outputs": ["3-5 条交付物与证据"],',
    '      "cautions": ["3-5 条红线"]',
    '    }',
    '  ],',
    '  "assumptions": ["最多 5 条你替用户做的假设"]',
    '}',
    '',
    'members 给 2-6 位（按描述里的角色拆，一个人能兼两件事就写一个更贴切的成员）。',
    known.length ? `已经有这些专家，能复用就把他的 id 直接放进 members，不要重复造：${known.join('、')}` : '目前还没有已存在的专家。',
  ]
  return lines.join('\n')
}

/** 把模型返回的数组字段转成 createExpert 认的「一行一条」文本。 */
function linesOf(value) {
  if (Array.isArray(value)) return value.map((line) => String(line ?? '').trim()).filter(Boolean).join('\n')
  return String(value ?? '')
}

/** 把模型这次回答的文本收集起来（只要 text-delta，遇到 error 收尾就记下来）。 */
async function llmCollectText(llm, route, system, userText, signal) {
  let text = ''
  let failure = null
  const stream = llm.stream({
    provider: route.provider,
    model: route.model,
    reasoningEffort: route.reasoningEffort,
    system,
    messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
    maxTokens: 4000,
    signal,
  })
  for await (const chunk of stream) {
    if (chunk?.type === 'text-delta') text += String(chunk.text ?? '')
    else if (chunk?.type === 'finish' && chunk.reason?.kind === 'error') failure = chunk.reason.failure
    else if (chunk?.type === 'finish' && chunk.reason?.kind === 'aborted') failure = chunk.reason.failure ?? { message: '模型调用被中断' }
  }
  return { text, failure }
}

const AI_TIMEOUT_MS = 120000

/**
 * 页面里「AI 直接创建」：调宿主 llm 服务拿结构化草稿，再由工作台按标准格式落盘。
 * 全程不经过对话、不需要复制任何提示词；失败一律返回 ok:false + 原因，由页面提示退路。
 */
async function aiCreateDraft(ctx, config, settings, body) {
  const llm = typeof ctx?.get === 'function' ? ctx.get('llm') : undefined
  if (!llm || typeof llm.stream !== 'function') {
    return { ok: false, error: '这个宿主没提供「直接调模型」的能力，点「发到对话里做」即可' }
  }
  const route = resolveLlmRoute(ctx, settings)
  if (!route) return { ok: false, error: '取不到当前默认模型，先在对话框里选一个模型再试' }
  const kind = body?.kind === 'team' ? 'team' : 'expert'
  const description = String(body?.description ?? '').trim()
  if (!description) return { ok: false, error: '先用一句话说清你要谁（AI 靠它完善细节）' }
  const scope = body?.scope === 'project' ? 'project' : 'harness'
  const listing = await listExperts(config, settings)
  const known = listing.experts.map((expert) => expert.agentId)
  const userText = kind === 'team'
    ? aiTeamPrompt({ description, id: String(body?.id ?? ''), known })
    : aiExpertPrompt({ description, id: String(body?.id ?? ''), displayName: String(body?.displayName ?? '') })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)
  let text = ''
  let failure = null
  try {
    const result = await llmCollectText(llm, route, AI_DRAFT_SYSTEM, userText, controller.signal)
    text = result.text
    failure = result.failure
  } catch (error) {
    return { ok: false, error: `调模型失败：${String(error?.message ?? error)}` }
  } finally {
    clearTimeout(timer)
  }
  if (failure) return { ok: false, error: `模型报错：${String(failure.message ?? '未知错误')}` }
  const draft = parseJsonLoose(text)
  if (!draft) return { ok: false, error: '模型这次没给出可用的 JSON，可以点「发到对话里做」让它用文件工具落盘', raw: String(text).slice(0, 400) }

  const created = []
  if (kind === 'expert') {
    const result = await createExpert(config, settings, {
      id: String(body?.id ?? '') || draft.id,
      name: draft.name,
      displayName: String(body?.displayName ?? '') || draft.displayName,
      profession: draft.profession,
      description: draft.description || description,
      abilities: linesOf(draft.abilities),
      flow: linesOf(draft.flow),
      outputs: linesOf(draft.outputs),
      cautions: linesOf(draft.cautions),
      scope,
      overwrite: false,
    })
    if (!result.ok) return { ok: false, error: result.error, draft }
    created.push(result)
  } else {
    const members = Array.isArray(draft.members) ? draft.members.slice(0, 8) : []
    if (!members.length) return { ok: false, error: '模型没给出团队成员，重试或改用「发到对话里做」', draft }
    const memberIds = []
    for (const member of members) {
      const memberId = slugifySkillName(member?.id || member?.agentId || member?.name)
      if (!memberId) continue
      memberIds.push(memberId)
      if (known.includes(memberId)) continue
      const result = await createExpert(config, settings, {
        id: memberId,
        displayName: member?.displayName,
        profession: member?.profession,
        description: member?.description || `${memberId}（由 AI 按专家团分工补齐）`,
        abilities: linesOf(member?.abilities),
        flow: linesOf(member?.flow),
        outputs: linesOf(member?.outputs),
        cautions: linesOf(member?.cautions),
        scope,
        overwrite: false,
      })
      if (result.ok) created.push(result)
      else if (!result.exists) return { ok: false, error: `成员「${memberId}」没建成：${result.error}`, draft, created }
    }
    if (!memberIds.length) return { ok: false, error: '模型给出的成员标识都不可用，重试一次', draft }
    const teamResult = await createTeam(config, settings, {
      id: String(body?.id ?? '') || draft.id,
      name: draft.name,
      profession: draft.profession,
      description: draft.description || description,
      lead: draft.lead,
      members: memberIds,
      flow: linesOf(draft.flow),
      scope,
    })
    if (!teamResult.ok) return { ok: false, error: teamResult.error, draft, created }
    created.push(teamResult)
  }
  const last = created[created.length - 1]
  return {
    ok: true,
    kind,
    model: `${route.provider}/${route.model}`,
    created,
    id: String(last?.id ?? ''),
    path: String(last?.path ?? ''),
    name: kind === 'team' ? String(draft.name ?? last?.id ?? '') : String(draft.displayName ?? draft.name ?? last?.id ?? ''),
    members: kind === 'team' ? (last?.members ?? []) : undefined,
    assumptions: Array.isArray(draft.assumptions) ? draft.assumptions.map(String).slice(0, 5) : [],
  }
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

      // 界面自检上报：客户端把「详情分栏的实际布局」报上来，排障时直接读 GET /ui/metrics
      // 只存在内存里（不落盘、不含任何凭证），进程重启即清空。
      if (route === '/ui/metrics' && req.method === 'POST') {
        const body = await readBody(req)
        uiMetrics = { ...body, at: new Date().toISOString() }
        return sendJson(res, 200, { ok: true })
      }

      if (route === '/ui/metrics' && req.method === 'GET') {
        return sendJson(res, 200, { ok: true, metrics: uiMetrics })
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
        const { tables, dropped } = await listTables(config, settings)
        return sendJson(res, 200, {
          projectDir: settings.projectDir,
          dropped,
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
        const tableKey = String(body?.tableKey ?? '')
        const recordId = String(body?.recordId ?? '')
        const status = ['handed-off', 'in-progress', 'done', 'blocked'].includes(body?.status) ? body.status : 'handed-off'
        // 同一个任务只留一条：已经记过就更新那一条（刷新时间/项目/备注、次数 +1），不再追加新的。
        const existing = (await readRuns(config)).find((run) => runTaskKey(run) === runTaskKey({ tableKey, recordId, title, id: '' }))
        const event = existing
          ? { type: 'regenerate', id: existing.id, at: new Date().toISOString(), title, projectDir: String(body?.projectDir ?? ''), note: String(body?.note ?? '') }
          : {
              type: 'create',
              id: `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
              at: new Date().toISOString(),
              tableKey,
              recordId,
              title,
              projectDir: String(body?.projectDir ?? ''),
              status,
              note: String(body?.note ?? ''),
            }
        await appendRun(config, event)
        const items = await readRuns(config)
        return sendJson(res, 200, {
          ok: true,
          regenerated: Boolean(existing),
          run: items.find((run) => run.id === (existing ? existing.id : event.id)) ?? event,
          items,
        })
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

      if (route === '/skills/create' && req.method === 'POST') {
        const settings = await readSettings(config)
        const body = await readBody(req)
        const result = await createSkill(config, settings, body)
        return sendJson(res, result.ok ? 200 : 400, result)
      }

      if (route === '/experts' && req.method === 'GET') {
        const settings = await readSettings(config)
        return sendJson(res, 200, await listExperts(config, settings))
      }

      // 对话输入框那个「＋ 专家」入口知道自己是哪个会话（宿主 slot 会给 sessionId），
      // 工作台要「把养专家的指令发进当前对话」就得先知道会话是谁：入口上报、面板取用。
      if (route === '/composer/session' && req.method === 'POST') {
        const body = await readBody(req)
        const sessionId = String(body?.sessionId ?? '').trim().slice(0, 200)
        if (sessionId) composerSession = { id: sessionId, at: Date.now() }
        return sendJson(res, 200, { ok: true, sessionId: composerSession.id })
      }

      if (route === '/composer/session' && req.method === 'GET') {
        return sendJson(res, 200, { ok: true, sessionId: composerSession.id, at: composerSession.at })
      }

      if (route === '/expert/create' && req.method === 'POST') {
        const settings = await readSettings(config)
        const body = await readBody(req)
        const result = await createExpert(config, settings, body)
        return sendJson(res, result.ok ? 200 : 400, result)
      }

      if (route === '/team/create' && req.method === 'POST') {
        const settings = await readSettings(config)
        const body = await readBody(req)
        const result = await createTeam(config, settings, body)
        return sendJson(res, result.ok ? 200 : 400, result)
      }

      // 页面里「AI 直接创建」：调宿主 llm 服务拿结构化草稿，再由工作台落盘，不经过对话。
      if (route === '/ai/create' && req.method === 'POST') {
        const settings = await readSettings(config)
        const body = await readBody(req)
        const result = await aiCreateDraft(ctx, config, settings, body)
        return sendJson(res, result.ok ? 200 : 400, result)
      }

      if (route === '/skill' && req.method === 'GET') {
        const settings = await readSettings(config)
        const result = await readSkillFile(config, settings, url.searchParams.get('path'))
        return sendJson(res, result.ok ? 200 : 404, result)
      }

      /* ------------------------------------------- 飞书文档（文档信息） */

      if (route === '/docs' && req.method === 'GET') {
        return sendJson(res, 200, { items: await readDocs(config) })
      }

      if (route === '/doc' && req.method === 'GET') {
        const result = await readDocContent(config, url.searchParams.get('id'))
        return sendJson(res, result.ok ? 200 : 404, result)
      }

      if (route === '/doc/fetch' && req.method === 'POST') {
        const body = await readBody(req)
        const result = await fetchFeishuDoc(config, body)
        return sendJson(res, result.ok ? 200 : 502, result)
      }

      if (route === '/doc/remove' && req.method === 'POST') {
        const body = await readBody(req)
        return sendJson(res, 200, await removeDoc(config, body?.id))
      }

      /* --------------------------------------- 专家团全流程（流水线） */

      if (route === '/flows' && req.method === 'GET') {
        return sendJson(res, 200, {
          items: await readFlows(config),
          stages: FLOW_STAGES,
          statuses: FLOW_STATUS,
          evidenceKinds: FLOW_EVIDENCE_KINDS,
        })
      }

      if (route === '/flows' && req.method === 'POST') {
        const body = await readBody(req)
        const title = String(body?.title ?? '').trim()
        if (!title) return sendJson(res, 400, { error: '缺一条任务/需求，先选一条再开始全流程' })
        const team = String(body?.team ?? '').trim()
        const stages = (Array.isArray(body?.stages) && body.stages.length ? body.stages : FLOW_STAGES.map((stage) => stage.id)).map(String)
        const event = {
          type: 'create',
          id: `flow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          at: new Date().toISOString(),
          recordId: String(body?.recordId ?? ''),
          tableKey: String(body?.tableKey ?? ''),
          title,
          team,
          teamName: String(body?.teamName ?? ''),
          stages,
        }
        await appendFlow(config, event)
        return sendJson(res, 200, { ok: true, flow: event, items: await readFlows(config) })
      }

      if (route === '/flows/stage' && req.method === 'POST') {
        const body = await readBody(req)
        const id = String(body?.id ?? '').trim()
        const stage = String(body?.stage ?? '').trim()
        const status = String(body?.status ?? '').trim()
        if (!id || !stage) return sendJson(res, 400, { error: '缺少流水线 id 或阶段 id' })
        if (status && !FLOW_STATUS_IDS.includes(status)) return sendJson(res, 400, { error: `阶段状态不合法：${status}` })
        // 不变式：done 必然有凭据。前端漏判时这里兜底降级，免得台账里出现「没凭据的已完成」。
        let nextStatus = status
        if (status === 'done') {
          const current = (await readFlows(config)).find((flow) => flow.id === id)
          const target = current?.stages.find((entry) => entry.id === stage)
          if (!(target?.evidence?.length)) nextStatus = 'done_unverified'
        }
        await appendFlow(config, {
          type: 'stage',
          id,
          at: new Date().toISOString(),
          stage,
          status: nextStatus || undefined,
          note: body?.note === undefined ? undefined : String(body.note),
        })
        return sendJson(res, 200, { ok: true, downgraded: nextStatus !== status, items: await readFlows(config) })
      }

      if (route === '/flows/evidence' && req.method === 'POST') {
        const body = await readBody(req)
        const id = String(body?.id ?? '').trim()
        const stage = String(body?.stage ?? '').trim()
        const kind = String(body?.kind ?? '').trim() || 'command'
        const summary = String(body?.summary ?? '').trim()
        if (!id || !stage) return sendJson(res, 400, { error: '缺少流水线 id 或阶段 id' })
        if (!FLOW_EVIDENCE_KIND_IDS.includes(kind)) return sendJson(res, 400, { error: `凭据类型不合法：${kind}` })
        if (!summary) {
          return sendJson(res, 400, {
            error: '凭据不能为空：一句「已完成」不算凭据，写清楚改了什么 / 跑了什么命令 / 结果如何',
          })
        }
        await appendFlow(config, {
          type: 'evidence',
          id,
          at: new Date().toISOString(),
          stage,
          kind,
          summary: summary.slice(0, EVIDENCE_MAX_CHARS),
          ref: String(body?.ref ?? '').slice(0, 300),
        })
        return sendJson(res, 200, { ok: true, items: await readFlows(config) })
      }

      if (route === '/flows/evidence/remove' && req.method === 'POST') {
        const body = await readBody(req)
        const id = String(body?.id ?? '').trim()
        const stage = String(body?.stage ?? '').trim()
        const targetAt = String(body?.at ?? '').trim()
        if (!id || !stage || !targetAt) return sendJson(res, 400, { error: '缺少流水线 id、阶段 id 或凭据时间' })
        await appendFlow(config, { type: 'evidence-remove', id, at: new Date().toISOString(), stage, targetAt })
        return sendJson(res, 200, { ok: true, items: await readFlows(config) })
      }

      if (route === '/flows/remove' && req.method === 'POST') {
        const body = await readBody(req)
        const id = String(body?.id ?? '').trim()
        if (!id) return sendJson(res, 400, { error: '缺少流水线 id' })
        await appendFlow(config, { type: 'remove', id, at: new Date().toISOString() })
        return sendJson(res, 200, { ok: true, items: await readFlows(config) })
      }

      /* --------------------------------------- 项目里 skill 产出的 spec 文档 */

      if (route === '/spec-scan' && req.method === 'GET') {
        const settings = await readSettings(config)
        const listing = await listSpecFiles(config, settings)
        return sendJson(res, 200, listing)
      }

      if (route === '/spec-read' && req.method === 'POST') {
        const body = await readBody(req)
        const settings = await readSettings(config)
        const target = String(body?.path ?? '').trim()
        if (!target) return sendJson(res, 400, { error: '缺少 spec 文件路径' })
        const result = await readSpecFile(config, settings, target)
        return sendJson(res, result.ok ? 200 : 400, result)
      }

      /* --------------------------------------- 更新日志（包内 CHANGELOG.md） */

      if (route === '/changelog' && req.method === 'GET') {
        return sendJson(res, 200, await readChangelog())
      }

      return sendJson(res, 404, { error: `未知接口 ${route}` })
    } catch (error) {
      return sendJson(res, 500, { error: String(error?.message ?? error) })
    }
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler }))
}
