/**
 * 记录详情栏「拖拽改宽度/高度」的浏览器内测（自测用，不参与运行）。
 *
 * 为什么要有它：改宽度这条链路上出过两个只有真浏览器才能复现的问题 ——
 *   1. 内容区窄的时候被 CSS 自动改成上下排 → 详情占满整宽 → 宽度根本拖不动；
 *   2. 拖动算出来的值正好是 0 时，被当成「没配过」→ 宽度一下跳到最大。
 * 单元测试（test/smoke.mjs）能覆盖纯函数，但覆盖不了「真实 CSS 布局 + 真实指针事件」，
 * 所以这里直接把真实 lib/client.js 的代码和真实 CSS 装进浏览器里量像素。
 *
 * 用法：
 *   node test/browser/itest.mjs          → 打印地址，用浏览器打开看 PASS/FAIL
 *   RDW_ITEST_PORT=8899 node test/browser/itest.mjs
 *
 * 页面断言来自 test/browser/driver.js，全部结果也会写到页面 #log 与 window.__itest。
 */
import { createServer } from 'node:http'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const packageRoot = fileURLToPath(new URL('../..', import.meta.url))
const here = fileURLToPath(new URL('.', import.meta.url))
const out = join(tmpdir(), 'rdw-itest')
const port = Number(process.env.RDW_ITEST_PORT || 8792)

const source = await readFile(join(packageRoot, 'lib', 'client.js'), 'utf8')
const cssStart = source.indexOf('const CSS = `')
const cssEnd = source.indexOf('`\n\n    function ensureStyles', cssStart)
if (cssStart < 0 || cssEnd < 0) throw new Error('没有从 lib/client.js 里取到 CSS')
const css = source.slice(source.indexOf('`', cssStart) + 1, cssEnd)

await mkdir(out, { recursive: true })
await copyFile(join(packageRoot, 'lib', 'client.js'), join(out, 'client.js'))
await copyFile(join(here, 'driver.js'), join(out, 'driver.js'))

const page = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>工作台详情栏自测</title>
<style>${css}</style>
<style>
body{margin:0;background:#16181d;color:#e8eaed;font:13px/1.55 system-ui,sans-serif}
.case{margin:12px;padding:10px;border:1px solid rgba(255,255,255,.16);border-radius:8px}
.case>b{display:block;margin-bottom:6px;color:#9aa0a6;font-weight:600}
.stage{height:300px}
#log{white-space:pre-wrap;font:12px/1.5 ui-monospace,Consolas,monospace;padding:12px;border-top:1px solid rgba(255,255,255,.2)}
.pass{color:#7ee787}.fail{color:#ff7b72}
</style></head>
<body>
<div class="case"><b>并排（默认布局）· 内容区 400px —— 就是这个宽度以前被自动改成上下排，导致宽度拖不动</b>
  <div class="stage" id="stageA" style="width:400px">
    <div class="rdw-root" style="height:100%"><div class="rdw-split has-detail" id="splitA">
      <div class="rdw-col rdw-col-list" id="listA">列表</div>
      <div class="rdw-pane-resizer" id="barA" role="separator" aria-orientation="vertical" tabindex="0"></div>
      <div class="rdw-col rdw-col-detail is-sized" id="detailA" style="--rdw-detail-w:280px">详情</div>
    </div></div>
  </div>
</div>
<div class="case"><b>并排 · 内容区 900px（宽窗口作对照）</b>
  <div class="stage" id="stageB" style="width:900px">
    <div class="rdw-root" style="height:100%"><div class="rdw-split has-detail" id="splitB">
      <div class="rdw-col rdw-col-list" id="listB">列表</div>
      <div class="rdw-pane-resizer" id="barB" role="separator" aria-orientation="vertical" tabindex="0"></div>
      <div class="rdw-col rdw-col-detail is-sized" id="detailB" style="--rdw-detail-w:420px">详情</div>
    </div></div>
  </div>
</div>
<div class="case"><b>显式选「上下排」· 内容区 400px（横杠拖高度仍然可用）</b>
  <div class="stage" id="stageC" style="width:400px">
    <div class="rdw-root" style="height:100%"><div class="rdw-split has-detail is-stacked" id="splitC">
      <div class="rdw-col rdw-col-list" id="listC">列表</div>
      <div class="rdw-pane-resizer" id="barC" role="separator" aria-orientation="vertical" tabindex="0"></div>
      <div class="rdw-pane-resizer-v" id="barCv" role="separator" aria-orientation="horizontal" tabindex="0"></div>
      <div class="rdw-col rdw-col-detail is-sized" id="detailC" style="--rdw-detail-h:280px">详情</div>
    </div></div>
  </div>
</div>
<div class="case"><b>汇总清单回归：400px 容器里保存值 420px（测量同步前也不能挤没列表和拖拽条）</b>
  <div class="stage" id="stageD" style="width:400px">
    <div class="rdw-root" style="height:100%"><div class="rdw-split has-detail" id="splitD">
      <div class="rdw-col rdw-col-list" id="listD">汇总清单</div>
      <div class="rdw-pane-resizer" id="barD" role="separator" aria-orientation="vertical" tabindex="0"></div>
      <div class="rdw-col rdw-col-detail is-sized" id="detailD" style="--rdw-detail-w:420px">记录详情</div>
    </div></div>
  </div>
</div>
<div class="case"><b>未选中记录：汇总清单占满 400px 内容区（不再只显示 44%）</b>
  <div class="stage" id="stageE" style="width:400px">
    <div class="rdw-root" style="height:100%"><div class="rdw-split" id="splitE">
      <div class="rdw-col rdw-col-list" id="listE">完整汇总清单</div>
    </div></div>
  </div>
</div>
<div id="log">待运行…</div>
<script>
// 桩 React：只为让工厂跑起来拿到 __pure 里的真实函数（本页不渲染 React 组件）
const stubReact = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }),
  useEffect: () => {}, useMemo: (fn) => fn(), useCallback: (fn) => fn, useRef: (initial) => ({ current: initial }), useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
}
window.__ModuleLoader__ = { load: (definition) => { window.__rdwDef = definition } }
</script>
<script src="./client.js"></script>
<script src="./driver.js"></script>
</body></html>`

await writeFile(join(out, 'itest.html'), page)

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }
createServer(async (req, res) => {
  const path = new URL(req.url, `http://127.0.0.1:${port}`).pathname
  const file = join(out, path === '/' ? 'itest.html' : path.replace(/^\/+/, ''))
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`详情栏浏览器自测：http://127.0.0.1:${port}/itest.html`)
  console.log('页面底部会列出自测结果；window.__itest 里有原始几何数据。Ctrl+C 结束。')
})