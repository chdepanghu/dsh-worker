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
.rdw-narrow .rdw-split{flex-direction:column}
.rdw-narrow .rdw-col-list{flex:0 0 auto;max-height:44%;border-right:none;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09))}
.rdw-root{flex-direction:column}
`

    function ensureStyles() {
      if (typeof document === 'undefined') return
      if (document.getElementById(STYLE_ID)) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
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

    function buildInstruction(item, settings, skills) {
      const lines = []
      lines.push(`请在本地项目「${settings.projectDir || '（还没选择项目目录）'}」里完成下面这条开发需求。`)
      lines.push('')
      lines.push(`需求标题：${item.title}`)
      if (item.status) lines.push(`当前状态：${item.status}`)
      if (item.project) lines.push(`所属项目：${item.project}`)
      if (item.owner) lines.push(`负责人：${item.owner}`)
      lines.push('')
      lines.push('需求字段：')
      for (const [key, value] of Object.entries(item.fields ?? {})) {
        if (!value) continue
        lines.push(`- ${key}：${value}`)
      }
      lines.push('')
      lines.push('开发要求：')
      lines.push('1. 先按该项目已有的开发规范与 skill 走流程（例如 feature-dev）；需要背景资料时按项目约定检索。')
      lines.push('2. 前后端都改到位，改完自己跑验证命令，并给出验证结果与未覆盖项。')
      lines.push('3. 不要改动与本需求无关的文件。')
      if (settings.baseToken && settings.tableId && item.id) {
        lines.push(`4. 需要回写飞书需求状态时，用本工作台的「回写状态」按钮（记录 ID：${item.id}）。`)
      }
      if (skills?.items?.length) {
        const names = skills.items.slice(0, 8).map((skill) => skill.name).join('、')
        lines.push('')
        lines.push(`可用 skill（节选）：${names}`)
      }
      return lines.join('\n')
    }

    /* ------------------------------------------------------- 开发需求模块 */

    function RequirementsModule({ state, reloadState, uiWorkspace }) {
      const [data, setData] = useState({ configured: false, items: [] })
      const [loading, setLoading] = useState(false)
      const [failure, setFailure] = useState(null)
      const [query, setQuery] = useState('')
      const [selectedId, setSelectedId] = useState('')
      const [showSettings, setShowSettings] = useState(false)
      const [toast, setToast] = useState('')
      const [instruction, setInstruction] = useState('')
      const [skills, setSkills] = useState(null)

      const settings = state?.settings ?? {}

      const load = useCallback(async () => {
        setLoading(true)
        setFailure(null)
        try {
          const result = await api('/requirements')
          setData(result)
          if (result.error) setFailure({ message: result.error, detail: result.detail, command: result.command })
        } catch (error) {
          setFailure({ message: error.message })
        } finally {
          setLoading(false)
        }
      }, [])

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

      const items = Array.isArray(data.items) ? data.items : []
      const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase()
        if (!needle) return items
        return items.filter((item) =>
          [item.title, item.status, item.project, item.owner].some((value) => String(value ?? '').toLowerCase().includes(needle)),
        )
      }, [items, query])
      const selected = items.find((item) => item.id === selectedId) || null

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
          setToast('开发指令已复制，粘贴到左侧 AI 对话即可开工')
        } catch {
          setToast('剪贴板不可用，请手动全选复制下面的指令')
        }
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

      if (showSettings || !state?.configured) {
        return h(SettingsView, { settings, onCancel: state?.configured ? () => setShowSettings(false) : null, onSave: saveSettings, larkCli: state?.larkCli })
      }

      return h(
        'div',
        { className: 'rdw-body' },
        h(
          'div',
          { className: 'rdw-head' },
          h('h2', null, '开发需求'),
          h('span', { className: 'rdw-count' }, loading ? '读取中…' : `${filtered.length} / ${items.length} 条`),
          h('span', { className: 'rdw-grow' }),
          h('button', { className: 'rdw-btn', onClick: load, disabled: loading }, '刷新'),
          h('button', { className: 'rdw-btn', onClick: () => setShowSettings(true) }, '设置'),
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
              h(
                'div',
                { className: 'rdw-toolbar' },
                h('input', {
                  className: 'rdw-input',
                  placeholder: '按标题 / 状态 / 项目 / 负责人筛选',
                  value: query,
                  onChange: (event) => setQuery(event.target.value),
                  spellCheck: false,
                }),
              ),
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
              !failure && !loading && !filtered.length
                ? h('div', { className: 'rdw-empty' }, items.length ? '没有匹配的需求' : '这张表里还没有读到需求记录')
                : null,
              filtered.map((item) =>
                h(
                  'button',
                  {
                    key: item.id || item.title,
                    className: 'rdw-item',
                    'aria-current': item.id === selectedId ? 'true' : 'false',
                    onClick: () => {
                      setSelectedId(item.id)
                      setInstruction('')
                      setToast('')
                    },
                  },
                  h('span', { className: 'rdw-item-title' }, item.title),
                  h(
                    'span',
                    { className: 'rdw-meta' },
                    item.status ? h(Chip, { tone: statusTone(item.status) }, item.status) : null,
                    item.project ? h('span', null, item.project) : null,
                    item.owner ? h('span', null, `@${item.owner}`) : null,
                  ),
                ),
              ),
            ),
          ),
          h('div', { className: 'rdw-col rdw-col-detail' }, h(DetailView, {
            item: selected,
            settings,
            toast,
            instruction,
            setInstruction,
            copyInstruction,
            writeBack,
            chooseDirectory,
          })),
        ),
      )
    }

    function SettingsView({ settings, onCancel, onSave, larkCli }) {
      const [link, setLink] = useState(settings.baseToken ? `${settings.baseToken} ${settings.tableId}` : '')
      const [tableId, setTableId] = useState(settings.tableId ?? '')
      const [projectDir, setProjectDir] = useState(settings.projectDir ?? '')
      const [titleField, setTitleField] = useState(settings.titleField ?? '')
      const [statusField, setStatusField] = useState(settings.statusField ?? '')
      const [busy, setBusy] = useState(false)
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
            h('h3', null, '需求来源（飞书多维表格）'),
            h(Field, {
              label: '多维表格链接或 base_token（可连同 table 参数一起粘贴）',
              value: link,
              placeholder: 'https://xxx.feishu.cn/base/xxxx?table=tblxxxx',
              onChange: setLink,
            }),
            h(Field, { label: '表名或 table_id（链接里已带 table 时可留空）', value: tableId, placeholder: '需求表 或 tblxxxx', onChange: setTableId }),
            h('div', { className: 'rdw-note' }, `读取身份：${larkCli ? 'lark-cli 已就绪' : 'lark-cli 未找到'}　·　本工作台不保存任何飞书凭证，一律走本机 lark-cli。`),
          ),
          h(
            'div',
            { className: 'rdw-card', style: { marginTop: 12 } },
            h('h3', null, '默认项目目录'),
            h(Field, { label: '需求默认落到哪个项目（绝对路径）', value: projectDir, placeholder: 'D:\\workspace\\your-project', onChange: setProjectDir }),
            h('div', { className: 'rdw-note' }, '留空也可以：在需求详情里再选目录。'),
          ),
          h(
            'div',
            { className: 'rdw-card', style: { marginTop: 12 } },
            h('h3', null, '字段映射（可选）'),
            h('div', { className: 'rdw-note' }, '留空则按「标题 / 状态 / 项目 / 负责人」自动识别字段名。'),
            h(Field, { label: '标题字段名', value: titleField, placeholder: '自动识别', onChange: setTitleField }),
            h(Field, { label: '状态字段名（回写状态也用它）', value: statusField, placeholder: '自动识别，回写默认「状态」', onChange: setStatusField }),
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
                    await onSave({ baseInput: link, tableId, projectDir, titleField, statusField })
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

    function DetailView({ item, settings, toast, instruction, copyInstruction, writeBack, chooseDirectory }) {
      if (!item) {
        return h('div', { className: 'rdw-scroll' }, h('div', { className: 'rdw-empty' }, '从左边选一条需求，这里会显示详情和「交给 AI 开发」的入口'))
      }
      const statuses = ['待开发', '开发中', '已完成']
      return h(
        'div',
        { className: 'rdw-scroll' },
        h('h3', { style: { margin: '0 0 8px', fontSize: 13.5 } }, item.title),
        h(
          'div',
          { className: 'rdw-meta', style: { marginBottom: 10 } },
          item.status ? h(Chip, { tone: statusTone(item.status) }, item.status) : null,
          item.project ? h(Chip, null, item.project) : null,
          item.owner ? h(Chip, null, `@${item.owner}`) : null,
        ),
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
        toast ? h('div', { className: 'rdw-note', style: { marginTop: 12, color: 'var(--dsw-alias-state-success-primary,#3ecf8e)' } }, toast) : null,
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

    const MODULES = [
      { id: 'requirements', glyph: '📋', label: '开发需求' },
      { id: 'skills', glyph: '🧩', label: '技能与规范' },
    ]

    function BusinessPanel({ service, entry }) {
      ensureStyles()
      const [rootRef, width] = useContainerWidth()
      const [active, setActive] = useState('requirements')
      const [state, setState] = useState(null)
      const [stateError, setStateError] = useState(null)
      const uiWorkspace = service?.uiWorkspace

      const reloadState = useCallback(async () => {
        try {
          setState(await api('/state'))
          setStateError(null)
        } catch (error) {
          setStateError(error.message)
        }
      }, [])

      useEffect(() => {
        reloadState()
      }, [reloadState])

      const narrow = width > 0 && width < 430

      if (stateError) {
        return h(
          'div',
          { className: `rdw-root${narrow ? ' rdw-narrow' : ''}`, ref: rootRef },
          h('div', { className: 'rdw-scroll' }, h('div', { className: 'rdw-error' }, `工作台服务不可用：${stateError}`, h('div', { style: { marginTop: 8 } }, h('button', { className: 'rdw-btn', onClick: reloadState }, '重试')))),
        )
      }

      return h(
        'div',
        { className: `rdw-root${narrow ? ' rdw-narrow' : ''}`, ref: rootRef },
        h(
          'nav',
          { className: 'rdw-rail', 'aria-label': '工作台模块' },
          h('div', { className: 'rdw-rail-title' }, '需求开发工作台'),
          ...MODULES.map((module) =>
            h(
              'button',
              {
                key: module.id,
                className: 'rdw-mod',
                'aria-current': active === module.id ? 'true' : 'false',
                onClick: () => setActive(module.id),
              },
              h('span', { className: 'rdw-mod-glyph', 'aria-hidden': 'true' }, module.glyph),
              h('span', { className: 'rdw-mod-label' }, module.label),
            ),
          ),
        ),
        h(
          'div',
          { className: 'rdw-main' },
          active === 'requirements'
            ? h(RequirementsModule, { state, reloadState, uiWorkspace })
            : h(SkillsModule, { state, reloadState, uiWorkspace }),
        ),
      )
    }

    function apply(ctx) {
      const uiWorkspace = typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : undefined
      ctx.effect(() =>
        ctx.desktopWorkbenches.register(
          {
            title: '需求开发工作台',
            repository: 'https://github.com/local-dev-workbench/dsh-requirement-dev-workbench',
            description: '读取飞书多维表格里的开发需求，选中本地项目后生成开发指令，并可浏览项目/全局 skill 与开发规范。',
            panelTitle: '需求开发',
            layout: { businessSide: 'right', businessWidth: 0.42 },
          },
          (props) => h(BusinessPanel, { ...props, service: { ...(props?.service ?? {}), uiWorkspace } }),
        ),
      )
    }

    return { apply, inject: ['desktopWorkbenches'] }
  },
})
