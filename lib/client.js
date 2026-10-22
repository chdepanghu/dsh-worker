/**
 * 需求开发工作台 · 客户端入口（已构建的单文件模块）
 *
 * 形态：标准分栏里的业务面板。面板内部左侧是「可选模块」，右侧是当前模块内容；
 * 模块列表后续可继续追加，不改动外壳。面板按自身容器宽度重排（不依赖整窗断点）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-requirement-dev-workbench',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const API = '/api/requirement-dev-workbench'
    const WORKBENCH_VERSION = '3.2.0'
    const STYLE_ID = 'rdw-business-panel-styles'

    const CSS = `
.rdw-root{display:flex;height:100%;min-height:0;min-width:0;overflow:hidden;background:var(--dsw-alias-bg-base,#16181d);color:var(--dsw-alias-label-primary,#e8eaed);font-size:13px;line-height:1.55;font-family:inherit}
.rdw-root *{box-sizing:border-box}
.rdw-rail{flex:0 0 128px;display:flex;flex-direction:column;gap:4px;padding:10px 8px;border-right:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));background:var(--dsw-specific-sidebar-fill,var(--dsw-alias-bg-layer-1,rgba(255,255,255,.03)));overflow:auto}
.rdw-rail-title{font-size:11px;letter-spacing:.04em;color:var(--dsw-alias-label-secondary,#9aa0a6);padding:2px 6px 6px;white-space:normal;overflow-wrap:anywhere}
.rdw-mod{display:flex;align-items:center;gap:8px;padding:7px 8px;border:1px solid transparent;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;min-height:32px;white-space:normal;overflow-wrap:anywhere;width:100%}
.rdw-mod:hover{background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.06))}
.rdw-mod[aria-current="true"]{background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.08));border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.16))}
.rdw-mod:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4c8dff);outline-offset:1px}
.rdw-mod-glyph{flex:0 0 auto;width:18px;text-align:center;font-size:14px}
.rdw-mod-label{min-width:0;overflow-wrap:anywhere}
.rdw-main{flex:1 1 auto;min-width:0;min-height:0;display:flex;flex-direction:column}
.rdw-head{flex:0 0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09))}
.rdw-head h2{margin:0;font-size:13.5px;font-weight:600}
.rdw-head .rdw-count{color:var(--dsw-alias-label-secondary,#9aa0a6);font-size:12px}
.rdw-grow{flex:1 1 auto}
.rdw-body{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.rdw-split{flex:1 1 auto;min-height:0;display:flex;min-width:0}
.rdw-col{min-width:0;min-height:0;display:flex;flex-direction:column}
.rdw-col-list{flex:0 0 var(--rdw-list-w,44%);border-right:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09))}
.rdw-col-detail{flex:1 1 auto}
.rdw-scroll{flex:1 1 auto;min-height:0;overflow:auto;padding:10px 12px}
.rdw-stack{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
.rdw-item{display:flex;flex-direction:column;gap:4px;width:100%;text-align:left;font:inherit;color:inherit;background:transparent;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));border-radius:8px;padding:8px 10px;margin-bottom:8px;cursor:pointer;min-height:44px}
.rdw-item:hover{background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.06))}
.rdw-item[aria-current="true"]{border-color:var(--dsw-alias-brand-primary,#4c8dff)}
.rdw-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4c8dff);outline-offset:1px}
.rdw-item-title{font-weight:600;overflow-wrap:anywhere}
.rdw-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;color:var(--dsw-alias-label-secondary,#9aa0a6);font-size:12px;min-width:0}
.rdw-chip{border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.2));border-radius:999px;padding:1px 8px;font-size:11.5px;white-space:normal;overflow-wrap:anywhere;max-width:100%}
.rdw-chip.ok{color:var(--dsw-alias-state-success-primary,#3ecf8e);border-color:currentColor}
.rdw-chip.warn{color:var(--dsw-alias-state-warn-primary,#e2b341);border-color:currentColor}
.rdw-chip.err{color:var(--dsw-alias-state-error-primary,#ef6b6b);border-color:currentColor}
.rdw-btn{font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.07));border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.18));border-radius:7px;padding:5px 10px;cursor:pointer;min-height:28px;white-space:nowrap}
.rdw-btn:hover{background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.12))}
.rdw-btn:disabled{opacity:.5;cursor:not-allowed}
.rdw-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4c8dff);outline-offset:1px}
.rdw-btn.primary{border-color:var(--dsw-alias-brand-primary,#4c8dff);color:var(--dsw-alias-brand-primary,#8fb6ff)}
.rdw-link{background:none;border:none;color:var(--dsw-alias-brand-primary,#8fb6ff);cursor:pointer;font:inherit;padding:0;text-decoration:underline}
.rdw-link:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4c8dff);outline-offset:1px}
.rdw-input,.rdw-textarea{font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.04));border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.18));border-radius:7px;padding:6px 8px;width:100%;min-width:0}
.rdw-input:focus,.rdw-textarea:focus{outline:2px solid var(--dsw-alias-brand-primary,#4c8dff);outline-offset:1px}
.rdw-textarea{min-height:132px;resize:vertical;white-space:pre-wrap;overflow-wrap:anywhere;font-family:ui-monospace,Consolas,monospace;font-size:12px}
.rdw-field{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}
.rdw-field label{font-size:12px;color:var(--dsw-alias-label-secondary,#9aa0a6)}
.rdw-note{color:var(--dsw-alias-label-secondary,#9aa0a6);font-size:12px;overflow-wrap:anywhere}
.rdw-card{border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));border-radius:10px;padding:12px;background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.03));overflow-wrap:anywhere}
.rdw-card h3{margin:0 0 8px;font-size:13px}
.rdw-kv{display:grid;grid-template-columns:minmax(72px,26%) 1fr;gap:4px 10px;margin:0}
.rdw-kv dt{color:var(--dsw-alias-label-secondary,#9aa0a6);font-size:12px;overflow-wrap:anywhere}
.rdw-kv dd{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}
.rdw-error{border:1px solid var(--dsw-alias-state-error-primary,#ef6b6b);border-radius:8px;padding:10px;background:rgba(239,107,107,.08);overflow-wrap:anywhere}
.rdw-empty{padding:18px 4px;color:var(--dsw-alias-label-secondary,#9aa0a6);text-align:center;overflow-wrap:anywhere}
.rdw-pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-family:ui-monospace,Consolas,monospace;font-size:12px}
.rdw-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
.rdw-toolbar .rdw-input{flex:1 1 150px;width:auto}
.rdw-narrow .rdw-rail{flex:0 0 auto;flex-direction:row;flex-wrap:wrap;align-items:center;border-right:none;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));padding:8px}
.rdw-narrow .rdw-rail-title{width:100%}
.rdw-narrow .rdw-mod{width:auto;flex:0 1 auto}
.rdw-seg{display:inline-flex;gap:4px;flex-wrap:wrap}
.rdw-seg .rdw-btn[aria-pressed="true"]{background:var(--dsw-alias-brand-primary,#8fb6ff);color:#10131a;border-color:transparent;font-weight:600}
.rdw-tablewrap{overflow:auto;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));border-radius:10px;max-height:58vh}
.rdw-table{border-collapse:collapse;width:100%;font-size:12.5px}
.rdw-table th,.rdw-table td{border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));padding:6px 9px;text-align:left;vertical-align:top;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rdw-table th{position:sticky;top:0;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.07));z-index:1;font-weight:600;white-space:nowrap}
.rdw-table tbody tr{cursor:pointer}
.rdw-table tbody tr:hover{background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.04))}
.rdw-table tbody tr.is-selected{background:rgba(143,182,255,.14)}
.rdw-board{display:flex;flex-direction:column;gap:12px}
.rdw-module{border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));border-radius:10px;background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.03));padding:8px;transition:border-color .12s,background .12s}
.rdw-module.is-drop{border-color:var(--dsw-alias-brand-primary,#8fb6ff);background:rgba(143,182,255,.10)}
.rdw-module-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:2px 4px 8px;cursor:grab}
.rdw-module-head strong{overflow-wrap:anywhere}
.rdw-handle{color:var(--dsw-alias-label-secondary,#9aa0a6);cursor:grab;font-size:13px}
.rdw-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
.rdw-kcard{border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));border-radius:9px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.04));padding:9px 10px;cursor:grab;display:flex;flex-direction:column;gap:6px;min-height:56px;overflow-wrap:anywhere}
.rdw-kcard:hover{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.2))}
.rdw-kcard.is-selected{border-color:var(--dsw-alias-brand-primary,#8fb6ff);box-shadow:0 0 0 1px rgba(143,182,255,.5)}
.rdw-kcard.is-dragging{opacity:.45}
.rdw-kcard-summary{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.rdw-detailwrap{margin-top:12px;border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));padding-top:10px}
.rdw-detail{display:flex;flex-direction:column;gap:2px}
.rdw-detail h3{overflow-wrap:anywhere}
.rdw-config{margin-bottom:12px}
.rdw-cfg-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
.rdw-checks{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.rdw-checkrow{display:inline-flex;align-items:center;gap:5px;font-size:12px;padding:2px 6px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));border-radius:6px;cursor:pointer;max-width:100%}
.rdw-filterrow{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px;padding:6px;border:1px dashed var(--dsw-alias-border-l1,rgba(255,255,255,.12));border-radius:8px}
.rdw-filterrow>.rdw-input{flex:0 1 150px;width:auto}
.rdw-narrow .rdw-split{flex-direction:column}
.rdw-mod-add{opacity:.75}
.rdw-mod-add:hover{opacity:1}
.rdw-tablecard{margin-bottom:10px}
.rdw-bar{height:8px;border-radius:99px;background:var(--dsw-alias-bg-layer-3,rgba(255,255,255,.10));overflow:hidden}
.rdw-bar>i{display:block;height:100%;background:var(--dsw-alias-brand-primary,#8fb6ff);border-radius:99px;transition:width .2s}
.rdw-barrow{display:flex;align-items:center;gap:8px;margin-top:6px}
.rdw-barlabel{flex:0 0 120px;font-size:12px;color:var(--dsw-alias-label-secondary,#9aa0a6);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rdw-barrow .rdw-bar{flex:1}
.rdw-buckets{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.rdw-progress{display:flex;flex-direction:column;gap:4px}
.rdw-samplelist{margin:8px 0 0;padding-left:18px;font-size:12.5px;color:var(--dsw-alias-label-secondary,#c9ced6)}
.rdw-samplelist li{margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rdw-sample-title{color:var(--dsw-alias-label-primary,#e8eaed)}
.rdw-runrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:7px 9px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));border-radius:8px;margin-bottom:6px}
.rdw-runrow strong{overflow-wrap:anywhere}
.rdw-narrow .rdw-col-list{flex:0 0 auto;max-height:44%;border-right:none;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09))}
/* ---- 自定义框架（customFrame）：自己的顶栏 + 左侧导航 + 右侧内容 + 可选原生对话 ---- */
.rdw-frame{display:flex;flex-direction:column;flex:1 1 auto;width:100%;min-height:0;min-width:0;overflow:hidden;background:var(--dsw-alias-bg-base,#16181d);color:var(--dsw-alias-label-primary,#e8eaed);font-size:13px;line-height:1.55;font-family:inherit}
.rdw-frame *{box-sizing:border-box}
.rdw-hostbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));flex:0 0 auto;background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.02))}
.rdw-frame-body{display:flex;flex:1 1 auto;min-height:0;min-width:0;overflow:hidden}
.rdw-business-host{position:relative;display:flex;min-width:0;min-height:0;overflow:hidden}
.rdw-chatwrap{flex-direction:column;min-width:0;min-height:0;overflow:hidden;border-left:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09))}
.rdw-rail{overflow-y:auto}
.rdw-rail-foot{margin-top:auto;display:flex;flex-direction:column;gap:4px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09))}
.rdw-narrow .rdw-root{flex-direction:column}
`

    function ensureStyles() {
      if (typeof document === 'undefined') return
      if (document.getElementById(STYLE_ID)) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
    }

    /** Windows 上外壳带自定义标题栏时要给顶栏留出拖拽区高度（参考 SEO/GEO 工作台的做法）。 */
    function hasWindowsTitlebar() {
      try {
        return typeof document !== 'undefined' && Boolean(document.body?.classList?.contains('dsh-desktop-windows-titlebar-layout'))
      } catch {
        return false
      }
    }

    async function api(path, options) {
      const response = await fetch(`${API}${path}`, {
        headers: { 'content-type': 'application/json' },
        ...options,
      })
      const text = await response.text()
      let payload = {}
      try {
        payload = text ? JSON.parse(text) : {}
      } catch {
        payload = { error: text.slice(0, 400) }
      }
      if (!response.ok) throw Object.assign(new Error(payload.error || `请求失败（${response.status}）`), { payload })
      return payload
    }

    /** 按业务容器的实际宽度切换紧凑形态，而不是按整窗宽度。 */
    function useContainerWidth() {
      const ref = useRef(null)
      const [width, setWidth] = useState(720)
      useEffect(() => {
        const node = ref.current
        if (!node) return undefined
        const measure = () => setWidth(node.getBoundingClientRect().width || 0)
        measure()
        if (typeof ResizeObserver === 'undefined') {
          window.addEventListener('resize', measure)
          return () => window.removeEventListener('resize', measure)
        }
        const observer = new ResizeObserver(measure)
        observer.observe(node)
        return () => observer.disconnect()
      }, [])
      return [ref, width]
    }

    function Field({ label, value, placeholder, onChange, textarea }) {
      return h(
        'div',
        { className: 'rdw-field' },
        h('label', null, label),
        textarea
          ? h('textarea', { className: 'rdw-textarea', value: value ?? '', placeholder, onChange: (event) => onChange(event.target.value), spellCheck: false })
          : h('input', { className: 'rdw-input', value: value ?? '', placeholder, onChange: (event) => onChange(event.target.value), spellCheck: false }),
      )
    }

    function Chip({ tone, children }) {
      return h('span', { className: `rdw-chip${tone ? ` ${tone}` : ''}` }, children)
    }

    function statusTone(status) {
      const text = String(status ?? '')
      if (!text) return ''
      if (/完成|已发|done|closed|merged|已上/i.test(text)) return 'ok'
      if (/开发中|进行|doing|in ?progress|测试/i.test(text)) return 'warn'
      if (/阻塞|挂起|blocked|拒绝|reject|失败/i.test(text)) return 'err'
      return ''
    }

    /** 进度口径：「已完成/通过」算完成，「开发中/联调中」算进行中。 */
    const DONE_WORDS = ['已完成', '通过', '已验收', '已合并', 'done', 'closed']
    const ACTIVE_WORDS = ['开发中', '联调中', '评审中', '进行中', '已领取', 'in progress']

    function summarizeBuckets(items, field) {
      const buckets = new Map()
      for (const item of items) {
        const value = String(item.fields?.[field] ?? '').trim() || '（未填写）'
        buckets.set(value, (buckets.get(value) ?? 0) + 1)
      }
      const list = [...buckets.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count)
      const sumOf = (words) =>
        list.filter((entry) => words.some((word) => entry.value.toLowerCase().includes(word.toLowerCase()))).reduce((sum, entry) => sum + entry.count, 0)
      const done = sumOf(DONE_WORDS)
      const active = sumOf(ACTIVE_WORDS)
      const total = items.length
      return { field, buckets: list, done, active, todo: Math.max(0, total - done - active), total, percent: total ? Math.round((done / total) * 100) : 0 }
    }

    const RUN_STATUS = [
      { id: 'handed-off', label: '已交付' },
      { id: 'in-progress', label: '进行中' },
      { id: 'done', label: '已完成' },
      { id: 'blocked', label: '受阻' },
    ]

    const RUN_LABEL = Object.fromEntries(RUN_STATUS.map((entry) => [entry.id, entry.label]))

    function formatTime(value) {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value ?? '')
      const pad = (number) => String(number).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    function buildInstruction(item, settings, skills) {
      const lines = []
      lines.push(`请在本地项目「${settings.projectDir || '（还没选择项目目录）'}」里完成下面这条开发需求。`)
      lines.push('')
      lines.push(`需求标题：${item.title}`)
      if (item.code) lines.push(`需求编号：${item.code}`)
      if (item.status) lines.push(`当前状态：${item.status}`)
      if (item.project) lines.push(`所属项目：${item.project}`)
      if (item.owner) lines.push(`负责人：${item.owner}`)
      if (item.priority) lines.push(`优先级：${item.priority}`)
      const blocks = [
        ['原始需求', item.rawRequirement],
        ['详细设计', item.design],
        ['详细设计链接', item.designLink],
        ['开发补充描述', item.devSupplement],
        ['验收标准', item.acceptance],
      ].filter((pair) => pair[1])
      for (const [label, value] of blocks) {
        lines.push('')
        lines.push(`【${label}】`)
        lines.push(String(value))
      }
      const shown = new Set(['需求标题', '需求编号', '状态', '负责人', '优先级', '原始需求', '详细设计', '详细设计链接', '开发补充描述', '验收标准'])
      const rest = Object.entries(item.fields ?? {}).filter(([key, value]) => value && !shown.has(key))
      if (rest.length) {
        lines.push('')
        lines.push('其它字段：')
        for (const [key, value] of rest) lines.push(`- ${key}：${value}`)
      }
      lines.push('')
      lines.push('开发要求：')
      lines.push('1. 先按该项目已有的开发规范与 skill 走流程（例如 feature-dev）；本工作台的「技能与规范」里能看到可用清单。')
      lines.push('2. 前后端都改到位，改完自己跑验证命令，并给出验证结果与未覆盖项。')
      lines.push('3. 不要改动与本需求无关的文件。')
      if (settings.projectDir) {
        lines.push(`4. 工作目录固定为：${settings.projectDir}`)
      }
      if (skills?.items?.length) {
        const names = skills.items.slice(0, 8).map((skill) => skill.name).join('、')
        lines.push('')
        lines.push(`可用 skill（节选）：${names}`)
      }
      return lines.join('\n')
    }

    /* ------------------------------------------------------- 开发需求模块 */

    const SEARCH_KEYS = ['title', 'status', 'project', 'owner', 'code', 'rawRequirement']

    /** 取某条需求在某个飞书字段上的值（标题走归一化后的 title）。 */
    function recordValue(item, field) {
      if (!field) return ''
      if (field === '需求标题') return String(item.title ?? '')
      return String(item.fields?.[field] ?? '')
    }

    function applyOverrides(items, overrides) {
      const keys = Object.keys(overrides ?? {})
      if (!keys.length) return items
      return items.map((item) => {
        const patch = overrides[item.id]
        if (!patch) return item
        return { ...item, fields: { ...item.fields, ...patch } }
      })
    }

    function matchesFilters(item, filters) {
      for (const filter of filters ?? []) {
        const raw = recordValue(item, filter.field)
        if (filter.values?.length && !filter.values.includes(raw)) return false
        if (filter.text && !raw.toLowerCase().includes(String(filter.text).toLowerCase())) return false
      }
      return true
    }

    const DEFAULT_LIST_FIELDS = ['需求编号', '需求标题', '状态', '需求类型', '优先级', '所属项目', '负责人', '期望完成时间']

    function defaultListFields(schemaFields, items) {
      const available = new Set(schemaFields.length ? schemaFields.map((field) => field.name) : Object.keys(items[0]?.fields ?? {}))
      const picked = DEFAULT_LIST_FIELDS.filter((name) => available.has(name))
      if (picked.length) return picked
      return [...available].slice(0, 6)
    }

    /** 按分组字段把需求切成若干模块，顺序遵循：手工排序 -> 字段选项顺序 -> 名称。 */
    function buildModules(items, groupField, schemaFields, view) {
      const buckets = new Map()
      for (const item of items) {
        const key = recordValue(item, groupField) || '（未填写）'
        if (!buckets.has(key)) buckets.set(key, [])
        buckets.get(key).push(item)
      }
      const manual = view?.moduleOrder ?? []
      const options = schemaFields.find((field) => field.name === groupField)?.options ?? []
      const rank = (key, list) => {
        const index = list.indexOf(key)
        return index === -1 ? 999 : index
      }
      return [...buckets.keys()]
        .sort((a, b) => {
          const byManual = rank(a, manual) - rank(b, manual)
          if (byManual) return byManual
          const byOption = rank(a, options) - rank(b, options)
          if (byOption) return byOption
          return String(a).localeCompare(String(b), 'zh')
        })
        .map((key) => ({ key, items: buckets.get(key) }))
    }

    /** 一张飞书表的模块：汇总清单 / 卡片看板 / 进度。表由外部传入，可多开。 */
    function TableModule({ state, reloadState, uiWorkspace, table, view, saveView, runs, handOff, onUpdateRun, onOpenTable, onAddModule }) {
      const [data, setData] = useState({ configured: false, items: [] })
      const [schema, setSchema] = useState(null)
      const [loading, setLoading] = useState(false)
      const [failure, setFailure] = useState(null)
      const [query, setQuery] = useState('')
      const [selectedId, setSelectedId] = useState('')
      const [showSettings, setShowSettings] = useState(false)
      const [showConfig, setShowConfig] = useState(false)
      const [mode, setMode] = useState('list')
      const [toast, setToast] = useState('')
      const [instruction, setInstruction] = useState('')
      const [skills, setSkills] = useState(null)
      const [sources, setSources] = useState(null)
      const [overrides, setOverrides] = useState({})
      const [drag, setDrag] = useState(null)
      const [dropTarget, setDropTarget] = useState('')
      const [progressField, setProgressField] = useState('')

      const settings = state?.settings ?? {}
      const tableKey = table?.key ?? ''
      const tableQuery = tableKey ? `?table=${encodeURIComponent(tableKey)}` : ''

      const loadSources = useCallback(async () => {
        try {
          setSources(await api('/sources'))
        } catch {
          setSources(null)
        }
      }, [])

      const loadFields = useCallback(async () => {
        if (!tableKey) {
          setSchema(null)
          return
        }
        try {
          setSchema(await api(`/fields${tableQuery}`))
        } catch {
          setSchema(null)
        }
      }, [tableKey, tableQuery])

      useEffect(() => {
        loadSources()
      }, [loadSources, settings.projectDir])

      useEffect(() => {
        if (state?.configured) loadFields()
      }, [state?.configured, loadFields])

      const load = useCallback(
        async (fresh = false) => {
          if (!tableKey) return
          setLoading(true)
          setFailure(null)
          try {
            const params = [`table=${encodeURIComponent(tableKey)}`]
            if (fresh) params.push('fresh=1')
            const result = await api(`/requirements?${params.join('&')}`)
            setData(result)
            if (result.error) setFailure({ message: result.error, detail: result.detail, command: result.command })
          } catch (error) {
            setFailure({ message: error.message })
          } finally {
            setLoading(false)
          }
        },
        [tableKey],
      )

      useEffect(() => {
        if (state?.configured) load()
      }, [state?.configured, load])

      useEffect(() => {
        if (!selectedId) return undefined
        let alive = true
        api('/skills')
          .then((result) => {
            if (alive) setSkills(result)
          })
          .catch(() => {})
        return () => {
          alive = false
        }
      }, [selectedId])

      const schemaFields = schema?.fields ?? []
      const optionFields = useMemo(
        () => schemaFields.filter((field) => field.options?.length),
        [schemaFields],
      )
      const textFields = useMemo(
        () => schemaFields.filter((field) => !field.options?.length),
        [schemaFields],
      )
      const items = useMemo(() => applyOverrides(Array.isArray(data.items) ? data.items : [], overrides), [data.items, overrides])
      const activeFilters = view?.filters ?? []
      const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase()
        return items.filter((item) => {
          if (!matchesFilters(item, activeFilters)) return false
          if (!needle) return true
          return SEARCH_KEYS.some((key) => String(item[key] ?? '').toLowerCase().includes(needle))
        })
      }, [items, query, activeFilters])
      const selected = items.find((item) => item.id === selectedId) || null
      const groupField = view?.groupField || '状态'
      const listFields = useMemo(() => {
        if (view?.listFields?.length) return view.listFields
        return defaultListFields(schemaFields, items)
      }, [view, schemaFields, items])
      const modules = useMemo(() => buildModules(filtered, groupField, schemaFields, view), [filtered, groupField, schemaFields, view])
      const visibleModules = modules.filter((module) => !(view?.hiddenModules ?? []).includes(module.key))
      const progressFieldValue = progressField || view?.groupField || '状态'
      const progress = useMemo(() => summarizeBuckets(items, progressFieldValue), [items, progressFieldValue])
      const itemRuns = (runs ?? []).filter((run) => run.recordId && run.recordId === selectedId)

      const saveSettings = async (patch) => {
        setToast('')
        try {
          await api('/settings', { method: 'POST', body: JSON.stringify(patch) })
          await reloadState()
          setToast('已保存')
          setShowSettings(false)
          load()
        } catch (error) {
          setFailure({ message: error.message })
        }
      }

      const chooseDirectory = async () => {
        if (!uiWorkspace?.pickDirectory) {
          setFailure({ message: '当前宿主没有提供目录选择器，请直接在设置里填写项目目录（绝对路径）' })
          return
        }
        const picked = await uiWorkspace.pickDirectory()
        if (!picked) return
        await saveSettings({ projectDir: picked })
      }

      const copyInstruction = async () => {
        if (!selected) return
        const text = instruction || buildInstruction(selected, settings, skills)
        setInstruction(text)
        try {
          await navigator.clipboard.writeText(text)
          setToast('开发指令已复制，粘贴到左侧 AI 对话即可开工；这次交付已记进「工作台执行记录」')
        } catch {
          setToast('剪贴板不可用，请手动全选复制下面的指令；这次交付已记进执行记录')
        }
        await handOff(selected, '已复制开发指令', tableKey)
      }

      const writeBack = async (status) => {
        if (!selected) return
        try {
          const result = await api('/requirement/status', {
            method: 'POST',
            body: JSON.stringify({ recordId: selected.id, status }),
          })
          setToast(`已把状态回写为「${status}」`)
        } catch (error) {
          setFailure({ message: error.message, detail: error.payload?.detail, command: error.payload?.hint })
        }
      }

      const cellText = (item, field) => {
        const raw = field === '需求标题' ? item.title : item.fields?.[field]
        return String(raw ?? '').replace(/\s+/g, ' ').trim()
      }

      const copyList = async () => {
        const header = listFields.join(' | ')
        const lines = filtered.map((item, index) => `${index + 1}. ` + listFields.map((field) => cellText(item, field).slice(0, 240)).join(' | '))
        const text = [`需求清单（${filtered.length} 条 · 来源：${data.source?.label ?? '手动配置'}${groupField ? ` · 分组字段：${groupField}` : ''}）`, '', header, ...lines].join('\n')
        try {
          await navigator.clipboard.writeText(text)
          setToast(`已复制 ${filtered.length} 条需求清单（可直接贴给 AI）`)
        } catch {
          setFailure({ message: '剪贴板不可用，无法复制清单' })
        }
      }

      const toggleModuleFlag = (flag, key) => {
        const current = view?.[flag] ?? []
        const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
        saveView({ [flag]: next })
      }

      const dropCard = async (targetKey) => {
        const item = drag?.type === 'card' ? items.find((entry) => entry.id === drag.id) : null
        setDrag(null)
        setDropTarget('')
        if (!item || targetKey === '（未填写）') return
        if (recordValue(item, groupField) === targetKey) return
        setOverrides((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] ?? {}), [groupField]: targetKey } }))
        if (!view?.writeBackOnDrag) {
          setToast(`已在页面上把「${item.title}」移到「${targetKey}」（未回写飞书）`)
          return
        }
        try {
          await api('/requirement/status', {
            method: 'POST',
            body: JSON.stringify({ recordId: item.id, status: targetKey, field: groupField }),
          })
          setToast(`已把「${item.title}」的「${groupField}」回写为「${targetKey}」`)
        } catch (error) {
          setOverrides((prev) => {
            const next = { ...prev }
            delete next[item.id]
            return next
          })
          setFailure({ message: `回写飞书失败：${error.message}`, detail: error.payload?.detail, command: error.payload?.hint })
        }
      }

      const dropModule = (targetKey) => {
        const from = drag?.type === 'module' ? drag.key : ''
        setDrag(null)
        setDropTarget('')
        if (!from || from === targetKey) return
        const order = modules.map((module) => module.key).filter((key) => key !== from)
        const index = order.indexOf(targetKey)
        order.splice(index < 0 ? order.length : index, 0, from)
        saveView({ moduleOrder: order })
      }

      if (showSettings || !state?.configured) {
        return h(SettingsView, {
          settings,
          sources,
          larkCli: state?.larkCli,
          chooseDirectory,
          onReloadSources: loadSources,
          onCancel: state?.configured ? () => setShowSettings(false) : null,
          onSave: saveSettings,
        })
      }

      return h(
        'div',
        { className: 'rdw-body' },
        h(
          'div',
          { className: 'rdw-head' },
          h('h2', null, table?.label ?? '数据表'),
          h('span', { className: 'rdw-count' }, loading ? '读取中…' : `${filtered.length} / ${items.length} 条`),
          data.source?.label ? h(Chip, { tone: data.source.configPath ? 'ok' : '' }, data.source.tableName || data.source.label) : null,
          h(
            'span',
            { className: 'rdw-seg' },
            h('button', { className: 'rdw-btn', 'aria-pressed': mode === 'list' ? 'true' : 'false', onClick: () => setMode('list') }, '汇总清单'),
            h('button', { className: 'rdw-btn', 'aria-pressed': mode === 'board' ? 'true' : 'false', onClick: () => setMode('board') }, '卡片看板'),
            h('button', { className: 'rdw-btn', 'aria-pressed': mode === 'progress' ? 'true' : 'false', onClick: () => setMode('progress') }, '进度'),
          ),
          h('span', { className: 'rdw-grow' }),
          h(
            'button',
            { className: 'rdw-btn', 'aria-pressed': showConfig ? 'true' : 'false', onClick: () => setShowConfig(!showConfig) },
            activeFilters.length ? `筛选与分组（${activeFilters.length}）` : '筛选与分组',
          ),
          h('button', { className: 'rdw-btn', onClick: () => load(true), disabled: loading }, '刷新'),
          h('button', { className: 'rdw-btn', onClick: () => setShowSettings(true) }, '设置'),
        ),
        h(
          'div',
          { className: 'rdw-scroll' },
          showConfig
            ? h(ViewConfigPanel, {
                schema: schemaFields,
                optionFields,
                textFields,
                view,
                modules,
                onSave: saveView,
                onClose: () => setShowConfig(false),
              })
            : null,
          data.warning ? h('div', { className: 'rdw-note', style: { marginBottom: 8 } }, data.warning) : null,
          failure
            ? h(
                'div',
                { className: 'rdw-error' },
                h('div', null, failure.message),
                failure.detail ? h('pre', { className: 'rdw-pre' }, failure.detail) : null,
                failure.command ? h('div', { className: 'rdw-note' }, `命令：${failure.command}`) : null,
                h('div', { style: { marginTop: 8 } }, h('button', { className: 'rdw-btn', onClick: load }, '重试')),
              )
            : null,
          h(
            'div',
            { className: 'rdw-toolbar' },
            h('input', {
              className: 'rdw-input',
              placeholder: '搜索标题 / 编号 / 状态 / 负责人',
              value: query,
              onChange: (event) => setQuery(event.target.value),
              spellCheck: false,
            }),
            mode === 'list' ? h('button', { className: 'rdw-btn', onClick: copyList, disabled: !filtered.length }, '复制清单') : null,
            mode === 'board' && (view?.hiddenModules ?? []).length
              ? h('button', { className: 'rdw-btn', onClick: () => saveView({ hiddenModules: [] }) }, `恢复隐藏模块（${(view?.hiddenModules ?? []).length}）`)
              : null,
            toast ? h('span', { className: 'rdw-note' }, toast) : null,
          ),
          mode === 'list'
            ? !filtered.length && !failure && !loading
              ? h('div', { className: 'rdw-empty' }, items.length ? '没有匹配的需求' : '这张表里还没有读到需求记录')
              : h(
                  'div',
                  { className: 'rdw-tablewrap' },
                  h(
                    'table',
                    { className: 'rdw-table' },
                    h('thead', null, h('tr', null, ...listFields.map((field) => h('th', { key: field }, field)))),
                    h(
                      'tbody',
                      null,
                      ...filtered.map((item) =>
                        h(
                          'tr',
                          {
                            key: item.id || item.title,
                            className: item.id === selectedId ? 'is-selected' : '',
                            onClick: () => {
                              setSelectedId(item.id)
                              setInstruction('')
                              setToast('')
                            },
                          },
                          ...listFields.map((field) => h('td', { key: field, title: cellText(item, field) }, cellText(item, field) || '—')),
                        ),
                      ),
                    ),
                  ),
                )
            : null,
          mode === 'board'
            ? visibleModules.length
              ? h(
                  'div',
                  { className: 'rdw-board' },
                  ...visibleModules.map((module) => {
                    const collapsed = (view?.collapsedModules ?? []).includes(module.key)
                    return h(
                      'section',
                      {
                        key: module.key,
                        className: `rdw-module${dropTarget === module.key ? ' is-drop' : ''}`,
                        onDragOver: (event) => {
                          if (!drag) return
                          event.preventDefault()
                          setDropTarget(module.key)
                        },
                        onDragLeave: () => setDropTarget(''),
                        onDrop: (event) => {
                          event.preventDefault()
                          if (drag?.type === 'module') dropModule(module.key)
                          else dropCard(module.key)
                        },
                      },
                      h(
                        'header',
                        {
                          className: 'rdw-module-head',
                          draggable: true,
                          onDragStart: () => setDrag({ type: 'module', key: module.key }),
                          onDragEnd: () => {
                            setDrag(null)
                            setDropTarget('')
                          },
                        },
                        h('span', { className: 'rdw-handle', title: '拖动模块排序' }, '⠿'),
                        h('strong', null, module.key),
                        h('span', { className: 'rdw-count' }, `${module.items.length} 条`),
                        h('span', { className: 'rdw-grow' }),
                        h('button', { className: 'rdw-btn', onClick: () => toggleModuleFlag('collapsedModules', module.key) }, collapsed ? '展开' : '折叠'),
                        h('button', { className: 'rdw-btn', onClick: () => toggleModuleFlag('hiddenModules', module.key) }, '隐藏'),
                      ),
                      collapsed
                        ? null
                        : h(
                            'div',
                            { className: 'rdw-cards' },
                            ...module.items.map((item) =>
                              h(
                                'article',
                                {
                                  key: item.id || item.title,
                                  className: `rdw-kcard${item.id === selectedId ? ' is-selected' : ''}${drag?.type === 'card' && drag.id === item.id ? ' is-dragging' : ''}`,
                                  draggable: true,
                                  onDragStart: () => setDrag({ type: 'card', id: item.id }),
                                  onDragEnd: () => {
                                    setDrag(null)
                                    setDropTarget('')
                                  },
                                  onClick: () => {
                                    setSelectedId(item.id)
                                    setInstruction('')
                                    setToast('')
                                  },
                                },
                                h('div', { className: 'rdw-item-title' }, item.title),
                                h(
                                  'div',
                                  { className: 'rdw-meta' },
                                  item.code ? h(Chip, null, item.code) : null,
                                  item.priority ? h(Chip, null, item.priority) : null,
                                  item.type ? h(Chip, null, item.type) : null,
                                  item.owner ? h('span', null, `@${item.owner}`) : null,
                                ),
                                h('div', { className: 'rdw-note rdw-kcard-summary' }, cellText(item, view?.cardSummaryField || '原始需求').slice(0, 160) || '（无摘要）'),
                              ),
                            ),
                          ),
                    )
                  }),
                )
              : h('div', { className: 'rdw-empty' }, items.length ? '当前筛选下没有数据' : '这张表里还没有读到需求记录')
            : null,
          mode === 'progress'
            ? h(
                'div',
                { className: 'rdw-progress' },
                h(
                  'div',
                  { className: 'rdw-toolbar' },
                  h('span', { className: 'rdw-note' }, '进度字段'),
                  h(
                    'select',
                    { className: 'rdw-input', value: progressFieldValue, onChange: (event) => setProgressField(event.target.value) },
                    ...schemaFields.map((field) => h('option', { key: field.name, value: field.name }, field.name)),
                  ),
                  h('span', { className: 'rdw-count' }, `${progress.total} 条 · 完成 ${progress.percent}%`),
                ),
                h('div', { className: 'rdw-bar' }, h('i', { style: { width: `${progress.percent}%` } })),
                ...progress.buckets.map((bucket) =>
                  h(
                    'div',
                    { key: bucket.value, className: 'rdw-barrow' },
                    h('span', { className: 'rdw-barlabel', title: bucket.value }, bucket.value),
                    h('div', { className: 'rdw-bar' }, h('i', { style: { width: `${progress.total ? Math.round((bucket.count / progress.total) * 100) : 0}%` } })),
                    h('span', { className: 'rdw-count' }, String(bucket.count)),
                  ),
                ),
                progress.buckets.length ? null : h('div', { className: 'rdw-empty' }, '这张表里还没有可统计的数据'),
                h('div', { className: 'rdw-note', style: { marginTop: 10 } }, '进度按上面这个字段统计；换成「状态」「单测状态」「联调状态」可以看不同口径。'),
              )
            : null,
          selected
            ? h(
                'div',
                { className: 'rdw-detailwrap' },
                h(DetailView, {
                  item: selected,
                  settings,
                  toast,
                  instruction,
                  setInstruction,
                  copyInstruction,
                  writeBack,
                  chooseDirectory,
                  runs: itemRuns,
                  onUpdateRun,
                  onClose: () => setSelectedId(''),
                }),
              )
            : null,
        ),
      )
    }

    /** 页面配置：分组字段、卡片摘要、汇总清单列、按表字段的筛选条件、拖拽是否回写。 */
    function ViewConfigPanel({ schema, optionFields, textFields, view, modules, onSave, onClose }) {
      const [draft, setDraft] = useState(() => ({ ...(view ?? {}) }))
      useEffect(() => {
        setDraft({ ...(view ?? {}) })
      }, [view])
      const filters = draft.filters ?? []
      const setFilter = (index, patch) => {
        setDraft({ ...draft, filters: filters.map((filter, position) => (position === index ? { ...filter, ...patch } : filter)) })
      }
      const optionsOf = (name) => optionFields.find((field) => field.name === name)?.options ?? []
      return h(
        'div',
        { className: 'rdw-card rdw-config' },
        h(
          'div',
          { className: 'rdw-toolbar' },
          h('strong', null, '页面配置'),
          h('span', { className: 'rdw-note' }, '改完点保存，配置会存到工作台数据目录，下次打开一致'),
          h('span', { className: 'rdw-grow' }),
          h('button', { className: 'rdw-btn primary', onClick: () => { onSave(draft); onClose() } }, '保存配置'),
          h('button', { className: 'rdw-btn', onClick: onClose }, '收起'),
        ),
        h(
          'div',
          { className: 'rdw-cfg-grid' },
          h(
            'label',
            { className: 'rdw-field' },
            h('span', null, '分组字段（卡片看板按它分模块）'),
            h(
              'select',
              { className: 'rdw-input', value: draft.groupField ?? '', onChange: (event) => setDraft({ ...draft, groupField: event.target.value }) },
              ...schema.map((field) => h('option', { key: field.name, value: field.name }, field.name)),
            ),
          ),
          h(
            'label',
            { className: 'rdw-field' },
            h('span', null, '卡片摘要字段'),
            h(
              'select',
              { className: 'rdw-input', value: draft.cardSummaryField ?? '', onChange: (event) => setDraft({ ...draft, cardSummaryField: event.target.value }) },
              h('option', { value: '' }, '（默认：原始需求）'),
              ...textFields.map((field) => h('option', { key: field.name, value: field.name }, field.name)),
            ),
          ),
        ),
        h(
          'div',
          { className: 'rdw-field' },
          h('span', null, `汇总清单显示哪些列（已选 ${(draft.listFields ?? []).length || '自动'}）`),
          h(
            'div',
            { className: 'rdw-checks' },
            ...schema.map((field) =>
              h(
                'label',
                { key: field.name, className: 'rdw-checkrow' },
                h('input', {
                  type: 'checkbox',
                  checked: (draft.listFields ?? []).includes(field.name),
                  onChange: () => {
                    const current = draft.listFields ?? []
                    setDraft({
                      ...draft,
                      listFields: current.includes(field.name) ? current.filter((name) => name !== field.name) : [...current, field.name],
                    })
                  },
                }),
                h('span', null, field.name),
              ),
            ),
          ),
        ),
        h(
          'label',
          { className: 'rdw-checkrow' },
          h('input', {
            type: 'checkbox',
            checked: Boolean(draft.writeBackOnDrag),
            onChange: (event) => setDraft({ ...draft, writeBackOnDrag: event.target.checked }),
          }),
          h('span', null, `拖动卡片换模块时，同时把「${draft.groupField || '状态'}」回写飞书`),
        ),
        h('div', { className: 'rdw-toolbar', style: { marginTop: 12 } }, h('strong', null, '筛选条件（按这张表的字段）')),
        filters.length
          ? null
          : h('div', { className: 'rdw-note', style: { marginBottom: 8 } }, '还没有筛选条件，下面加一条即可（例如 状态 = 待开发）。'),
        ...filters.map((filter, index) =>
          h(
            'div',
            { key: `${filter.field}-${index}`, className: 'rdw-filterrow' },
            h(
              'select',
              { className: 'rdw-input', value: filter.field, onChange: (event) => setFilter(index, { field: event.target.value, values: [], text: '' }) },
              ...schema.map((field) => h('option', { key: field.name, value: field.name }, field.name)),
            ),
            optionsOf(filter.field).length
              ? h(
                  'div',
                  { className: 'rdw-checks' },
                  ...optionsOf(filter.field).map((option) =>
                    h(
                      'button',
                      {
                        key: option,
                        className: 'rdw-btn',
                        'aria-pressed': (filter.values ?? []).includes(option) ? 'true' : 'false',
                        onClick: () =>
                          setFilter(index, {
                            values: (filter.values ?? []).includes(option)
                              ? (filter.values ?? []).filter((value) => value !== option)
                              : [...(filter.values ?? []), option],
                          }),
                      },
                      option,
                    ),
                  ),
                )
              : h('input', {
                  className: 'rdw-input',
                  placeholder: '包含文本',
                  value: filter.text ?? '',
                  onChange: (event) => setFilter(index, { text: event.target.value }),
                }),
            h('button', { className: 'rdw-btn', onClick: () => setDraft({ ...draft, filters: filters.filter((_, position) => position !== index) }) }, '删除'),
          ),
        ),
        h(
          'button',
          { className: 'rdw-btn', onClick: () => setDraft({ ...draft, filters: [...filters, { field: schema[0]?.name ?? '状态', values: [], text: '' }] }) },
          '＋ 添加筛选条件',
        ),
        h(
          'div',
          { className: 'rdw-note', style: { marginTop: 8 } },
          `当前分组：${draft.groupField || '状态'}　·　模块数：${modules.length}　·　列数：${(draft.listFields ?? []).length || '自动'}`,
        ),
      )
    }

    function SettingsView({ settings, sources, onCancel, onSave, larkCli, chooseDirectory, onReloadSources }) {
      const [link, setLink] = useState(settings.baseToken ? `${settings.baseToken} ${settings.tableId}` : '')
      const [tableId, setTableId] = useState(settings.tableId ?? '')
      const [projectDir, setProjectDir] = useState(settings.projectDir ?? '')
      const [titleField, setTitleField] = useState(settings.titleField ?? '')
      const [statusField, setStatusField] = useState(settings.statusField ?? '')
      const [sourceName, setSourceName] = useState(settings.sourceName ?? '')
      const [busy, setBusy] = useState(false)
      const detected = sources?.sources ?? []
      const chooseRoot = async () => {
        if (!chooseDirectory) return
        await chooseDirectory()
        if (onReloadSources) await onReloadSources()
      }
      return h(
        'div',
        { className: 'rdw-body' },
        h('div', { className: 'rdw-head' }, h('h2', null, '开发需求 · 设置'), h('span', { className: 'rdw-grow' }), onCancel ? h('button', { className: 'rdw-btn', onClick: onCancel }, '返回') : null),
        h(
          'div',
          { className: 'rdw-scroll' },
          h(
            'div',
            { className: 'rdw-card' },
            h('h3', null, '1. 先选项目目录'),
            h(Field, { label: '项目目录（绝对路径）', value: projectDir, placeholder: 'D:\\workspace\\your-project', onChange: setProjectDir }),
            h('div', { className: 'rdw-toolbar', style: { marginTop: 6 } }, h('button', { className: 'rdw-btn', onClick: chooseRoot, disabled: !chooseDirectory }, '用系统目录选择器挑选')),
            h('div', { className: 'rdw-note' }, '选好项目后，「技能与规范」会扫描它的 skill；如果项目里已经有需求源配置，会自动认出来。'),
          ),
          h(
            'div',
            { className: 'rdw-card', style: { marginTop: 12 } },
            h('h3', null, '2. 需求来源'),
            detected.length
              ? h(
                  'div',
                  null,
                  h('div', { className: 'rdw-note', style: { marginBottom: 6 } }, `在项目里发现了需求源配置：${sources.path}`),
                  ...detected.map((source) =>
                    h(
                      'label',
                      { key: source.name, style: { display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6, overflowWrap: 'anywhere' } },
                      h('input', {
                        type: 'radio',
                        name: 'rdw-source',
                        checked: sourceName === source.name,
                        onChange: () => setSourceName(source.name),
                      }),
                      h('span', null, `${source.name}${source.tableName ? ` · ${source.tableName}` : ''}`, h('span', { className: 'rdw-note', style: { display: 'block' } }, source.baseUrl || '（配置里没有 baseUrl）')),
                    ),
                  ),
                )
              : h('div', { className: 'rdw-note' }, '项目里没有 .requirement-sources.json，下面手动填表格地址也可以。'),
            h(Field, {
              label: '多维表格链接或 base_token（手动填写，选项目配置时可留空）',
              value: link,
              placeholder: 'https://xxx.feishu.cn/base/xxxx?table=tblxxxx',
              onChange: setLink,
            }),
            h(Field, { label: '表名或 table_id', value: tableId, placeholder: '需求池 或 tblxxxx', onChange: setTableId }),
            h('div', { className: 'rdw-note' }, `读取身份：${larkCli ? `lark-cli 就绪（${larkCli}）` : 'lark-cli 未找到'}　·　本工作台不保存飞书凭证。`),
          ),
          h(
            'div',
            { className: 'rdw-card', style: { marginTop: 12 } },
            h('h3', null, '3. 字段映射（可选）'),
            h('div', { className: 'rdw-note' }, '选了项目需求源就用它的映射；留空则按「标题 / 状态」自动识别。'),
            h(Field, { label: '标题字段名', value: titleField, placeholder: '自动识别', onChange: setTitleField }),
            h(Field, { label: '状态字段名（回写状态也用它）', value: statusField, placeholder: '自动识别', onChange: setStatusField }),
          ),
          h(
            'div',
            { className: 'rdw-toolbar', style: { marginTop: 14 } },
            h(
              'button',
              {
                className: 'rdw-btn primary',
                disabled: busy,
                onClick: async () => {
                  setBusy(true)
                  try {
                    await onSave({ baseInput: link, tableId, projectDir, titleField, statusField, sourceName })
                  } finally {
                    setBusy(false)
                  }
                },
              },
              busy ? '保存中…' : '保存并拉取需求',
            ),
          ),
        ),
      )
    }

    function DetailView({ item, settings, toast, instruction, copyInstruction, writeBack, chooseDirectory, onClose, runs, onUpdateRun }) {
      if (!item) {
        return h('div', { className: 'rdw-empty' }, '选一条需求，这里会显示详情和「交给 AI 开发」的入口')
      }
      const statuses = ['待开发', '开发中', '已完成']
      const mappedBlocks = [
        ['需求编号', item.code],
        ['原始需求', item.rawRequirement],
        ['详细设计', item.design],
        ['详细设计链接', item.designLink],
        ['开发补充描述', item.devSupplement],
        ['验收标准', item.acceptance],
        ['优先级', item.priority],
      ].filter((pair) => pair[1])
      return h(
        'div',
        { className: 'rdw-detail' },
        h(
          'div',
          { className: 'rdw-toolbar' },
          h('h3', { style: { margin: 0, fontSize: 13.5 } }, item.title),
          h('span', { className: 'rdw-grow' }),
          onClose ? h('button', { className: 'rdw-btn', onClick: onClose }, '关闭详情') : null,
        ),
        h(
          'div',
          { className: 'rdw-meta', style: { marginBottom: 10 } },
          item.status ? h(Chip, { tone: statusTone(item.status) }, item.status) : null,
          item.project ? h(Chip, null, item.project) : null,
          item.owner ? h(Chip, null, `@${item.owner}`) : null,
        ),
        ...mappedBlocks.map(([label, value]) =>
          h(
            'div',
            { key: label, className: 'rdw-card', style: { marginBottom: 8 } },
            h('h3', null, label),
            h('div', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }, String(value)),
          ),
        ),
        h('div', { className: 'rdw-note', style: { margin: '12px 0 4px' } }, '表格里的全部字段'),
        h(
          'dl',
          { className: 'rdw-kv' },
          ...Object.entries(item.fields ?? {}).flatMap(([key, value]) => [h('dt', { key: `k-${key}` }, key), h('dd', { key: `v-${key}` }, value || '—')]),
        ),
        h('div', { style: { marginTop: 14 } }, h('div', { className: 'rdw-note' }, `项目目录：${settings.projectDir || '未选择'}`), h('div', { className: 'rdw-toolbar', style: { marginTop: 6 } }, h('button', { className: 'rdw-btn', onClick: chooseDirectory }, '选择项目目录'))),
        h(
          'div',
          { style: { marginTop: 14 } },
          h('button', { className: 'rdw-btn primary', onClick: copyInstruction }, '生成开发指令并复制'),
          instruction ? h(Field, { label: '把下面这段发给左侧 AI（可先按需修改）', value: instruction, onChange: () => {}, textarea: true }) : null,
        ),
        h(
          'div',
          { style: { marginTop: 14 } },
          h('div', { className: 'rdw-note' }, '回写飞书状态（可选）'),
          h(
            'div',
            { className: 'rdw-toolbar', style: { marginTop: 6 } },
            ...statuses.map((status) => h('button', { key: status, className: 'rdw-btn', onClick: () => writeBack(status) }, status)),
          ),
        ),
        h(
          'div',
          { style: { marginTop: 14 } },
          h('div', { className: 'rdw-note' }, `工作台执行记录（这条 ${(runs ?? []).length} 次）`),
          (runs ?? []).length
            ? h(
                'div',
                null,
                ...(runs ?? []).map((run) =>
                  h(
                    'div',
                    { key: run.id, className: 'rdw-runrow' },
                    h(
                      'div',
                      null,
                      h(Chip, { tone: run.status === 'done' ? 'ok' : run.status === 'blocked' ? 'err' : '' }, RUN_LABEL[run.status] ?? run.status),
                      h('span', { className: 'rdw-note' }, ` ${formatTime(run.at)}${run.note ? ` · ${run.note}` : ''}`),
                    ),
                    h('span', { className: 'rdw-grow' }),
                    ...RUN_STATUS.map((status) =>
                      h(
                        'button',
                        { key: status.id, className: 'rdw-btn', 'aria-pressed': run.status === status.id ? 'true' : 'false', onClick: () => onUpdateRun(run.id, status.id) },
                        status.label,
                      ),
                    ),
                  ),
                ),
              )
            : h('div', { className: 'rdw-note', style: { marginTop: 4 } }, '还没有交付记录；点上面的「生成开发指令并复制」会自动记一条。'),
        ),
        toast ? h('div', { className: 'rdw-note', style: { marginTop: 12, color: 'var(--dsw-alias-state-success-primary,#3ecf8e)' } }, toast) : null,
      )
    }

    /* ------------------------------------------------------- 总览（跨表） */

    function OverviewModule({ overview, loading, onRefresh, onOpenTable, runs, onUpdateRun, onAddModule, projectDir }) {
      const tables = overview?.tables ?? []
      return h(
        'div',
        { className: 'rdw-body' },
        h(
          'div',
          { className: 'rdw-head' },
          h('h2', null, '总览'),
          h('span', { className: 'rdw-count' }, loading ? '统计中…' : `${tables.length} 张表`),
          projectDir ? h(Chip, null, projectDir.split(/[\\/]/).filter(Boolean).pop()) : null,
          h('span', { className: 'rdw-grow' }),
          h('button', { className: 'rdw-btn', onClick: onAddModule }, '＋ 添加模块'),
          h('button', { className: 'rdw-btn', onClick: onRefresh, disabled: loading }, '刷新'),
        ),
        h(
          'div',
          { className: 'rdw-scroll' },
          tables.length
            ? null
            : h('div', { className: 'rdw-empty' }, '项目里还没有配到飞书表；先在「设置」里选项目目录，或粘贴多维表格链接'),
          ...tables.map((table) =>
            h(
              'div',
              { key: table.key, className: 'rdw-card rdw-tablecard' },
              h(
                'div',
                { className: 'rdw-toolbar' },
                h('strong', null, table.label),
                table.tableName ? h(Chip, null, table.tableName) : null,
                h('span', { className: 'rdw-count' }, `${table.total ?? 0} 条`),
                h('span', { className: 'rdw-grow' }),
                h('button', { className: 'rdw-btn', onClick: () => onOpenTable(table.key) }, '打开'),
              ),
              table.error
                ? h('div', { className: 'rdw-error' }, h('div', null, table.error), table.detail ? h('pre', { className: 'rdw-pre' }, String(table.detail).slice(0, 400)) : null)
                : h(
                    'div',
                    null,
                    table.progress
                      ? h(
                          'div',
                          null,
                          h(
                            'div',
                            { className: 'rdw-toolbar' },
                            h('span', { className: 'rdw-note' }, `按「${table.progress.field}」`),
                            h('span', { className: 'rdw-grow' }),
                            h('span', { className: 'rdw-count' }, `完成 ${table.progress.done} · 进行 ${table.progress.active} · 待办 ${table.progress.todo} · ${table.progress.percent}%`),
                          ),
                          h('div', { className: 'rdw-bar' }, h('i', { style: { width: `${table.progress.percent}%` } })),
                          h(
                            'div',
                            { className: 'rdw-buckets' },
                            ...table.progress.buckets.slice(0, 10).map((bucket) => h(Chip, { key: bucket.value, tone: statusTone(bucket.value) }, `${bucket.value} ${bucket.count}`)),
                          ),
                        )
                      : h('div', { className: 'rdw-note' }, '这张表没有可统计的「状态/进度」字段'),
                    (table.sample ?? []).length
                      ? h(
                          'ul',
                          { className: 'rdw-samplelist' },
                          ...table.sample.map((item) =>
                            h(
                              'li',
                              { key: item.id || item.title },
                              h('span', { className: 'rdw-sample-title' }, `${item.code ? `${item.code} ` : ''}${item.title}`),
                              h('span', { className: 'rdw-note' }, ` ${item.status || ''}${item.owner ? ` @${item.owner}` : ''}`),
                            ),
                          ),
                        )
                      : null,
                  ),
            ),
          ),
          h(
            'div',
            { className: 'rdw-head', style: { marginTop: 18 } },
            h('h2', null, '工作台执行记录'),
            h('span', { className: 'rdw-count' }, `${(runs ?? []).length} 条`),
          ),
          h('div', { className: 'rdw-note', style: { marginBottom: 8 } }, '每次点「生成开发指令并复制」，工作台就在这里留一条记录（哪条需求、哪个项目、什么时候），做完可以直接在这里标记结果。'),
          (runs ?? []).length
            ? h(
                'div',
                null,
                ...(runs ?? []).map((run) =>
                  h(
                    'div',
                    { key: run.id, className: 'rdw-runrow' },
                    h(
                      'div',
                      null,
                      h('strong', null, run.title),
                      h(
                        'div',
                        { className: 'rdw-note' },
                        `${formatTime(run.at)}${run.tableKey ? ` · ${run.tableKey}` : ''}${run.projectDir ? ` · ${run.projectDir.split(/[\\/]/).filter(Boolean).pop()}` : ''}${run.note ? ` · ${run.note}` : ''}`,
                      ),
                    ),
                    h('span', { className: 'rdw-grow' }),
                    ...RUN_STATUS.map((status) =>
                      h(
                        'button',
                        { key: status.id, className: 'rdw-btn', 'aria-pressed': run.status === status.id ? 'true' : 'false', onClick: () => onUpdateRun(run.id, status.id) },
                        status.label,
                      ),
                    ),
                  ),
                ),
              )
            : h('div', { className: 'rdw-empty' }, '还没有执行记录'),
        ),
      )
    }

    /* ----------------------------------------------------- 技能与规范模块 */

    function SkillsModule({ state, reloadState, uiWorkspace }) {
      const [data, setData] = useState(null)
      const [failure, setFailure] = useState(null)
      const [openFile, setOpenFile] = useState(null)
      const [content, setContent] = useState('')
      const [loading, setLoading] = useState(false)
      const settings = state?.settings ?? {}

      const load = useCallback(async () => {
        setLoading(true)
        setFailure(null)
        try {
          setData(await api('/skills'))
        } catch (error) {
          setFailure({ message: error.message })
        } finally {
          setLoading(false)
        }
      }, [])

      useEffect(() => {
        load()
      }, [load, settings.projectDir])

      const chooseDirectory = async () => {
        if (!uiWorkspace?.pickDirectory) {
          setFailure({ message: '当前宿主没有提供目录选择器' })
          return
        }
        const picked = await uiWorkspace.pickDirectory()
        if (!picked) return
        await api('/settings', { method: 'POST', body: JSON.stringify({ projectDir: picked }) })
        await reloadState()
      }

      const open = async (file) => {
        setOpenFile(file)
        setContent('读取中…')
        try {
          const result = await api(`/skill?path=${encodeURIComponent(file.path)}`)
          setContent(result.text ?? '')
        } catch (error) {
          setContent(`读取失败：${error.message}`)
        }
      }

      const groups = useMemo(() => {
        const map = new Map()
        for (const item of data?.items ?? []) {
          if (!map.has(item.group)) map.set(item.group, [])
          map.get(item.group).push(item)
        }
        return [...map.entries()]
      }, [data])

      return h(
        'div',
        { className: 'rdw-body' },
        h(
          'div',
          { className: 'rdw-head' },
          h('h2', null, '技能与规范'),
          h('span', { className: 'rdw-count' }, loading ? '扫描中…' : `${data?.items?.length ?? 0} 个 skill · ${data?.docs?.length ?? 0} 份规范`),
          h('span', { className: 'rdw-grow' }),
          h('button', { className: 'rdw-btn', onClick: chooseDirectory }, '选择项目目录'),
          h('button', { className: 'rdw-btn', onClick: load }, '重新扫描'),
        ),
        h(
          'div',
          { className: 'rdw-split' },
          h(
            'div',
            { className: 'rdw-col rdw-col-list' },
            h(
              'div',
              { className: 'rdw-scroll' },
              h('div', { className: 'rdw-note', style: { marginBottom: 8 } }, `扫描范围：全局 skill + 项目目录（${settings.projectDir || '未选择'}）`),
              failure ? h('div', { className: 'rdw-error' }, failure.message) : null,
              groups.map(([group, entries]) =>
                h(
                  'div',
                  { key: group, style: { marginBottom: 12 } },
                  h('div', { className: 'rdw-note', style: { marginBottom: 4 } }, group),
                  ...entries.map((entry) =>
                    h(
                      'button',
                      {
                        key: entry.id,
                        className: 'rdw-item',
                        'aria-current': openFile?.path === entry.path ? 'true' : 'false',
                        onClick: () => open(entry),
                        style: { marginBottom: 6 },
                      },
                      h('span', { className: 'rdw-item-title' }, entry.name),
                      entry.description ? h('span', { className: 'rdw-note' }, entry.description) : null,
                    ),
                  ),
                ),
              ),
              (data?.docs ?? []).length
                ? h(
                    'div',
                    null,
                    h('div', { className: 'rdw-note', style: { marginBottom: 4 } }, '开发规范'),
                    ...data.docs.map((doc) =>
                      h(
                        'button',
                        { key: doc.id, className: 'rdw-item', 'aria-current': openFile?.path === doc.path ? 'true' : 'false', onClick: () => open(doc), style: { marginBottom: 6 } },
                        h('span', { className: 'rdw-item-title' }, doc.name),
                      ),
                    ),
                  )
                : null,
              !loading && !(data?.items ?? []).length && !(data?.docs ?? []).length ? h('div', { className: 'rdw-empty' }, '没扫到 skill。选一个带 .claude/skills 或 .agents/skills 的项目目录试试。') : null,
            ),
          ),
          h(
            'div',
            { className: 'rdw-col rdw-col-detail' },
            h(
              'div',
              { className: 'rdw-scroll' },
              openFile ? h('div', null, h('div', { className: 'rdw-note', style: { marginBottom: 8 } }, openFile.path), h('pre', { className: 'rdw-pre' }, content)) : h('div', { className: 'rdw-empty' }, '从左边选一个 skill 或规范文档，这里显示正文'),
            ),
          ),
        ),
      )
    }

    /* --------------------------------------------------------------- 外壳 */

    const DEFAULT_TABLE_SLICE = {
      filters: [],
      groupField: '状态',
      cardSummaryField: '',
      listFields: [],
      moduleOrder: [],
      hiddenModules: [],
      collapsedModules: [],
      writeBackOnDrag: false,
    }

    /** 单张表的配置 = 旧版全局兜底 + 该表自己的切片。 */
    function sliceForTable(view, tableKey) {
      const legacy = {
        filters: view?.filters ?? [],
        groupField: view?.groupField || '状态',
        cardSummaryField: view?.cardSummaryField ?? '',
        listFields: view?.listFields ?? [],
        moduleOrder: view?.moduleOrder ?? [],
        hiddenModules: view?.hiddenModules ?? [],
        collapsedModules: view?.collapsedModules ?? [],
        writeBackOnDrag: Boolean(view?.writeBackOnDrag),
      }
      return { ...DEFAULT_TABLE_SLICE, ...legacy, ...(view?.tables?.[tableKey] ?? {}) }
    }

    const VIEW_LABEL = { list: '汇总清单', board: '卡片看板', progress: '进度' }

    /** 默认模块 = 项目里配到的每张表各一个「汇总清单」模块。 */
    function defaultModules(tables) {
      return (tables ?? []).map((table, index) => ({
        key: `${table.key}#${index}`,
        tableKey: table.key,
        title: table.label,
        view: 'list',
      }))
    }

    /** 添加/管理模块：选一张表 + 一种视图；也能删掉自己加的模块。 */
    function ModuleDialog({ tables, modules, onAdd, onRemove, onClose }) {
      return h(
        'div',
        { className: 'rdw-card rdw-config' },
        h(
          'div',
          { className: 'rdw-toolbar' },
          h('strong', null, '添加模块'),
          h('span', { className: 'rdw-note' }, '每张表可以开多个模块（比如同一张表既有清单也有看板）'),
          h('span', { className: 'rdw-grow' }),
          h('button', { className: 'rdw-btn', onClick: onClose }, '收起'),
        ),
        (tables ?? []).length
          ? null
          : h('div', { className: 'rdw-note' }, '还没认到飞书表：先在「设置」里选项目目录（项目里已有 .requirement-sources.json / .dev-task-sources.json 就能自动认出）。'),
        ...(tables ?? []).map((table) =>
          h(
            'div',
            { key: table.key, className: 'rdw-filterrow' },
            h('strong', null, table.label),
            table.tableName ? h(Chip, null, table.tableName) : null,
            h('span', { className: 'rdw-grow' }),
            ...['list', 'board', 'progress'].map((view) =>
              h('button', { key: view, className: 'rdw-btn', onClick: () => onAdd(table, view) }, `＋ ${VIEW_LABEL[view]}`),
            ),
          ),
        ),
        h('div', { className: 'rdw-toolbar', style: { marginTop: 12 } }, h('strong', null, `已有模块（${(modules ?? []).length}）`)),
        ...(modules ?? []).map((module) =>
          h(
            'div',
            { key: module.key, className: 'rdw-filterrow' },
            h('span', null, module.title),
            h(Chip, null, VIEW_LABEL[module.view] ?? module.view),
            h('span', { className: 'rdw-note' }, module.tableKey),
            h('span', { className: 'rdw-grow' }),
            h('button', { className: 'rdw-btn', onClick: () => onRemove(module.key) }, '删除'),
          ),
        ),
      )
    }

    function BusinessPanel({ service, entry, conversation, active: frameActive = true }) {
      ensureStyles()
      const [rootRef, width] = useContainerWidth()
      const [state, setState] = useState(null)
      const [stateError, setStateError] = useState(null)
      const [tables, setTables] = useState([])
      const [view, setView] = useState(null)
      const [runs, setRuns] = useState([])
      const [overview, setOverview] = useState(null)
      const [overviewLoading, setOverviewLoading] = useState(false)
      const [active, setActive] = useState('overview')
      const [showAdd, setShowAdd] = useState(false)
      const [showConversation, setShowConversation] = useState(false)
      const uiWorkspace = service?.uiWorkspace

      const reloadState = useCallback(async () => {
        try {
          setState(await api('/state'))
          setStateError(null)
        } catch (error) {
          setStateError(error.message)
        }
      }, [])

      const reloadTables = useCallback(async () => {
        try {
          const result = await api('/tables')
          setTables(result.tables ?? [])
        } catch {
          setTables([])
        }
      }, [])

      const reloadView = useCallback(async () => {
        try {
          const result = await api('/view')
          setView(result.view ?? null)
        } catch {
          setView(null)
        }
      }, [])

      const reloadRuns = useCallback(async () => {
        try {
          const result = await api('/runs')
          setRuns(result.items ?? [])
        } catch {
          setRuns([])
        }
      }, [])

      const loadOverview = useCallback(async (fresh = false) => {
        setOverviewLoading(true)
        try {
          const result = await api(`/overview${fresh ? '?fresh=1' : ''}`)
          setOverview(result)
          if (Array.isArray(result.runs)) setRuns(result.runs)
        } catch (error) {
          setOverview({ tables: [], error: error.message })
        } finally {
          setOverviewLoading(false)
        }
      }, [])

      const saveViewPatch = useCallback(async (patch) => {
        try {
          const result = await api('/view', { method: 'POST', body: JSON.stringify(patch) })
          setView(result.view ?? null)
          return result.view ?? null
        } catch (error) {
          setStateError(null)
          return null
        }
      }, [])

      const saveTableSlice = useCallback((tableKey, patch) => saveViewPatch({ tables: { [tableKey]: patch } }), [saveViewPatch])

      const handOff = useCallback(
        async (item, note, tableKey) => {
          if (!item) return
          try {
            const result = await api('/runs', {
              method: 'POST',
              body: JSON.stringify({
                tableKey: tableKey ?? '',
                recordId: item.id,
                title: item.title,
                projectDir: state?.settings?.projectDir ?? '',
                status: 'handed-off',
                note: note ?? '',
              }),
            })
            setRuns(result.items ?? [])
          } catch {
            /* 记录失败不影响主流程 */
          }
        },
        [state?.settings?.projectDir],
      )

      const updateRun = useCallback(async (id, status) => {
        try {
          const result = await api('/runs/status', { method: 'POST', body: JSON.stringify({ id, status }) })
          setRuns(result.items ?? [])
        } catch {
          /* 忽略 */
        }
      }, [])

      useEffect(() => {
        reloadState()
        reloadTables()
        reloadView()
        reloadRuns()
      }, [reloadState, reloadTables, reloadView, reloadRuns])

      useEffect(() => {
        if (active === 'overview') loadOverview(false)
      }, [active, loadOverview])

      const railModules = useMemo(() => {
        const list = [{ kind: 'overview', id: 'overview', glyph: '📊', label: '总览' }]
        for (const module of view?.modules?.length ? view.modules : defaultModules(tables)) {
          const table = tables.find((entry) => entry.key === module.tableKey)
          list.push({
            kind: 'table',
            id: module.key,
            glyph: table?.kind === 'task' ? '🧰' : '📋',
            label: module.title || table?.label || module.tableKey,
            module,
            table,
          })
        }
        list.push({ kind: 'skills', id: 'skills', glyph: '🧩', label: '技能与规范' })
        return list
      }, [view, tables])

      const activeEntry = railModules.find((entry) => entry.id === active) ?? railModules[0]

      const addModule = async (table, viewMode) => {
        const current = view?.modules?.length ? view.modules : defaultModules(tables)
        const next = [...current, { key: `${table.key}#${Date.now().toString(36)}`, tableKey: table.key, title: `${table.label}（${VIEW_LABEL[viewMode]}）`, view: viewMode }]
        const saved = await saveViewPatch({ modules: next })
        setActive(next[next.length - 1].key)
        setShowAdd(false)
        return saved
      }

      const removeModule = async (key) => {
        const current = view?.modules?.length ? view.modules : defaultModules(tables)
        const next = current.filter((module) => module.key !== key)
        await saveViewPatch({ modules: next })
        if (active === key) setActive('overview')
      }

      const openTable = (tableKey) => {
        const found = railModules.find((entry) => entry.module?.tableKey === tableKey)
        if (found) setActive(found.id)
        else addModule(tables.find((table) => table.key === tableKey) ?? { key: tableKey, label: tableKey }, 'list')
      }

      const narrow = width > 0 && width < 430

      /** 收起工作台：回到宿主的普通会话视图。 */
      const leave = () => {
        try {
          if (typeof service?.desktopWorkbenches?.leave === 'function') service.desktopWorkbenches.leave()
          else if (typeof service?.layout?.selectPanel === 'function') service.layout.selectPanel(null)
        } catch {
          /* 宿主没提供就忽略 */
        }
      }

      /** 自定义框架外壳：自己的顶栏（含 Windows 标题栏留白）+ 主体。 */
      const shell = (body) =>
        h(
          'section',
          { className: 'rdw-frame', 'aria-label': '需求开发工作台' },
          h(
            'div',
            { className: 'rdw-hostbar', style: { paddingTop: hasWindowsTitlebar() ? '44px' : '8px' } },
            h('strong', null, '需求开发工作台'),
            h('span', { className: 'rdw-note' }, state?.settings?.projectDir ? state.settings.projectDir.split(/[\\/]/).filter(Boolean).pop() : '未选项目'),
            h('span', { className: 'rdw-grow' }),
            h(
              'button',
              { className: 'rdw-btn', 'aria-expanded': showConversation ? 'true' : 'false', onClick: () => setShowConversation(!showConversation) },
              showConversation ? '收起对话' : '展开对话',
            ),
            h('button', { className: 'rdw-btn', onClick: leave }, '收起工作台'),
          ),
          h('div', { className: 'rdw-frame-body' }, body),
        )

      if (stateError) {
        return shell(
          h(
            'div',
            { className: 'rdw-business-host', style: { flex: '1 1 100%', display: 'block', overflow: 'auto', padding: 12 } },
            h('div', { className: 'rdw-error' }, `工作台服务不可用：${stateError}`, h('div', { style: { marginTop: 8 } }, h('button', { className: 'rdw-btn', onClick: reloadState }, '重试'))),
          ),
        )
      }

      return shell([
        h(
          'div',
          {
            key: 'business',
            className: 'rdw-business-host',
            style: { containerType: 'inline-size', containerName: 'rdw-business', flex: showConversation ? '1 1 62%' : '1 1 100%' },
          },
          h(
            'div',
            { className: `rdw-root${narrow ? ' rdw-narrow' : ''}`, ref: rootRef },
            h(
              'nav',
              { className: 'rdw-rail', 'aria-label': '工作台模块' },
              h('div', { className: 'rdw-rail-title' }, '需求开发工作台'),
              ...railModules.map((entry) =>
                h(
                  'button',
                  {
                    key: entry.id,
                    className: 'rdw-mod',
                    'aria-current': activeEntry?.id === entry.id ? 'true' : 'false',
                    onClick: () => {
                      setActive(entry.id)
                      setShowAdd(false)
                    },
                  },
                  h('span', { className: 'rdw-mod-glyph', 'aria-hidden': 'true' }, entry.glyph),
                  h('span', { className: 'rdw-mod-label' }, entry.label),
                ),
              ),
              h(
                'button',
                { className: 'rdw-mod rdw-mod-add', onClick: () => setShowAdd(!showAdd) },
                h('span', { className: 'rdw-mod-glyph', 'aria-hidden': 'true' }, '＋'),
                h('span', { className: 'rdw-mod-label' }, '添加模块'),
              ),
              h(
                'div',
                { className: 'rdw-rail-foot' },
                h('span', { className: 'rdw-note' }, `v${WORKBENCH_VERSION}`),
                h('button', { className: 'rdw-btn', onClick: leave }, '收起工作台'),
              ),
            ),
            h(
              'div',
              { className: 'rdw-main' },
              showAdd
                ? h(ModuleDialog, { tables, modules: view?.modules?.length ? view.modules : defaultModules(tables), onAdd: addModule, onRemove: removeModule, onClose: () => setShowAdd(false) })
                : activeEntry?.kind === 'overview'
                  ? h(OverviewModule, {
                      overview,
                      loading: overviewLoading,
                      onRefresh: () => loadOverview(true),
                      onOpenTable: openTable,
                      runs,
                      onUpdateRun: updateRun,
                      onAddModule: () => setShowAdd(true),
                      projectDir: state?.settings?.projectDir ?? overview?.projectDir ?? '',
                    })
                  : activeEntry?.kind === 'skills'
                    ? h(SkillsModule, { state, reloadState, uiWorkspace })
                    : h(TableModule, {
                        key: activeEntry?.id,
                        state,
                        reloadState,
                        uiWorkspace,
                        table: activeEntry?.table,
                        view: sliceForTable(view, activeEntry?.module?.tableKey ?? ''),
                        saveView: (patch) => saveTableSlice(activeEntry?.module?.tableKey ?? '', patch),
                        runs,
                        handOff,
                        onUpdateRun: updateRun,
                        onOpenTable: openTable,
                        onAddModule: () => setShowAdd(true),
                      }),
            ),
          ),
        ),
        h(
          'div',
          {
            key: 'conversation',
            className: 'rdw-chatwrap',
            'aria-label': '原生对话',
            hidden: !showConversation,
            style: { display: showConversation ? 'flex' : 'none', flex: '1 1 38%' },
          },
          showConversation ? (frameActive && conversation ? conversation : h('div', { className: 'rdw-note', style: { padding: 12 } }, '宿主没有提供对话区；可以改成用左侧原来的对话窗口。')) : null,
        ),
      ])
    }

    function apply(ctx) {
      const uiWorkspace = typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : undefined
      ctx.effect(() =>
        ctx.desktopWorkbenches.register(
          {
            title: '需求开发工作台',
            repository: 'https://github.com/local-dev-workbench/dsh-requirement-dev-workbench',
            description: '跨多张飞书多维表格看开发任务、进度与 AI 交付情况（总览 + 汇总清单 + 卡片看板 + 进度），模块可扩展；选中本地项目后生成开发指令，并可浏览项目/全局 skill 与开发规范。',
            panelTitle: '需求开发',
            category: '研发管理',
            icon: '📋',
            // 自定义整块框架：自己出顶栏、左导航与内容区，右侧可挂宿主原生对话（对齐 SEO/GEO 工作台的布局方式）。
            customFrame: true,
          },
          (props) =>
            h(BusinessPanel, {
              ...props,
              service: { ...(props?.service ?? {}), uiWorkspace, desktopWorkbenches: ctx.desktopWorkbenches },
            }),
        ),
      )
    }

    return {
      apply,
      inject: ['desktopWorkbenches'],
      // 自测钩子：给 test/smoke.mjs 直接跑组件函数体与纯函数用；宿主只读 apply/inject，多余的键会被忽略。
      __components: { BusinessPanel, TableModule, OverviewModule, ModuleDialog, DetailView, ViewConfigPanel, SettingsView, SkillsModule },
      __pure: {
        summarizeBuckets,
        sliceForTable,
        defaultModules,
        formatTime,
        buildModules,
        matchesFilters,
        applyOverrides,
        defaultListFields,
        buildInstruction,
        recordValue,
        statusTone,
      },
    }
  },
})
