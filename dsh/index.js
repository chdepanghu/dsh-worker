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
import { existsSync } from 'node:fs'
import { readFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
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

/** lark-cli 在本机是 .ps1 包装脚本，必须交给 PowerShell 执行。 */
function shellWrapper(command) {
  const lower = command.toLowerCase()
  if (lower.endsWith('.ps1')) {
    return { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', command] }
  }
  if (lower.endsWith('.cmd') || lower.endsWith('.bat')) {
    return { file: 'cmd.exe', args: ['/d', '/s', '/c', command] }
  }
  return { file: command, args: [] }
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
  filters: [], // [{ field, values: [], text: '' }] 字段级筛选（选项多选 / 文本包含）
  groupField: '状态', // 卡片看板按哪个字段分模块
  cardSummaryField: '', // 卡片上展示的内容字段（空 = 原始需求）
  listFields: [], // 汇总清单显示的列（空 = 自动挑）
  moduleOrder: [], // 模块手工排序
  hiddenModules: [], // 隐藏的模块
  collapsedModules: [], // 折叠的模块
  writeBackOnDrag: false, // 拖动卡片换模块时是否回写飞书
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
    return {
      ...DEFAULT_VIEW,
      ...source,
      filters: Array.isArray(source.filters)
        ? source.filters
            .filter((item) => item && typeof item.field === 'string' && item.field)
            .map((item) => ({ field: item.field, values: asStringArray(item.values), text: String(item.text ?? '') }))
        : [],
      listFields: asStringArray(source.listFields),
      moduleOrder: asStringArray(source.moduleOrder),
      hiddenModules: asStringArray(source.hiddenModules),
      collapsedModules: asStringArray(source.collapsedModules),
      writeBackOnDrag: Boolean(source.writeBackOnDrag),
    }
  } catch {
    return { ...DEFAULT_VIEW, filters: [], listFields: [], moduleOrder: [], hiddenModules: [], collapsedModules: [] }
  }
}

async function writeView(config, patch) {
  const current = await readView(config)
  const next = { ...current }
  if (Array.isArray(patch?.filters)) {
    next.filters = patch.filters
      .filter((item) => item && typeof item.field === 'string' && item.field)
      .map((item) => ({ field: item.field, values: asStringArray(item.values), text: String(item.text ?? '') }))
  }
  if (typeof patch?.groupField === 'string') next.groupField = patch.groupField
  if (typeof patch?.cardSummaryField === 'string') next.cardSummaryField = patch.cardSummaryField
  if (Array.isArray(patch?.listFields)) next.listFields = asStringArray(patch.listFields)
  if (Array.isArray(patch?.moduleOrder)) next.moduleOrder = asStringArray(patch.moduleOrder)
  if (Array.isArray(patch?.hiddenModules)) next.hiddenModules = asStringArray(patch.hiddenModules)
  if (Array.isArray(patch?.collapsedModules)) next.collapsedModules = asStringArray(patch.collapsedModules)
  if (typeof patch?.writeBackOnDrag === 'boolean') next.writeBackOnDrag = patch.writeBackOnDrag
  next.updatedAt = new Date().toISOString()
  await mkdir(dirname(viewFile(config)), { recursive: true })
  await writeFile(viewFile(config), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
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
async function matrixToRecords(wrapper, source, stdout) {
  let parsed
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return []
  }
  const rows = parsed?.data?.data
  if (!Array.isArray(rows) || !rows.length) return extractRecords(parsed)
  if (rows.every((row) => !Array.isArray(row))) return extractRecords(parsed)
  const listed = await runCommand(wrapper.file, [
    ...wrapper.args,
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
  let names = []
  try {
    names = (JSON.parse(listed.stdout)?.data?.fields ?? []).map((field) => field.name)
  } catch {
    names = []
  }
  if (!names.length || names.length !== rows[0].length) return []
  return rows.map((row) => ({
    record_id: '',
    fields: Object.fromEntries(names.map((name, index) => [name, row[index]])),
  }))
}

function describeRead(source) {
  return `lark-cli base +record-list --base-token ${source.baseToken} --table-id ${source.tableId} --as ${source.identity}`
}

async function fetchRequirements(config, settings) {
  const source = await resolveRequirementsSource(config, settings)
  if (!source.configured) {
    return { configured: false, items: [], source: publicSource(source), message: '还没有配置飞书多维表格（可以选项目里已有的需求源，或手动粘贴链接）' }
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

  const ndjson = await runCommand(wrapper.file, [...wrapper.args, ...common, '--limit', '2000', '--format', 'ndjson', '--output', outFile, '--overwrite'])
  let records = []
  let fetchMode = 'ndjson'
  let warning = ''
  if (ndjson.ok) {
    const text = await readFile(outFile, 'utf8').catch(() => '')
    records = parseLarkRecords(text)
    await rm(outFile, { force: true }).catch(() => {})
  } else {
    fetchMode = 'json'
    const json = await runCommand(wrapper.file, [...wrapper.args, ...common, '--limit', '200', '--format', 'json'])
    if (!json.ok) {
      return {
        configured: true,
        items: [],
        source: publicSource(source),
        error: '读取飞书多维表格失败',
        detail: (json.stderr || json.stdout || ndjson.stderr || '').trim().slice(0, 1500),
        command: describeRead(source),
      }
    }
    records = await matrixToRecords(wrapper, source, json.stdout)
    if (!records.length) warning = '表格返回的是值矩阵，但没有拿到可对齐的列名，请把字段名补进需求源配置。'
  }

  const items = records.map((record) => normalizeRecord(record, settings, source.fieldMap))
  return { configured: true, items, count: items.length, source: publicSource(source), fetchMode, warning }
}

async function updateRequirementStatus(config, settings, body) {
  const source = await resolveRequirementsSource(config, settings)
  if (!source.configured) return { ok: false, error: '还未配置飞书多维表格' }
  const recordId = String(body?.recordId ?? '').trim()
  const status = String(body?.status ?? '').trim()
  if (!recordId || !status) return { ok: false, error: '缺少记录 ID 或状态值' }
  const statusField = String(body?.field ?? '').trim() || settings.statusField || source.fieldMap?.status || '状态'
  const larkCli = await resolveLarkCli(config.larkCli)
  const wrapper = shellWrapper(larkCli)
  const args = [
    ...wrapper.args,
    'base',
    '+record-update',
    '--base-token',
    source.baseToken,
    '--table-id',
    source.tableId,
    '--record-id',
    recordId,
    '--fields-json',
    JSON.stringify({ [statusField]: status }),
    '--as',
    source.identity,
  ]
  const result = await runCommand(wrapper.file, args)
  if (!result.ok) {
    return {
      ok: false,
      error: '回写飞书失败',
      detail: (result.stderr || result.stdout || '').trim().slice(0, 1500),
      hint: `按本机 lark-cli 的实际参数名调整（当前用 --fields-json，字段名「${statusField}」）`,
    }
  }
  return { ok: true, field: statusField, status }
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

async function fetchFieldSchema(config, settings) {
  const source = await resolveRequirementsSource(config, settings)
  if (!source.configured) {
    return { configured: false, fields: [], source: publicSource(source), message: '还没有配置飞书多维表格' }
  }
  const cacheFile = fieldSchemaFile(config, source.tableId)
  const cached = await readFile(cacheFile, 'utf8')
    .then((text) => JSON.parse(text))
    .catch(() => null)
  if (cached && Array.isArray(cached.fields) && Date.now() - Number(cached.cachedAt ?? 0) < FIELD_SCHEMA_TTL_MS) {
    return { configured: true, fields: cached.fields, source: publicSource(source), cachedAt: cached.cachedAt, fromCache: true }
  }
  const larkCli = await resolveLarkCli(config.larkCli)
  const wrapper = shellWrapper(larkCli)
  const result = await runCommand(wrapper.file, [
    ...wrapper.args,
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
      return { configured: true, fields: cached.fields, source: publicSource(source), cachedAt: cached.cachedAt, fromCache: true, warning: '读表结构失败，用的是上次缓存' }
    }
    return {
      configured: true,
      fields: [],
      source: publicSource(source),
      error: '读取表结构失败',
      detail: (result.stderr || result.stdout || '').trim().slice(0, 1000),
      command: `lark-cli base +field-list --base-token ${source.baseToken} --table-id ${source.tableId} --as ${source.identity}`,
    }
  }
  const cachedAt = Date.now()
  await mkdir(dirname(cacheFile), { recursive: true })
  await writeFile(cacheFile, `${JSON.stringify({ tableId: source.tableId, cachedAt, fields }, null, 2)}\n`, 'utf8')
  return { configured: true, fields, source: publicSource(source), cachedAt }
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
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 1024 * 1024) req.destroy()
    })
    req.on('end', () => {
      if (!data) return resolvePromise({})
      try {
        resolvePromise(JSON.parse(data))
      } catch {
        resolvePromise({})
      }
    })
    req.on('error', () => resolvePromise({}))
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
        return sendJson(res, 200, await fetchFieldSchema(config, settings))
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
        const result = await fetchRequirements(config, settings)
        return sendJson(res, 200, result)
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
