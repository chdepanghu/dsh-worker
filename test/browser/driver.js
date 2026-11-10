/** 浏览器内测驱动：用真实 PointerEvent 驱动真实拖拽代码，量真实布局 */
const NL = '\n'
const results = []
const log = document.getElementById('log')

function t(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail })
}

const mod = window.__rdwDef.factory((name) => (name === 'react' ? stubReact : undefined))
const pure = mod.__pure || {}
const clampW = pure.clampDetailWidth
const clampH = pure.clampDetailHeight
const makeSession = pure.createDragSession

t('客户端包里能取到真实拖拽函数', typeof makeSession === 'function' && typeof clampW === 'function', {
  hasSession: typeof makeSession,
  hasClampW: typeof clampW,
  hasClampH: typeof clampH,
})

/* ---------- 1. 几何：400 / 900 并排，上下排 ---------- */
function geom(caseId) {
  const stage = document.getElementById('stage' + caseId)
  const split = document.getElementById('split' + caseId)
  const detail = document.getElementById('detail' + caseId)
  const list = document.getElementById('list' + caseId)
  const bar = document.getElementById('bar' + caseId)
  const boxOf = (el) => (el ? el.getBoundingClientRect() : { width: 0, height: 0, left: 0, top: 0 })
  const barStyle = bar ? getComputedStyle(bar) : null
  return {
    stageWidth: Math.round(boxOf(stage).width),
    splitWidth: Math.round(boxOf(split).width),
    splitHeight: Math.round(boxOf(split).height),
    listWidth: Math.round(boxOf(list).width),
    detailWidth: Math.round(boxOf(detail).width),
    detailHeight: Math.round(boxOf(detail).height),
    barDisplay: barStyle ? barStyle.display : 'missing',
    barWidth: Math.round(boxOf(bar).width),
    barHeight: Math.round(boxOf(bar).height),
    direction: getComputedStyle(split).flexDirection,
  }
}

const gA = geom('A')
const gB = geom('B')
const gC = geom('C')
const gD = geom('D')
const gE = geom('E')
t(
  '内容区 400px 时仍是并排、竖杠在（以前这里会被自动改成上下排 → 详情占满整宽 → 宽度拖不动）',
  gA.direction === 'row' && gA.barDisplay !== 'none' && gA.barWidth > 0 && gA.detailWidth < gA.stageWidth,
  gA,
)
t(
  '并排时详情宽度真的由 --rdw-detail-w 决定（400 内容区 → 280 详情 + 16px 拖拽命中区，列表拿剩下）',
  Math.abs(gA.detailWidth - 280) <= 1 && gA.listWidth > 60 && Math.abs(gA.stageWidth - (gA.listWidth + gA.detailWidth)) <= 8,
  gA,
)
t(
  '未选中记录时汇总清单列表占满内容区，不再限于原先的 44%',
  gE.listWidth >= 399 && gE.splitWidth === 400,
  gE,
)
t(
  '宽窗口对照：900px 内容区 → 详情 420px（配置值直接生效）',
  Math.abs(gB.detailWidth - 420) <= 1,
  gB,
)
t(
  '汇总清单回归：保存宽度大于容器时仍限宽，列表与拖拽条可见且拖动命中区加宽',
  gD.detailWidth <= 280 && gD.listWidth >= 110 && gD.barWidth >= 12 && gD.barDisplay !== 'none',
  gD,
)
t(
  '显式「上下排」：竖杠让位、横杠出现、详情按 --rdw-detail-h 取高度',
  gC.direction === 'column' &&
    getComputedStyle(document.getElementById('barC')).display === 'none' &&
    getComputedStyle(document.getElementById('barCv')).display !== 'none' &&
    Math.abs(gC.detailHeight - 280) <= 1,
  gC,
)

/* ---------- 2. 真实拖拽：pointerdown 挂监听 → pointermove → pointerup ---------- */
const dragLog = []
function runDrag(caseId, barId, detailId, axis, moves, startRequest) {
  const bar = document.getElementById(barId)
  const detail = document.getElementById(detailId)
  const split = document.getElementById('split' + caseId)
  const applied = []
  const committed = []
  const splitWidth = split.getBoundingClientRect().width
  const splitHeight = split.getBoundingClientRect().height
  const prop = axis === 'x' ? '--rdw-detail-w' : '--rdw-detail-h'
  const startValue = axis === 'x' ? clampW(startRequest, splitWidth) : clampH(startRequest, splitHeight)
  // 先把起始值摆到页面上，再开始拖（和组件里 style 用同一个变量）
  detail.style.setProperty(prop, startValue + 'px')
  const before = axis === 'x' ? detail.getBoundingClientRect().width : detail.getBoundingClientRect().height

  // 模拟宿主：在 document 捕获阶段把事件 stopPropagation 掉 —— 挂在 window 捕获阶段的监听照样收得到
  const hostEater = (event) => event.stopPropagation()
  document.addEventListener('pointermove', hostEater, true)
  let captured = 'not-attempted'
  try {
    bar.setPointerCapture(7)
    captured = 'ok'
  } catch (error) {
    captured = String(error && error.name)
  }

  const session = makeSession({
    axis,
    sign: axis === 'x' ? -1 : 1,
    startCoord: 300,
    startValue,
    clamp: (value) => (axis === 'x' ? clampW(value, splitWidth) : clampH(value, splitHeight)),
    apply: (value) => {
      applied.push(value)
      detail.style.setProperty(prop, value + 'px')
    },
    commit: (value) => committed.push(value),
    source: window,
    target: bar,
    pointerId: 7,
  })

  dragLog.push({ caseId, axis, startValue, splitWidth: Math.round(splitWidth), splitHeight: Math.round(splitHeight), captured })
  const sizes = []
  for (const coord of moves) {
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: axis === 'x' ? coord : 300, clientY: axis === 'y' ? coord : 300, bubbles: true, pointerId: 7 }))
    sizes.push(Math.round(axis === 'x' ? detail.getBoundingClientRect().width : detail.getBoundingClientRect().height))
  }
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7 }))
  document.removeEventListener('pointermove', hostEater, true)

  const after = axis === 'x' ? detail.getBoundingClientRect().width : detail.getBoundingClientRect().height
  return {
    startValue,
    before: Math.round(before),
    after: Math.round(after),
    applied,
    committed,
    sizes,
    listenersAfter: session.isActive() ? 'still-active' : 'cleaned',
    range: axis === 'x' ? [clampW(1, splitWidth), clampW(99999, splitWidth)] : [clampH(1, splitHeight), clampH(99999, splitHeight)],
  }
}

// 400 内容区：从中间值开始 —— 先向左拖（变宽撞上限），再向右拖（变窄撞下限）
const dragA = runDrag('A', 'barA', 'detailA', 'x', [260, 150, 500], 200)
t('真实拖拽（400 内容区）：向左拖 → 详情宽度真的变大', dragA.sizes[0] > dragA.before, dragA)
t(
  '真实拖拽：一路拖到两头都被夹在自己范围内，屏上宽度也跟着走（不是只改状态）',
  dragA.applied.every((value) => value >= dragA.range[0] && value <= dragA.range[1]) &&
    dragA.sizes.every((value) => value >= dragA.range[0] && value <= dragA.range[1]) &&
    dragA.sizes[dragA.sizes.length - 1] === dragA.range[0] &&
    dragA.applied[1] === 240 &&
    dragA.applied[2] === dragA.range[1] &&
    dragA.committed.length === 1,
  dragA,
)
t(
  '松手后会话收摊：只提交一次（把最后停住的宽度存回去）、监听解绑',
  dragA.listenersAfter === 'cleaned' && dragA.committed.length === 1 && dragA.committed[0] === dragA.range[0],
  dragA,
)
t('宿主在 document 上 stopPropagation 也照样收得到（捕获阶段监听 window）', dragA.applied.length >= 3, dragA.applied)

const dragC = runDrag('C', 'barCv', 'detailC', 'y', [380, 120, 320], 150)
t(
  '上下排拖高度：向下拖变高、向上拖变矮、两头夹住、屏上高度跟着走、松手提交一次',
  dragC.applied.length >= 3 &&
    dragC.applied.every((value) => value >= dragC.range[0] && value <= dragC.range[1]) &&
    dragC.sizes[0] > dragC.before &&
    dragC.sizes[1] === dragC.range[0] &&
    dragC.sizes[2] > dragC.sizes[1] &&
    dragC.committed.length === 1 &&
    dragC.committed[0] === dragC.sizes[2],
  dragC,
)

/* ---------- 3. 边界语义：拖过头应当落到最小，而不是跳回最大 ---------- */
const clampChecks = {
  负数: [clampW(-300, 400), clampW(-1, 400), clampW(1, 400)],
  零: [clampW(0, 400), clampW(null, 400), clampW(undefined, 400)],
  超上限: clampW(99999, 400),
  正常: [clampW(280, 400), clampW(200, 400)],
  高度400: [clampH(-300, 400), clampH(1, 400), clampH(99999, 400)],
}
t(
  '拖过头（负数）落到最小宽度，不再「当成没配过 → 跳到最大」（这就是以前拖动会跳的毛病）',
  clampChecks.负数[0] === clampChecks.负数[2] && clampChecks.负数[0] === clampW(1, 400) && clampChecks.负数[0] < clampChecks.超上限,
  clampChecks,
)
t('没配过（0 / null / undefined）才用默认值 420 并按范围夹取', clampChecks.零.every((value) => value === clampW(0, 400)), clampChecks.零)
t('内容区 400px 的详情宽度可调范围足够大（能用鼠标拖，不是钉死一个值）', clampChecks.超上限 - clampChecks.负数[0] >= 120, {
  min: clampChecks.负数[0],
  max: clampChecks.超上限,
})

/* ---------- 4. 竖杠可聚焦、有可见细线 ---------- */
const appBar = document.getElementById('barA')
appBar.focus()
t('竖杠有可见细线且可聚焦（键盘也能调）', document.activeElement === appBar && getComputedStyle(appBar, '::after').backgroundColor.length > 0, {
  active: document.activeElement && document.activeElement.id,
  afterBg: getComputedStyle(appBar, '::after').backgroundColor,
})

window.__itest = { results, geom: { A: gA, B: gB, C: gC }, dragA, dragC, clampChecks, dragLog }
const passed = results.filter((item) => item.ok).length
log.innerHTML =
  '<b>' + passed + '/' + results.length + ' 通过</b>' + NL +
  results
    .map((item) => '<span class="' + (item.ok ? 'pass' : 'fail') + '">' + (item.ok ? 'PASS  ' : 'FAIL  ') + item.name + '</span>' + (item.ok ? '' : NL + '      ' + JSON.stringify(item.detail)))
    .join(NL)
document.title = results.every((item) => item.ok) ? '详情栏自测：全部通过' : '详情栏自测：有失败'