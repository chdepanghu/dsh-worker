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
    const WORKBENCH_VERSION = '3.9.0'
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
.rdw-mod-row{display:flex;align-items:center;gap:2px;width:100%}
.rdw-mod-row>.rdw-mod{flex:1 1 auto}
.rdw-mod-edit{flex:0 0 auto;width:22px;height:24px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#9aa0a6);font:inherit;font-size:12px;cursor:pointer;opacity:0}
.rdw-mod-row:hover .rdw-mod-edit,.rdw-mod-edit:focus-visible{opacity:1}
.rdw-mod-edit:hover{background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.08));color:inherit}
.rdw-mod-rename{flex:1 1 auto;min-width:0;padding:6px 8px;border:1px solid var(--dsw-alias-brand-primary,#4c8dff);border-radius:8px;background:var(--dsw-alias-bg-base,#16181d);color:inherit;font:inherit}
/* 侧边栏宽度拖拽条 */
.rdw-rail-resizer{flex:0 0 6px;margin-left:-3px;cursor:col-resize;background:transparent;position:relative;z-index:2}
.rdw-rail-resizer::after{content:'';position:absolute;inset:0 2px;border-radius:2px;background:transparent}
.rdw-rail-resizer:hover::after,.rdw-rail-resizing .rdw-rail-resizer::after{background:var(--dsw-alias-brand-primary,#4c8dff);opacity:.6}
.rdw-rail-resizing{cursor:col-resize;user-select:none}
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
.rdw-cards{display:grid;grid-template-columns:repeat(auto-fill,216px);gap:8px}
.rdw-kcard{position:relative;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));border-radius:9px;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.04));padding:9px 10px;cursor:grab;display:flex;flex-direction:column;gap:6px;height:152px;width:216px;overflow:hidden}
.rdw-kcard:hover{border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.2))}
.rdw-kcard.is-selected{border-color:var(--dsw-alias-brand-primary,#8fb6ff);box-shadow:0 0 0 1px rgba(143,182,255,.5)}
.rdw-kcard.is-dragging{opacity:.45}
.rdw-kcard-summary{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
/* 卡片正文：配置好的字段一行一个（标签 + 值），值超出省略 */
.rdw-card-fields{display:flex;flex-direction:column;gap:3px;min-height:0;overflow:hidden;border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));padding-top:6px}
.rdw-card-field{display:flex;align-items:baseline;gap:6px;font-size:12px;line-height:17px;min-width:0}
.rdw-card-field-label{flex:0 0 58px;color:var(--dsw-alias-label-secondary,#9aa0a6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rdw-card-field-value{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* 固定长宽 + 超出省略：标题两行、摘要两行、角标压右上角 */
.rdw-kcard .rdw-item-title{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;padding-right:60px;font-weight:600}
.rdw-kcard .rdw-meta{flex-wrap:nowrap;overflow:hidden;white-space:nowrap;min-height:18px}
.rdw-kcard .rdw-note{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.rdw-kcard-badge{position:absolute;top:7px;right:7px;display:inline-flex;align-items:center;gap:3px;font-size:11px;line-height:16px;padding:0 6px;border-radius:9px;border:1px solid transparent;background:rgba(255,255,255,.10);color:var(--dsw-alias-label-primary,#e8eaed);cursor:pointer}
.rdw-kcard-badge::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.9}
.rdw-kcard-badge.tone-handed{color:#9aa0a6;border-color:rgba(154,160,166,.45)}
.rdw-kcard-badge.tone-active{color:#7fb3ff;border-color:rgba(127,179,255,.5)}
.rdw-kcard-badge.tone-done{color:#5fd0a0;border-color:rgba(95,208,160,.5)}
.rdw-kcard-badge.tone-blocked{color:#ef6b6b;border-color:rgba(239,107,107,.5)}
.rdw-kcard-badge b{font-weight:600}
/* 详情弹窗 */
.rdw-mask{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.55)}
.rdw-modal{width:min(760px,94vw);max-height:86vh;overflow:auto;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.16));border-radius:12px;background:var(--dsw-alias-bg-base,#16181d);color:var(--dsw-alias-label-primary,#e8eaed);padding:14px;box-shadow:0 18px 48px rgba(0,0,0,.45)}
.rdw-modal-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.rdw-modal-head strong{overflow-wrap:anywhere}
.rdw-modal .rdw-field{flex-direction:row;align-items:baseline;gap:8px;margin-bottom:6px}
.rdw-field-label{flex:0 0 56px;font-size:12px;color:var(--dsw-alias-label-secondary,#9aa0a6)}
.rdw-field-value{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}
.rdw-btn.is-primary{border-color:var(--dsw-alias-brand-primary,#8fb6ff);background:rgba(143,182,255,.16)}
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
/* 项目开发：任务 + AI 进度一行一条 */
.rdw-devlist{display:flex;flex-direction:column;gap:4px}
.rdw-devrow{display:flex;align-items:center;gap:8px;padding:6px 9px;border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.09));border-radius:8px;background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.03));cursor:pointer;font-size:12.5px}
.rdw-devrow:hover{background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.07))}
.rdw-devcell{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* 技能与规范：来源分组可收缩/展开 */
.rdw-group{display:flex;align-items:center;gap:6px;width:100%;margin:0 0 6px;padding:4px 6px;font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary,#9aa0a6);background:transparent;border:1px solid transparent;border-radius:7px;cursor:pointer;text-align:left}
.rdw-group:hover{background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.05));color:inherit}
.rdw-group:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4c8dff);outline-offset:1px}
.rdw-group-caret{flex:0 0 auto;font-size:10px;opacity:.85}
.rdw-group-title{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.rdw-group-count{flex:0 0 auto;font-size:11px;opacity:.8}
.rdw-group.is-collapsed{color:var(--dsw-alias-label-secondary,#9aa0a6)}
/* 对话输入框「＋ 专家」入口（挂在宿主 slot 上，自身不占整行） */
.rdw-expert-entry{position:relative;display:inline-flex;align-items:center;min-width:0}
.rdw-expert-entry-btn{display:inline-flex;align-items:center;gap:4px;max-width:220px;padding:3px 9px;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.16));border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary,#9aa0a6);font:inherit;font-size:12px;line-height:1.5;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rdw-expert-entry-btn:hover{color:inherit;background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.08))}
.rdw-expert-entry-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4c8dff);outline-offset:1px}
.rdw-expert-pop{position:absolute;bottom:calc(100% + 6px);left:0;z-index:60;width:320px;max-width:min(86vw,320px);max-height:56vh;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.16));border-radius:10px;background:var(--dsw-alias-bg-layer-1,#1f2229);box-shadow:0 10px 30px rgba(0,0,0,.38);overflow:hidden}
.rdw-expert-pop-head{padding:9px 10px;font-size:12px;font-weight:600;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1))}
.rdw-expert-pop-body{flex:1 1 auto;min-height:0;overflow:auto;padding:6px}
.rdw-expert-pop-group{padding:8px 8px 4px;font-size:11px;letter-spacing:.03em;color:var(--dsw-alias-label-secondary,#9aa0a6)}
.rdw-expert-option{display:flex;flex-direction:column;gap:2px;width:100%;padding:7px 8px;border:1px solid transparent;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.rdw-expert-option:hover{background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.08))}
.rdw-expert-option.is-current{border-color:var(--dsw-alias-brand-primary,#4c8dff)}
.rdw-expert-option:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4c8dff);outline-offset:1px}
.rdw-expert-option-title{font-size:11px;color:var(--dsw-alias-label-secondary,#9aa0a6);overflow-wrap:anywhere}
.rdw-expert-option:nth-child(n) .rdw-expert-option-title{color:inherit;font-size:12px}
.rdw-expert-option-note{font-size:11px;line-height:1.45;color:var(--dsw-alias-label-secondary,#9aa0a6);overflow-wrap:anywhere}
.rdw-expert-pop-foot{padding:8px 10px;font-size:11px;line-height:1.5;border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.1));color:var(--dsw-alias-label-secondary,#9aa0a6)}
.rdw-expert-pop-foot.is-error{color:var(--dsw-alias-label-danger,#ff6b6b)}
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

    const RUN_TONE = { 'handed-off': 'handed', 'in-progress': 'active', done: 'done', blocked: 'blocked' }

    /** 一条需求/任务的执行记录汇总：最新状态 + 次数（卡片角标用）。 */
    function runBadge(item, runs) {
      const mine = (runs ?? []).filter(
        (run) =>
          run &&
          ((run.recordId && item?.id && run.recordId === item.id) || (!run.recordId && run.title && item?.title && run.title === item.title)),
      )
      if (!mine.length) return null
      const latest = [...mine].sort((a, b) => Number(b.at ?? 0) - Number(a.at ?? 0))[0]
      const status = RUN_LABEL[latest.status] ? latest.status : 'handed-off'
      return { status, label: RUN_LABEL[status], count: mine.length, at: Number(latest.at ?? 0), tone: RUN_TONE[status], note: latest.note ?? '' }
    }

    function formatTime(value) {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value ?? '')
      const pad = (number) => String(number).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    /**
     * 交付指令。第四段专家信息来自「专家与专家团」模块：选中的专家/专家团会变成
     * 指令开头的角色设定，AI 一读到就知道该以谁的身份做需求理解与实现。
     */
    function expertInstructionLines(pick) {
      if (!pick) return []
      if (pick.kind === 'team') {
        const lines = [`请你按「${pick.name}」这个专家团的分工来完成下面这条开发需求。`]
        if (pick.profession) lines.push(`专家团定位：${pick.profession}`)
        if (pick.description) lines.push(`说明：${pick.description}`)
        const members = pick.memberDetails ?? []
        const leadId = pick.lead
        if (members.length) {
          lines.push('成员与角色：')
          for (const member of members) {
            const memberId = member.agentId ?? member.id ?? ''
            lines.push(`- ${member.displayName || member.name} · ${member.profession || member.name}${memberId && memberId === leadId ? '（团长）' : ''}：${member.description || ''}`)
            if (member.path) lines.push(`  角色定义文件：${member.path}`)
          }
        } else if ((pick.members ?? []).length) {
          lines.push(`成员（专家标识）：${(pick.members ?? []).join('、')}`)
        }
        if ((pick.flow ?? []).length) {
          lines.push('协作流程：')
          for (const [index, step] of pick.flow.entries()) lines.push(`${index + 1}. ${step}`)
        }
        lines.push('每个人只做自己角色范围内的事；团长负责汇总与最终验收。')
        return lines
      }
      const lines = [`请你以「${pick.displayName || pick.name} · ${pick.profession || pick.name}」这个专家的身份来完成下面这条开发需求。`]
      if (pick.path) lines.push(`角色定义文件：${pick.path}（先读它，按里面的能力范围、工作流程与输出规范执行）`)
      if (pick.description) lines.push(`这个专家擅长：${pick.description}`)
      return lines
    }

    /** 把选中的专家（settings.expert）配上已加载的专家数据，得到可渲染的角色信息。 */
    function resolveExpertPick(settings, expertData) {
      const selected = String(settings?.expert ?? '')
      if (!selected) return null
      const [kind, id] = selected.split(':')
      if (kind === 'team') {
        const team = (expertData?.teams ?? []).find((entry) => entry.id === id)
        if (!team) return null
        const memberDetails = team.members.map((member) => (expertData?.experts ?? []).find((expert) => expert.agentId === member)).filter(Boolean)
        return { ...team, kind: 'team', memberDetails }
      }
      const expert = (expertData?.experts ?? []).find((entry) => entry.agentId === id)
      return expert ? { ...expert, kind: 'expert' } : null
    }

    /**
     * 「交给 AI 完善并创建」用的专业养成指令：用户只写一段描述，剩下的由 agent 按
     * 固定流程补齐并**直接落盘**。
     *
     * 这里刻意写成一份可执行的作业单：目标文件绝对路径、精确的文件格式、内部 6 步流程、
     * 自检项，以及最重要的一条 —— 不要反问用户、不许要求确认（信息不足按专业判断补齐，
     * 把假设写在文件末尾）。这份指令既可以直接发进对话（agent 模式），也可以复制/插入输入框。
     */
    function expertEnrichmentPrompt(options) {
      const isTeam = options?.mode === 'team'
      const description = String(options?.description ?? '').trim()
      const dir = String(options?.dir ?? '').trim()
      const teamFile = String(options?.teamFile ?? '').trim()
      const id = String(options?.id ?? '').trim()
      const displayName = String(options?.displayName ?? '').trim()
      const known = (options?.existingExperts ?? []).map((entry) => entry.agentId).filter(Boolean)
      const head = isTeam
        ? [
            '你是 DeepSeek Harness 的「专家团架构师」。请把下面这段粗略描述，完善成一个能立刻开工的专家团（团长 + 成员分工），并**直接落盘**。',
          ]
        : ['你是 DeepSeek Harness 的「专家架构师」。请把下面这段粗略描述，完善成一位能立刻上岗的专家角色定义，并**直接落盘**。']
      const lines = [...head, '', '## 用户的原话（唯一输入）', '"""', description || '（用户只写了这些，剩下的你按专业判断补齐）', '"""', '']
      if (isTeam) {
        lines.push(
          '## 你要产出的东西',
          `1. **专家团条目**：追加进 \`${teamFile || '<专家团清单文件>'}\` 的 \`teams\` 数组，字段：\`{ id, name, profession, description, lead, members, flow, createdAt }\``,
          `   - \`members\` 是成员专家的标识数组（kebab-case 英文）；\`lead\` 取最该拍板的那位；\`flow\` 是协作步骤（3-6 条）。`,
          `2. **缺的成员专家**：每位补一份角色定义文件 \`${dir || '<专家目录>'}\\<成员标识>.md\`（格式见下），团队里没有的成员才需要补。`,
          known.length ? `   - 项目里已有的专家：${known.join('、')}（能复用就复用，不要重复造）` : '',
          '',
          '## 单个专家文件的格式（Claude / Codex / DSH 都能读）',
        )
      } else {
        lines.push(
          '## 你要产出的东西',
          `1. **一个文件**：\`${dir || '<专家目录>'}\\${id ? `${id}.md` : '<标识>.md'}\`${id ? '（标识你已指定，直接用它）' : '（标识用 kebab-case 小写英文，自己按描述取一个，例如 payment-reconcile-expert）'}。`,
          '2. 内容格式（标准 agents 角色定义）：',
        )
      }
      lines.push(
        '```',
        '---',
        `name: ${id || '<标识>'}`,
        'description: <一句话：他负责什么，什么时候该请他>',
        `displayName: ${displayName || '<中文短名，2-4 字，如「老陈」>'}`,
        'profession: <职业定位，如「支付对账专家」>',
        '---',
        '# <显示名> · <职业定位>',
        '<两三句话说清他的边界：做什么、不做什么>',
        '',
        '## 核心能力',
        '1. …（4-6 条，每条都是「能独立交付的具体事」，不要空话）',
        '',
        '## 工作流程',
        '1. …（5-8 步，他接到需求后的固定动作：先读什么、产出什么、怎么自检）',
        '',
        '## 输出规范',
        '1. …（3-5 条：交付时给什么、结构/字段/示例、必须附什么证据）',
        '',
        '## 注意事项',
        '1. …（3-5 条红线：不越界的地方、必须停下来报告的例外、常见坑）',
        '',
        '## 我的假设',
        '1. …（你替他做的假设，最多 5 条）',
        '```',
        '',
        '## 内部专业流程（照这个想，但不要把过程写进文件）',
        '1. **定位与边界**：他属于哪条链路（前端 / 后端 / 数据 / 测试 / 评审 / 交付…）、和相邻角色怎么分工；',
        '2. **能力清单**：从他擅长的技术栈与场景倒推 4-6 项可独立交付的能力；',
        '3. **工作流程**：按「读规范 → 理解需求 → 出方案 → 实现 → 自测 → 交付」的节奏，写成本项目里的固定动作；',
        '4. **输出规范**：交付物形态（代码 / 文档 / 单测 / 评审意见）与必须给出的证据；',
        '5. **红线与自检**：最容易出错的 3-5 个点，以及什么情况必须停下报告；',
        '6. **触发场景**：写清「什么时候该请他」，让调度的人一眼能判断。',
        '',
        '## 硬性要求',
        '- **不要反问用户、不要要求确认**：描述里没写到的细节，按专业判断补齐，把假设写在文件末尾的「## 我的假设」里（最多 5 条）；',
        '- 只写上面这几个文件，不要顺手改项目里其它文件；',
        '- 写完后用一句话报出**落盘的绝对路径**，不要贴整份文件内容。',
      )
      return lines.filter((line) => line !== '' || true).join('\n')
    }

    /**
     * 把一段话发进「当前对话」——也就是开启 agent 模式让它真跑起来。
     * 宿主给的能力是 sessions.binding(id).session.prompt(parts, 'queue')。
     * 拿不到会话 / 没有这个服务 / 被拒绝，一律返回 { ok:false, reason }，由调用方退化成复制。
     */
    async function promptCurrentSession(sessions, sessionId, text) {
      const id = String(sessionId ?? '').trim()
      if (!text) return { ok: false, reason: '没有要发送的内容' }
      if (!sessions || typeof sessions !== 'object') return { ok: false, reason: '这个宿主没提供「发消息」能力' }
      if (!id) return { ok: false, reason: '还没拿到当前对话（先在右侧对话里发一条消息，再回来点一次）' }
      let reference = null
      let binding = null
      try {
        if (typeof sessions.binding === 'function') binding = sessions.binding(id) ?? null
        if (!binding && typeof sessions.retain === 'function') {
          reference = sessions.retain(id, { source: 'gateway' })
          binding = (await reference?.ready) ?? null
        }
        const target = binding?.session ?? binding
        if (!target || typeof target.prompt !== 'function') return { ok: false, reason: '拿不到这个对话的句柄' }
        const result = await target.prompt([{ type: 'text', text }], 'queue')
        if (result && result.ok === false) {
          return { ok: false, reason: String(result.error?.message ?? result.error ?? '宿主拒绝了这次发送') }
        }
        return { ok: true }
      } catch (error) {
        return { ok: false, reason: String(error?.message ?? error) }
      } finally {
        try {
          reference?.release?.()
        } catch {
          /* 释放失败不影响结果 */
        }
      }
    }

    /**
     * 开场白：以某个专家/专家团的身份开始这轮对话时要说的第一句。
     * 「复制开场白」和对话输入框的「＋ 专家」都走这里，保证两处措辞一致。
     */
    function expertOpenerText(pick) {
      if (!pick) return ''
      if (pick.kind === 'team') return `请「${pick.name}」这个专家团帮我做事：先读角色定义文件，再按分工接手我的需求。`
      const name = pick.displayName || pick.name || pick.agentId || pick.id || ''
      const profession = pick.profession || name
      return `请以「${name} · ${profession}」的身份帮我继续；角色定义：${pick.path ?? ''}`
    }

    function buildInstruction(item, settings, skills, pick) {
      const lines = []
      const expertLines = expertInstructionLines(pick)
      if (expertLines.length) {
        lines.push(...expertLines)
        lines.push('')
      }
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

    /** 侧边栏宽度：默认 168，可拖到 120~380 之间。 */
    const RAIL_MIN = 120
    const RAIL_MAX = 380
    const RAIL_DEFAULT = 168
    function clampRailWidth(value) {
      const number = Number(value)
      if (!Number.isFinite(number) || number <= 0) return RAIL_DEFAULT
      return Math.min(RAIL_MAX, Math.max(RAIL_MIN, Math.round(number)))
    }

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
    function TableModule({ state, reloadState, uiWorkspace, table, view, saveView, runs, handOff, onUpdateRun, onOpenTable, onAddModule, expertData, reloadExperts }) {
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
      const [pendingWrite, setPendingWrite] = useState(null)

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

      // 详情弹窗 / 回写确认框打开时按 Esc 关闭（先关最上层的确认框）
      useEffect(() => {
        if ((!selectedId && !pendingWrite) || typeof document === 'undefined') return undefined
        const onKey = (event) => {
          if (event.key !== 'Escape') return
          if (pendingWrite) setPendingWrite(null)
          else setSelectedId('')
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [selectedId, pendingWrite])

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
      // 卡片上展示的字段：按配置（最多 4 个），没配置就给一份常用的。
      const cardFieldList = useMemo(() => {
        const configured = (view?.cardFields ?? []).filter(Boolean)
        if (configured.length) return configured.slice(0, 4)
        const names = (schemaFields ?? []).map((field) => field.name)
        const picked = ['状态', '负责人', '优先级', '期望完成时间'].filter((name) => names.includes(name))
        return picked.length ? picked : names.slice(0, 3)
      }, [view?.cardFields, schemaFields])
      const visibleModules = modules.filter((module) => !(view?.hiddenModules ?? []).includes(module.key))
      const progressFieldValue = progressField || view?.groupField || '状态'
      const progress = useMemo(() => summarizeBuckets(items, progressFieldValue), [items, progressFieldValue])
      const itemRuns = (runs ?? []).filter((run) => run.recordId && run.recordId === selectedId)
      const selectedRunBadge = selected ? runBadge(selected, runs) : null

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
        const text = instruction || buildInstruction(selected, settings, skills, resolveExpertPick(settings, expertData))
        setInstruction(text)
        setInstruction(text)
        try {
          await navigator.clipboard.writeText(text)
          setToast('开发指令已复制，粘贴到左侧 AI 对话即可开工；这次交付已记进「工作台执行记录」')
        } catch {
          setToast('剪贴板不可用，请手动全选复制下面的指令；这次交付已记进执行记录')
        }
        await handOff(selected, '已复制开发指令', tableKey)
      }

      /** 回写飞书一律先弹页面确认，确认后才真的写。 */
      const askWriteBack = (recordId, status, field, title) => {
        const type = (schemaFields ?? []).find((entry) => entry.name === field)?.type ?? ''
        setPendingWrite({ recordId, status, field: field || groupField, fieldType: type, title: title || '', kind: 'status' })
        setFailure(null)
      }

      const confirmWriteBack = async () => {
        const pending = pendingWrite
        if (!pending) return
        setPendingWrite(null)
        try {
          await api('/requirement/status', {
            method: 'POST',
            body: JSON.stringify({ recordId: pending.recordId, status: pending.status, field: pending.field, fieldType: pending.fieldType }),
          })
          setToast(`已把「${pending.field}」回写为「${pending.status}」`)
        } catch (error) {
          setFailure({ message: `回写飞书失败：${error.message}`, detail: error.payload?.detail, command: error.payload?.command || error.payload?.hint })
        }
      }

      const writeBack = async (status) => {
        if (!selected) return
        askWriteBack(selected.id, status, view?.groupField || '状态', selected.title)
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
        askWriteBack(item.id, targetKey, groupField, item.title)
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
                            ...module.items.map((item) => {
                              const badge = runBadge(item, runs)
                              return h(
                                'article',
                                {
                                  key: item.id || item.title,
                                  className: `rdw-kcard${item.id === selectedId ? ' is-selected' : ''}${drag?.type === 'card' && drag.id === item.id ? ' is-dragging' : ''}`,
                                  title: item.title,
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
                                badge
                                  ? h(
                                      'span',
                                      {
                                        className: `rdw-kcard-badge tone-${badge.tone}`,
                                        title: `${badge.label}｜执行记录 ${badge.count} 次｜${formatTime(badge.at)}${badge.note ? `｜${badge.note}` : ''}`,
                                      },
                                      h('b', null, badge.label),
                                      badge.count > 1 ? h('span', null, `×${badge.count}`) : null,
                                    )
                                  : null,
                                h('div', { className: 'rdw-item-title' }, item.title),
                                h(
                                  'div',
                                  { className: 'rdw-card-fields' },
                                  ...cardFieldList.map((field) =>
                                    h(
                                      'div',
                                      { key: field, className: 'rdw-card-field' },
                                      h('span', { className: 'rdw-card-field-label', title: field }, field),
                                      h('span', { className: 'rdw-card-field-value', title: cellText(item, field) || '—' }, cellText(item, field) || '—'),
                                    ),
                                  ),
                                ),
                              )
                            }),
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
                {
                  className: 'rdw-mask',
                  role: 'presentation',
                  onClick: () => setSelectedId(''),
                  onKeyDown: (event) => {
                    if (event.key === 'Escape') setSelectedId('')
                  },
                },
                h(
                  'div',
                  { className: 'rdw-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': `详情：${selected.title}`, onClick: (event) => event.stopPropagation() },
                  h(
                    'div',
                    { className: 'rdw-modal-head' },
                    h('strong', null, selected.title),
                    selected.status ? h(Chip, null, selected.status) : null,
                    selectedRunBadge
                      ? h('span', { className: `rdw-kcard-badge tone-${selectedRunBadge.tone}`, style: { position: 'static' } }, h('b', null, selectedRunBadge.label), selectedRunBadge.count > 1 ? h('span', null, `×${selectedRunBadge.count}`) : null)
                      : null,
                    h('span', { className: 'rdw-grow' }),
                    h('button', { className: 'rdw-btn', onClick: () => setSelectedId('') }, '关闭'),
                  ),
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
                    expertData,
                    reloadExperts,
                    saveSettings,
                    setToast,
                    onClose: () => setSelectedId(''),
                  }),
                ),
              )
            : null,
          pendingWrite
            ? h(
                'div',
                { className: 'rdw-mask', role: 'presentation', onClick: () => setPendingWrite(null) },
                h(
                  'div',
                  { className: 'rdw-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '确认回写飞书', style: { width: 'min(460px,92vw)' }, onClick: (event) => event.stopPropagation() },
                  h('div', { className: 'rdw-modal-head' }, h('strong', null, '确认回写飞书'), h('span', { className: 'rdw-grow' }), h('button', { className: 'rdw-btn', onClick: () => setPendingWrite(null) }, '取消')),
                  h('div', { className: 'rdw-note', style: { marginBottom: 8 } }, '这一步会真的改动飞书多维表格里的数据。'),
                  h('div', { className: 'rdw-field' }, h('span', { className: 'rdw-field-label' }, '记录'), h('span', { className: 'rdw-field-value' }, pendingWrite.title || pendingWrite.recordId)),
                  h('div', { className: 'rdw-field' }, h('span', { className: 'rdw-field-label' }, '字段'), h('span', { className: 'rdw-field-value' }, pendingWrite.field)),
                  h('div', { className: 'rdw-field' }, h('span', { className: 'rdw-field-label' }, '新值'), h('span', { className: 'rdw-field-value' }, pendingWrite.status)),
                  h('div', { className: 'rdw-toolbar', style: { marginTop: 12 } },
                    h('button', { className: 'rdw-btn is-primary', onClick: confirmWriteBack }, '确认写回飞书'),
                    h('button', { className: 'rdw-btn', onClick: () => setPendingWrite(null) }, '先不改'),
                  ),
                ),
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
          h('span', null, `卡片上展示哪些字段（已选 ${(draft.cardFields ?? []).length || '自动'}，最多 4 个）`),
          h(
            'div',
            { className: 'rdw-checks' },
            ...schema.map((field) =>
              h(
                'label',
                { key: field.name, className: 'rdw-checkrow' },
                h('input', {
                  type: 'checkbox',
                  checked: (draft.cardFields ?? []).includes(field.name),
                  onChange: () => {
                    const current = draft.cardFields ?? []
                    setDraft({
                      ...draft,
                      cardFields: current.includes(field.name) ? current.filter((name) => name !== field.name) : [...current, field.name],
                    })
                  },
                }),
                h('span', null, field.name),
              ),
            ),
          ),
          h('div', { className: 'rdw-note' }, '按勾选顺序展示（先勾的在前）；空着就自动显示：状态、负责人、优先级、期望完成时间。'),
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

    function DetailView({ item, settings, toast, instruction, copyInstruction, writeBack, chooseDirectory, onClose, runs, onUpdateRun, expertData, reloadExperts, saveSettings, setToast }) {
      if (!item) {
        return h('div', { className: 'rdw-empty' }, '选一条需求，这里会显示详情和「交给 AI 开发」的入口')
      }
      const statuses = ['待开发', '开发中', '已完成']
      const expertOptions = [
        ...(expertData?.experts ?? []).map((expert) => ({ value: `agent:${expert.agentId}`, label: `专家 · ${expert.displayName || expert.name}（${expert.profession || expert.name}）` })),
        ...(expertData?.teams ?? []).map((team) => ({ value: `team:${team.id}`, label: `专家团 · ${team.name}（${team.members.length} 人）` })),
      ]
      const expertPick = resolveExpertPick(settings, expertData)
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
        // 在「对话」里用哪个专家：这里选，指令开头就带上他的角色设定
        expertOptions.length
          ? h(
              'div',
              { style: { marginTop: 12 }, className: 'rdw-filterrow' },
              h('span', { className: 'rdw-note' }, '用哪个专家帮你看这条需求'),
              h(
                'select',
                {
                  className: 'rdw-input',
                  value: settings?.expert ?? '',
                  'aria-label': '选择专家或专家团',
                  onChange: async (event) => {
                    const value = event.target.value
                    await saveSettings({ expert: value })
                    if (reloadExperts) await reloadExperts()
                    if (setInstruction) setInstruction('')
                  },
                },
                h('option', { value: '' }, '不用专家（普通交付）'),
                ...expertOptions.map((option) => h('option', { key: option.value, value: option.value }, option.label)),
              ),
              expertPick
                ? h(
                    'button',
                    {
                      className: 'rdw-btn',
                      title: '复制这个专家/专家团的开场白，直接贴到左侧对话',
                      onClick: async () => {
                        const intro = expertOpenerText(expertPick)
                        try {
                          await navigator.clipboard.writeText(intro)
                          setToast && setToast('已复制开场白，粘到左侧对话即可以该专家身份开工')
                        } catch {
                          setToast && setToast('剪贴板不可用，复制失败')
                        }
                      },
                    },
                    '复制开场白',
                  )
                : null,
            )
          : null,
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

    /** 项目开发：把开发任务表的状态 + 工作台自己的 AI 执行记录合在一起看进度。 */
    function DevModule({ state, tables, runs, reloadRuns, onOpenTable, expertData }) {
      const [data, setData] = useState(null)
      const [loading, setLoading] = useState(false)
      const [failure, setFailure] = useState(null)
      const [toast, setToast] = useState('')
      const taskTable = (tables ?? []).find((table) => table.kind === 'task') ?? null

      const load = useCallback(async () => {
        if (!taskTable) return
        setLoading(true)
        setFailure(null)
        try {
          setData(await api(`/records?table=${encodeURIComponent(taskTable.key)}`))
        } catch (error) {
          setFailure({ message: error.message, detail: error.payload?.detail })
        } finally {
          setLoading(false)
        }
      }, [taskTable?.key])

      useEffect(() => {
        load()
      }, [load])

      const items = data?.items ?? []
      const statusField = data?.table?.fieldMap?.status || '状态'

      /** AI 进度口径：任务自己的状态分桶 + 每个任务的执行记录最新状态。 */
      const progress = useMemo(() => {
        const summary = summarizeBuckets(items, statusField)
        const buckets = summary?.buckets ?? []
        const rows = items.map((item) => ({ item, badge: runBadge(item, runs) }))
        const ai = { handed: 0, running: 0, done: 0, blocked: 0, none: 0 }
        for (const row of rows) {
          if (!row.badge) ai.none += 1
          else if (row.badge.tone === 'done') ai.done += 1
          else if (row.badge.tone === 'active') ai.running += 1
          else if (row.badge.tone === 'blocked') ai.blocked += 1
          else ai.handed += 1
        }
        // 一条任务算「已完成」：表里状态是完成态，或工作台记到 AI 已交付完成（同一条只算一次）
        const finished = rows.filter(({ item, badge }) => {
          if (badge?.tone === 'done') return true
          const value = String(item.fields?.[statusField] ?? item.status ?? '')
          return /完成|已交付|done|closed/i.test(value)
        }).length
        return { buckets, rows, ai, percent: items.length ? Math.min(100, Math.round((finished / items.length) * 100)) : 0, summary }
      }, [items, runs, statusField])

      const copyInstruction = async (item) => {
        const text = buildInstruction(item, state?.settings ?? {}, [], resolveExpertPick(state?.settings ?? {}, expertData))
        try {
          await navigator.clipboard.writeText(text)
          setToast(`已复制「${item.title}」的开发指令`)
        } catch {
          setToast('剪贴板不可用，复制失败')
        }
      }

      return h(
        'div',
        { className: 'rdw-body' },
        h(
          'div',
          { className: 'rdw-head' },
          h('h2', null, '项目开发'),
          h('span', { className: 'rdw-count' }, loading ? '读取中…' : `${items.length} 个开发任务 · 整体完成度 ${progress.percent}%`),
          h('span', { className: 'rdw-grow' }),
          h('button', { className: 'rdw-btn', onClick: () => { load(); reloadRuns && reloadRuns() } }, '刷新'),
          taskTable ? h('button', { className: 'rdw-btn', onClick: () => onOpenTable && onOpenTable(taskTable.key) }, '在任务表里看') : null,
        ),
        !taskTable
          ? h('div', { className: 'rdw-empty' }, '还没认到开发任务表（项目里要有 .dev-task-sources.json）。先在「设置」里选项目目录。')
          : failure
            ? h('div', { className: 'rdw-error' }, `${failure.message}${failure.detail ? `：${String(failure.detail).slice(0, 300)}` : ''}`)
            : h(
                'div',
                { className: 'rdw-scroll' },
                toast ? h('div', { className: 'rdw-note', style: { marginBottom: 8 } }, toast) : null,
                h(
                  'div',
                  { className: 'rdw-card' },
                  h(
                    'div',
                    { className: 'rdw-toolbar' },
                    h('strong', null, '任务进度'),
                    h('span', { className: 'rdw-grow' }),
                    h('span', { className: 'rdw-note' }, `按「${statusField}」统计`),
                  ),
                  h('div', { className: 'rdw-bar' }, h('i', { style: { width: `${progress.percent}%` } })),
                  h(
                    'div',
                    { className: 'rdw-checks', style: { marginTop: 8 } },
                    ...progress.buckets.map((bucket) => h('span', { key: bucket.value, className: 'rdw-chip' }, `${bucket.value} ${bucket.count}`)),
                    progress.buckets.length ? null : h('span', { className: 'rdw-note' }, '这张表里还没有可统计的状态'),
                  ),
                ),
                h(
                  'div',
                  { className: 'rdw-card', style: { marginTop: 10 } },
                  h(
                    'div',
                    { className: 'rdw-toolbar' },
                    h('strong', null, 'AI 开发进度'),
                    h('span', { className: 'rdw-grow' }),
                    h('span', { className: 'rdw-note' }, '来自工作台自己的执行记录（交付/进行中/已完成/受阻）'),
                  ),
                  h(
                    'div',
                    { className: 'rdw-checks' },
                    h('span', { className: 'rdw-chip' }, `已交付 ${progress.ai.handed}`),
                    h('span', { className: 'rdw-chip warn' }, `进行中 ${progress.ai.running}`),
                    h('span', { className: 'rdw-chip ok' }, `已完成 ${progress.ai.done}`),
                    h('span', { className: 'rdw-chip err' }, `受阻 ${progress.ai.blocked}`),
                    h('span', { className: 'rdw-chip' }, `还没交给 AI ${progress.ai.none}`),
                  ),
                ),
                h('div', { className: 'rdw-toolbar', style: { marginTop: 12 } }, h('strong', null, `任务清单（${items.length}）`)),
                items.length
                  ? h(
                      'div',
                      { className: 'rdw-devlist' },
                      ...progress.rows.map(({ item, badge }) =>
                        h(
                          'div',
                          { key: item.id || item.title, className: 'rdw-devrow', title: '点一下复制开发指令', onClick: () => copyInstruction(item) },
                          h('span', { className: 'rdw-devcell', style: { flex: '0 0 120px' } }, item.code || item.fields?.['任务编号'] || '-'),
                          h('span', { className: 'rdw-devcell', style: { flex: '1 1 auto' } }, item.title),
                          h('span', { className: 'rdw-devcell', style: { flex: '0 0 90px' } }, item.status || '-'),
                          h('span', { className: 'rdw-devcell', style: { flex: '0 0 150px' } }, item.module || item.owner || '-'),
                          h(
                            'span',
                            { className: 'rdw-devcell', style: { flex: '0 0 130px' } },
                            badge ? h('span', { className: `rdw-kcard-badge tone-${badge.tone}`, style: { position: 'static' } }, h('b', null, badge.label), badge.count > 1 ? h('span', null, `×${badge.count}`) : null) : h('span', { className: 'rdw-note' }, '未开始'),
                          ),
                          h('span', { className: 'rdw-devcell rdw-note', style: { flex: '0 0 110px' } }, badge ? formatTime(badge.at) : '-'),
                        ),
                      ),
                    )
                  : h('div', { className: 'rdw-empty' }, '开发任务表里还没有记录。把需求交付给 AI 后，这里会显示每个任务的状态和 AI 进度。'),
                h('div', { className: 'rdw-note', style: { marginTop: 8 } }, '点任意一行 = 复制这条任务的开发指令，直接贴给 AI。'),
                // 任务表为空时也让人看到 AI 到底动过什么：直接列工作台的执行记录
                h(
                  'div',
                  { className: 'rdw-card', style: { marginTop: 10 } },
                  h(
                    'div',
                    { className: 'rdw-toolbar' },
                    h('strong', null, `最近 AI 执行记录（${(runs ?? []).length}）`),
                    h('span', { className: 'rdw-grow' }),
                    h('span', { className: 'rdw-note' }, '交付/进行中/已完成/受阻都在这里'),
                  ),
                  (runs ?? []).length
                    ? h(
                        'div',
                        { className: 'rdw-devlist' },
                        ...[...runs]
                          .sort((left, right) => Number(right.at ?? 0) - Number(left.at ?? 0))
                          .slice(0, 10)
                          .map((run) =>
                            h(
                              'div',
                              { key: run.id ?? `${run.at}-${run.title}`, className: 'rdw-devrow' },
                              h('span', { className: 'rdw-devcell', style: { flex: '0 0 96px' } }, RUN_LABEL[run.status] ?? run.status ?? '-'),
                              h('span', { className: 'rdw-devcell', style: { flex: '1 1 auto' } }, String(run.title ?? '')),
                              h('span', { className: 'rdw-devcell rdw-note', style: { flex: '0 0 110px' } }, run.at ? formatTime(run.at) : '-'),
                            ),
                          ),
                      )
                    : h('div', { className: 'rdw-note' }, '还没有执行记录。在需求/任务里点「交付给 AI」后，这里会记下每次交付的进度。'),
                ),
              ),
      )
    }

    /**
     * 专家与专家团：参考 WorkBuddy 的模式 —— 专家 = 一份角色定义文件（agents/<id>.md），
     * 专家团 = 一个团长带若干专家；在这里选中哪个，交付指令就带上谁的角色设定。
     */
    function ExpertsModule({ state, reloadState, uiWorkspace, expertData, reloadExperts, service }) {
      const [data, setData] = useState(null)
      const [failure, setFailure] = useState(null)
      const [openFile, setOpenFile] = useState(null)
      const [content, setContent] = useState('')
      const [toast, setToast] = useState('')
      const [tab, setTab] = useState('')
      const [draft, setDraft] = useState({
        id: '',
        displayName: '',
        profession: '',
        description: '',
        abilities: '',
        flow: '',
        outputs: '',
        cautions: '',
        scope: 'harness',
        convention: '.claude',
      })
      const [teamDraft, setTeamDraft] = useState({ id: '', name: '', profession: '', description: '', lead: '', members: [], flow: '', scope: 'harness' })
      const [teamFailure, setTeamFailure] = useState(null)
      // 「AI 直接创建」（页面内完成）与「发到对话里做」共用的槽位，追加在末尾，别打乱已有序号。
      const [aiTab, setAiTab] = useState('')
      const [aiDraft, setAiDraft] = useState({ description: '', id: '', displayName: '', scope: 'harness' })
      const [aiNote, setAiNote] = useState('')
      const [aiPrompt, setAiPrompt] = useState('')
      const [aiBusy, setAiBusy] = useState(false)
      const [aiResult, setAiResult] = useState(null)
      const settings = state?.settings ?? {}
      const live = expertData ?? data

      const load = useCallback(async () => {
        setFailure(null)
        try {
          const next = await api('/experts')
          setData(next)
          return next
        } catch (error) {
          setFailure({ message: error.message })
          return null
        }
      }, [])

      useEffect(() => {
        load()
      }, [load, settings.projectDir])

      const refresh = async () => {
        await load()
        if (reloadExperts) await reloadExperts()
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

      const pick = async (value) => {
        await api('/settings', { method: 'POST', body: JSON.stringify({ expert: value }) })
        setToast(value ? '已选中：以后交付给 AI 会自动带上这个角色' : '已改为「不用专家」')
        if (reloadState) await reloadState()
        if (reloadExperts) await reloadExperts()
      }

      /** 打开「交给 AI 完善」面板（专家/专家团）。 */
      const openAi = (kind) => {
        setAiNote('')
        setAiPrompt('')
        setAiResult(null)
        setToast('')
        if (aiTab === kind) {
          setAiTab('')
          return
        }
        setTab('')
        setAiTab(kind)
        setAiDraft({ description: '', id: '', displayName: '', scope: aiDraft.scope || 'harness' })
      }

      /**
       * 首选路径：**在这个页面里直接创建**。
       * 工作台调宿主的 llm 服务把这句话完善成结构化草稿，自己按标准格式落盘 ——
       * 不经过右侧对话，也不需要复制任何提示词。
       */
      const aiCreateNow = async () => {
        const isTeam = aiTab === 'team'
        const description = String(aiDraft.description ?? '').trim()
        if (!description) {
          setAiNote('先用一句话说清你要谁（比如「一个盯支付对账的后端专家」），剩下的 AI 补齐。')
          return
        }
        setAiBusy(true)
        setAiResult(null)
        setAiNote('AI 正在按专业流程完善…（这个页面会直接出结果，不用管右侧对话）')
        try {
          const result = await api('/ai/create', {
            method: 'POST',
            body: JSON.stringify({
              kind: isTeam ? 'team' : 'expert',
              description,
              scope: aiDraft.scope,
              id: aiDraft.id,
              displayName: aiDraft.displayName,
            }),
          })
          setAiResult(result)
          setAiNote(`✓ 已创建：${result.name || result.id}`)
          if (refresh) await refresh()
        } catch (error) {
          setAiNote(`页面里直接创建没成功：${error.message}。可以用右边「发到对话里做」，或「我自己填（高级）」。`)
        } finally {
          setAiBusy(false)
        }
      }

      /**
       * 备选路径：把内置养成指令发进当前对话（agent 模式），由对话里的 AI 落盘。
       * 宿主没给「直接调模型」能力时用这条；发不出去再退回复制。
       */
      const aiCreate = async () => {
        const isTeam = aiTab === 'team'
        const description = String(aiDraft.description ?? '').trim()
        if (!description) {
          setAiNote('先用一句话说清你要谁（比如「一个盯支付对账的后端专家」），剩下的交给 AI 补齐。')
          return
        }
        const scope = aiDraft.scope === 'project' ? 'project' : 'harness'
        const dir = String((scope === 'project' ? live?.targets?.project?.dir : live?.targets?.harness?.dir) ?? '')
        const teamFile = String((live?.teamFiles ?? []).find((file) => file.scope === scope)?.path ?? '')
        const prompt = expertEnrichmentPrompt({
          mode: isTeam ? 'team' : 'expert',
          description,
          id: aiDraft.id,
          displayName: aiDraft.displayName,
          dir,
          teamFile,
          existingExperts: live?.experts ?? [],
        })
        setAiPrompt(prompt)
        setAiNote('正在把这份养成指令发进当前对话…')
        const session = await api('/composer/session').catch(() => ({}))
        const sent = await promptCurrentSession(service?.sessions, session?.sessionId, prompt)
        if (sent.ok) {
          setAiNote(`已开启 agent 模式：AI 正按专业流程完善这位${isTeam ? '专家团' : '专家'}并直接落盘，完成后点「重新扫描」就能选它。`)
          setAiTab('')
          setAiPrompt('')
          return
        }
        try {
          await navigator.clipboard.writeText(prompt)
          setAiNote(`没能自动发进对话（${sent.reason}），已把这份养成指令复制到剪贴板：粘到右侧对话发出去，AI 一样会按流程做完并落盘。`)
        } catch {
          setAiNote(`没能自动发进对话（${sent.reason}），剪贴板也不可用：下面这份指令可以手动复制到右侧对话。`)
        }
      }

      const createExpert = async () => {
        setToast('')
        setFailure(null)
        try {
          const result = await api('/expert/create', { method: 'POST', body: JSON.stringify({ ...draft, overwrite: false }) })
          setToast(`已创建专家「${result.id}」：${result.path}`)
          setDraft({ ...draft, id: '', displayName: '', profession: '', description: '', abilities: '', flow: '', outputs: '', cautions: '' })
          await refresh()
        } catch (error) {
          setFailure({ message: error.message })
        }
      }

      const createTeam = async () => {
        setTeamFailure(null)
        setToast('')
        try {
          const result = await api('/team/create', { method: 'POST', body: JSON.stringify({ ...teamDraft, lead: teamDraft.lead || teamDraft.members[0] || '' }) })
          setToast(`已创建专家团「${result.name ?? result.id}」：${result.path}`)
          setTeamDraft({ ...teamDraft, id: '', name: '', profession: '', description: '', lead: '', members: [], flow: '' })
          await refresh()
        } catch (error) {
          setTeamFailure({ message: error.message })
        }
      }

      const experts = live?.experts ?? []
      const teams = live?.teams ?? []
      const groups = useMemo(() => {
        const map = new Map()
        const label = { harness: 'DeepSeek Harness 通用专家（所有项目可用）', global: '全局专家（用户级）', project: '当前项目专家', custom: '自定义' }
        for (const expert of experts) {
          const key = label[expert.scope] ?? expert.scope
          if (!map.has(key)) map.set(key, [])
          map.get(key).push(expert)
        }
        return [...map.entries()]
      }, [experts])
      const toggleMember = (id) =>
        setTeamDraft((current) => ({ ...current, members: current.members.includes(id) ? current.members.filter((member) => member !== id) : [...current.members, id] }))

      return h(
        'div',
        { className: 'rdw-body' },
        h(
          'div',
          { className: 'rdw-head' },
          h('h2', null, '专家与专家团'),
          h('span', { className: 'rdw-count' }, `${experts.length} 位专家 · ${teams.length} 个专家团`),
          h('span', { className: 'rdw-grow' }),
          h('button', { className: `rdw-btn${aiTab === 'expert' || tab === 'expert' ? ' is-primary' : ''}`, onClick: () => openAi('expert') }, '＋ 新建专家'),
          h('button', { className: `rdw-btn${aiTab === 'team' || tab === 'team' ? ' is-primary' : ''}`, onClick: () => openAi('team') }, '＋ 新建专家团'),
          h('button', { className: 'rdw-btn', onClick: refresh }, '重新扫描'),
        ),
        h(
          'div',
          { className: 'rdw-card' },
          h('div', { className: 'rdw-toolbar' }, h('strong', null, '当前交付用哪个角色'), h('span', { className: 'rdw-grow' }), h('span', { className: 'rdw-note' }, '在「生成开发指令」和「复制开场白」里生效')),
          h(
            'div',
            { className: 'rdw-checks' },
            h('button', { className: `rdw-btn${!settings.expert ? ' is-primary' : ''}`, onClick: () => pick('') }, '不用专家（普通交付）'),
            ...experts.map((expert) => h('button', { key: `a-${expert.agentId}`, className: `rdw-btn${settings.expert === `agent:${expert.agentId}` ? ' is-primary' : ''}`, onClick: () => pick(`agent:${expert.agentId}`) }, `专家 · ${expert.displayName || expert.name}`)),
            ...teams.map((team) => h('button', { key: `t-${team.id}`, className: `rdw-btn${settings.expert === `team:${team.id}` ? ' is-primary' : ''}`, onClick: () => pick(`team:${team.id}`) }, `专家团 · ${team.name}`)),
          ),
          toast ? h('div', { className: 'rdw-note', style: { marginTop: 8 } }, toast) : null,
          failure ? h('div', { className: 'rdw-error' }, failure.message) : null,
        ),
        aiTab
          ? h(
              'div',
              { className: 'rdw-card rdw-config' },
              h(
                'div',
                { className: 'rdw-toolbar' },
                h('strong', null, aiTab === 'team' ? '新建专家团 · 交给 AI 完善' : '新建专家 · 交给 AI 完善'),
                h('span', { className: 'rdw-grow' }),
                h('span', { className: 'rdw-note' }, '你只说一句，细节由 AI 按专业流程补齐'),
              ),
              h('div', { className: 'rdw-note' }, '你想让这位' + (aiTab === 'team' ? '专家团' : '专家') + '干什么？（一句话就够，不用填技术字段）'),
              h('textarea', {
                className: 'rdw-input',
                style: { width: '100%', minHeight: 64, marginTop: 6 },
                value: aiDraft.description,
                placeholder: aiTab === 'team' ? '比如：要一个从需求分析→后端实现→代码评审一条龙交付的团队' : '比如：一个盯支付对账的后端专家，熟悉对账差异排查和批量修复',
                'aria-label': aiTab === 'team' ? '一句话描述你要的专家团' : '一句话描述你要的专家',
                onChange: (event) => setAiDraft({ ...aiDraft, description: event.target.value }),
              }),
              h(
                'div',
                { className: 'rdw-filterrow', style: { marginTop: 8 } },
                h('span', { className: 'rdw-note' }, '写到哪'),
                h(
                  'select',
                  { className: 'rdw-input', value: aiDraft.scope, 'aria-label': '专家写到哪', onChange: (event) => setAiDraft({ ...aiDraft, scope: event.target.value }) },
                  h('option', { value: 'harness' }, `通用（所有项目可用）：${live?.targets?.harness?.dir || '取不到 DSH_HOME'}`),
                  h('option', { value: 'project' }, `只放当前项目：${live?.targets?.project?.dir || '先选项目目录'}`),
                ),
              ),
              h(
                'div',
                { className: 'rdw-filterrow', style: { marginTop: 6 } },
                h('span', { className: 'rdw-note' }, '标识（可留空，AI 自己取）'),
                h('input', { className: 'rdw-input', value: aiDraft.id, placeholder: 'payment-reconcile-expert', 'aria-label': 'AI 专家标识', onChange: (event) => setAiDraft({ ...aiDraft, id: event.target.value }) }),
                aiTab === 'expert'
                  ? h('span', { className: 'rdw-note' }, '显示名（可留空）')
                  : null,
                aiTab === 'expert'
                  ? h('input', { className: 'rdw-input', value: aiDraft.displayName, placeholder: '老付', 'aria-label': 'AI 专家显示名', onChange: (event) => setAiDraft({ ...aiDraft, displayName: event.target.value }) })
                  : null,
              ),
              h(
                'div',
                { className: 'rdw-note', style: { marginTop: 8 } },
                aiTab === 'team'
                  ? `AI 会把专家团条目写进：${(live?.teamFiles ?? []).find((file) => file.scope === aiDraft.scope)?.path || '（取不到路径）'}，缺的成员专家也会一并补齐。`
                  : `AI 会把这位专家写成标准角色定义文件，落盘目录：${aiDraft.scope === 'project' ? live?.targets?.project?.dir || '（先选项目目录）' : live?.targets?.harness?.dir || '（取不到 DSH_HOME）'}`,
              ),
              h('div', { className: 'rdw-note', style: { marginTop: 4 } }, '它不会反问你，会自己按专业判断补齐细节，并把假设写在文件末尾的「我的假设」里。'),
              h(
                'div',
                { className: 'rdw-toolbar', style: { marginTop: 10 } },
                h('button', { className: 'rdw-btn is-primary', disabled: aiBusy ? true : undefined, onClick: aiCreateNow }, aiBusy ? 'AI 正在完善…' : 'AI 直接创建'),
                h('button', { className: 'rdw-btn', disabled: aiBusy ? true : undefined, onClick: aiCreate }, '发到对话里做'),
                h('button', { className: 'rdw-btn', onClick: () => { setAiTab(''); setTab(aiTab) } }, '我自己填（高级）'),
                h('button', { className: 'rdw-btn', onClick: () => setAiTab('') }, '取消'),
              ),
              h('div', { className: 'rdw-note', style: { marginTop: 4 } }, '「AI 直接创建」在这个页面里就完成（工作台自己调模型并落盘），不需要去外面复制任何提示词。'),
              aiNote ? h('div', { className: 'rdw-note', style: { marginTop: 8 } }, aiNote) : null,
              aiResult
                ? h(
                    'div',
                    { className: 'rdw-card', style: { marginTop: 8 } },
                    h(
                      'div',
                      { className: 'rdw-toolbar' },
                      h('strong', null, `✓ ${aiResult.kind === 'team' ? '专家团' : '专家'}已创建：${aiResult.name || aiResult.id}`),
                      h('span', { className: 'rdw-grow' }),
                      h(
                        'button',
                        { className: 'rdw-btn is-primary', onClick: () => pick(`${aiResult.kind === 'team' ? 'team' : 'agent'}:${aiResult.id}`) },
                        '选它开工',
                      ),
                      h('button', { className: 'rdw-btn', onClick: () => setAiTab('') }, '完成'),
                    ),
                    h('div', { className: 'rdw-note' }, `落盘：${aiResult.path}`),
                    aiResult.kind === 'team' ? h('div', { className: 'rdw-note' }, `成员 ${(aiResult.members ?? []).length} 位：${(aiResult.members ?? []).join('、')}`) : null,
                    h('div', { className: 'rdw-note' }, `模型：${aiResult.model || '默认'}${(aiResult.created ?? []).length > 1 ? ` · 这次共写入 ${aiResult.created.length} 个文件` : ''}`),
                    (aiResult.assumptions ?? []).length
                      ? h('div', { className: 'rdw-note' }, `AI 替他做的假设：${(aiResult.assumptions ?? []).join('；')}`)
                      : null,
                  )
                : null,
              aiPrompt ? h('textarea', { className: 'rdw-input', style: { width: '100%', minHeight: 120, marginTop: 6 }, value: aiPrompt, readOnly: true, 'aria-label': '养成指令（可手动复制）' }) : null,
            )
          : null,
        tab === 'expert'
          ? h(
              'div',
              { className: 'rdw-card rdw-config' },
              h('div', { className: 'rdw-toolbar' }, h('strong', null, '新建专家'), h('span', { className: 'rdw-note' }, draft.scope === 'harness' ? `写进 ${live?.targets?.harness?.dir || '（取不到 DSH_HOME）'}` : `写进 ${live?.targets?.project?.dir || '（先选项目目录）'}`)),
              h(
                'div',
                { className: 'rdw-filterrow' },
                h('span', { className: 'rdw-note' }, '标识（小写字母/数字/连字符）'),
                h('input', { className: 'rdw-input', value: draft.id, placeholder: 'java-backend-expert', 'aria-label': '专家标识', onChange: (event) => setDraft({ ...draft, id: event.target.value }) }),
                h('span', { className: 'rdw-note' }, '显示名'),
                h('input', { className: 'rdw-input', value: draft.displayName, placeholder: '老陈', 'aria-label': '专家显示名', onChange: (event) => setDraft({ ...draft, displayName: event.target.value }) }),
                h('span', { className: 'rdw-note' }, '职业/定位'),
                h('input', { className: 'rdw-input', value: draft.profession, placeholder: 'Java 后端开发专家', 'aria-label': '专家定位', onChange: (event) => setDraft({ ...draft, profession: event.target.value }) }),
                h(
                  'select',
                  { className: 'rdw-input', value: draft.scope, 'aria-label': '专家适用范围', onChange: (event) => setDraft({ ...draft, scope: event.target.value }) },
                  h('option', { value: 'harness' }, 'DeepSeek Harness 通用（所有项目可用）'),
                  h('option', { value: 'project' }, '只放当前项目'),
                ),
                draft.scope === 'project'
                  ? h(
                      'select',
                      { className: 'rdw-input', value: draft.convention, 'aria-label': '写到哪个约定目录', onChange: (event) => setDraft({ ...draft, convention: event.target.value }) },
                      h('option', { value: '.claude' }, '.claude/agents'),
                      h('option', { value: '.agents' }, '.agents/agents'),
                      h('option', { value: '.codex' }, '.codex/agents'),
                    )
                  : null,
              ),
              h(
                'div',
                { className: 'rdw-field' },
                h('span', null, '他擅长什么（AI 靠这句判断什么时候请他）'),
                h('input', { className: 'rdw-input', value: draft.description, placeholder: '负责后端需求理解、接口与表结构设计、代码实现与单测', 'aria-label': '专家描述', onChange: (event) => setDraft({ ...draft, description: event.target.value }) }),
              ),
              h(
                'div',
                { className: 'rdw-field' },
                h('span', null, '核心能力（一行一条）'),
                h('textarea', { className: 'rdw-textarea', rows: 3, value: draft.abilities, 'aria-label': '核心能力', onChange: (event) => setDraft({ ...draft, abilities: event.target.value }) }),
              ),
              h(
                'div',
                { className: 'rdw-field' },
                h('span', null, '工作流程（一行一步）'),
                h('textarea', { className: 'rdw-textarea', rows: 3, value: draft.flow, 'aria-label': '工作流程', onChange: (event) => setDraft({ ...draft, flow: event.target.value }) }),
              ),
              h(
                'div',
                { className: 'rdw-field' },
                h('span', null, '输出规范（一行一条）'),
                h('textarea', { className: 'rdw-textarea', rows: 2, value: draft.outputs, 'aria-label': '输出规范', onChange: (event) => setDraft({ ...draft, outputs: event.target.value }) }),
              ),
              h(
                'div',
                { className: 'rdw-field' },
                h('span', null, '注意事项 / 红线（一行一条）'),
                h('textarea', { className: 'rdw-textarea', rows: 2, value: draft.cautions, 'aria-label': '专家注意事项', onChange: (event) => setDraft({ ...draft, cautions: event.target.value }) }),
              ),
              h('div', { className: 'rdw-toolbar' }, h('button', { className: 'rdw-btn is-primary', onClick: createExpert }, '创建专家'), h('button', { className: 'rdw-btn', onClick: () => setTab('') }, '取消')),
            )
          : null,
        tab === 'team'
          ? h(
              'div',
              { className: 'rdw-card rdw-config' },
              h('div', { className: 'rdw-toolbar' }, h('strong', null, '新建专家团'), h('span', { className: 'rdw-note' }, '一个团长带几名专家，交付时按分工接力')),
              h(
                'div',
                { className: 'rdw-filterrow' },
                h('span', { className: 'rdw-note' }, '标识'),
                h('input', { className: 'rdw-input', value: teamDraft.id, placeholder: 'hr-delivery-team', 'aria-label': '专家团标识', onChange: (event) => setTeamDraft({ ...teamDraft, id: event.target.value }) }),
                h('span', { className: 'rdw-note' }, '名称'),
                h('input', { className: 'rdw-input', value: teamDraft.name, placeholder: 'HR 交付专家团', 'aria-label': '专家团名称', onChange: (event) => setTeamDraft({ ...teamDraft, name: event.target.value }) }),
                h('span', { className: 'rdw-note' }, '定位'),
                h('input', { className: 'rdw-input', value: teamDraft.profession, placeholder: '需求→架构→实现→评审一条龙', 'aria-label': '专家团定位', onChange: (event) => setTeamDraft({ ...teamDraft, profession: event.target.value }) }),
                h(
                  'select',
                  { className: 'rdw-input', value: teamDraft.scope, 'aria-label': '专家团适用范围', onChange: (event) => setTeamDraft({ ...teamDraft, scope: event.target.value }) },
                  h('option', { value: 'harness' }, '通用专家团'),
                  h('option', { value: 'project' }, '只放当前项目'),
                ),
              ),
              h('div', { className: 'rdw-field' }, h('span', null, '说明'), h('input', { className: 'rdw-input', value: teamDraft.description, 'aria-label': '专家团说明', onChange: (event) => setTeamDraft({ ...teamDraft, description: event.target.value }) })),
              h(
                'div',
                { className: 'rdw-field' },
                h('span', null, `选成员（已选 ${teamDraft.members.length} 人，第一位或点选团长）`),
                h(
                  'div',
                  { className: 'rdw-checks' },
                  ...experts.map((expert) => h('button', { key: expert.path, className: `rdw-btn${teamDraft.members.includes(expert.agentId) ? ' is-primary' : ''}`, onClick: () => toggleMember(expert.agentId) }, `${expert.displayName || expert.name}（${expert.profession || expert.agentId}）`)),
                  experts.length ? null : h('span', { className: 'rdw-note' }, '还没有专家，先新建一位专家再来组团'),
                ),
              ),
              h(
                'div',
                { className: 'rdw-filterrow' },
                h('span', { className: 'rdw-note' }, '团长'),
                h(
                  'select',
                  { className: 'rdw-input', value: teamDraft.lead, 'aria-label': '团长', onChange: (event) => setTeamDraft({ ...teamDraft, lead: event.target.value }) },
                  h('option', { value: '' }, '默认第一位'),
                  ...teamDraft.members.map((member) => h('option', { key: member, value: member }, member)),
                ),
              ),
              h('div', { className: 'rdw-field' }, h('span', null, '协作流程（一行一步）'), h('textarea', { className: 'rdw-textarea', rows: 4, value: teamDraft.flow, 'aria-label': '协作流程', onChange: (event) => setTeamDraft({ ...teamDraft, flow: event.target.value }) })),
              teamFailure ? h('div', { className: 'rdw-error' }, teamFailure.message) : null,
              h('div', { className: 'rdw-toolbar' }, h('button', { className: 'rdw-btn is-primary', onClick: createTeam }, '创建专家团'), h('button', { className: 'rdw-btn', onClick: () => setTab('') }, '取消')),
            )
          : null,
        h(
          'div',
          { className: 'rdw-split' },
          h(
            'div',
            { className: 'rdw-col rdw-col-list' },
            h(
              'div',
              { className: 'rdw-scroll' },
              groups.map(([group, entries]) =>
                h(
                  'div',
                  { key: group, style: { marginBottom: 12 } },
                  h('div', { className: 'rdw-note', style: { marginBottom: 4 } }, `${group}（${entries.length}）`),
                  ...entries.map((expert) =>
                    h(
                      'button',
                      { key: expert.path, className: 'rdw-item', 'aria-current': settings.expert === `agent:${expert.agentId}` ? 'true' : 'false', style: { marginBottom: 6 }, onClick: () => open(expert) },
                      h('span', { className: 'rdw-item-title' }, `${expert.displayName || expert.name} · ${expert.profession || expert.agentId}`),
                      h('span', { className: 'rdw-note' }, expert.description),
                      (expert.alsoIn ?? []).length
                        ? h('span', { className: 'rdw-note' }, `同名还在：${(expert.alsoIn ?? []).join('、')}`)
                        : null,
                    ),
                  ),
                ),
              ),
              teams.length
                ? h(
                    'div',
                    null,
                    h('div', { className: 'rdw-note', style: { marginBottom: 4 } }, `专家团（${teams.length}）`),
                    ...teams.map((team) =>
                      h(
                        'button',
                        { key: team.id, className: 'rdw-item', 'aria-current': settings.expert === `team:${team.id}` ? 'true' : 'false', style: { marginBottom: 6 }, onClick: () => pick(`team:${team.id}`) },
                        h('span', { className: 'rdw-item-title' }, team.name),
                        h('span', { className: 'rdw-note' }, `${team.profession || ''}${team.profession ? ' · ' : ''}${team.members.length} 人：${team.members.join('、')}`),
                      ),
                    ),
                  )
                : null,
              experts.length || teams.length ? null : h('div', { className: 'rdw-empty' }, '还没有专家。点「＋ 新建专家」写一位（写进 agents/<id>.md，Claude/Codex/DSH 这些工具也能读到）。'),
            ),
          ),
          h(
            'div',
            { className: 'rdw-col rdw-col-detail' },
            h(
              'div',
              { className: 'rdw-scroll' },
              openFile ? h('div', null, h('div', { className: 'rdw-note', style: { marginBottom: 8 } }, openFile.path), h('pre', { className: 'rdw-pre' }, content)) : h('div', { className: 'rdw-empty' }, '点左边一位专家，这里看他的角色定义；点专家团名 = 直接选中它'),
            ),
          ),
        ),
      )
    }

    function SkillsModule({ state, reloadState, uiWorkspace }) {
      const [data, setData] = useState(null)
      const [failure, setFailure] = useState(null)
      const [openFile, setOpenFile] = useState(null)
      const [content, setContent] = useState('')
      const [loading, setLoading] = useState(false)
      const [scopeFilter, setScopeFilter] = useState('all')
      const [convFilter, setConvFilter] = useState('all')
      const [kindFilter, setKindFilter] = useState('all')
      const [query, setQuery] = useState('')
      const [creating, setCreating] = useState(false)
      const [draft, setDraft] = useState({ name: '', description: '', whenToUse: '', steps: '', notes: '', scope: 'harness' })
      const [createResult, setCreateResult] = useState(null)
      const [collapsedGroups, setCollapsedGroups] = useState([])
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

      /** 范围 / 目录约定 / 类型 / 关键词，四层筛选，任意可叠加。 */
      const filtered = useMemo(() => {
        const keyword = query.trim().toLowerCase()
        return (data?.items ?? []).filter((item) => {
          if (scopeFilter !== 'all' && item.scope !== scopeFilter) return false
          if (convFilter !== 'all' && item.convention !== convFilter) return false
          if (kindFilter !== 'all' && item.kind !== kindFilter) return false
          if (!keyword) return true
          return `${item.name} ${item.description} ${item.group} ${item.dirName}`.toLowerCase().includes(keyword)
        })
      }, [data, scopeFilter, convFilter, kindFilter, query])

      const scopes = data?.summary ?? []
      const scopeCount = (scope) => scopes.find((entry) => entry.scope === scope)
      const conventions = useMemo(() => {
        const seen = []
        for (const root of data?.roots ?? []) if (root.convention && !seen.includes(root.convention)) seen.push(root.convention)
        return seen
      }, [data])

      const groups = useMemo(() => {
        const map = new Map()
        for (const item of filtered) {
          if (!map.has(item.group)) map.set(item.group, [])
          map.get(item.group).push(item)
        }
        return [...map.entries()]
      }, [filtered])

      const isCollapsed = (group) => collapsedGroups.includes(group)
      const toggleGroup = (group) =>
        setCollapsedGroups((current) => (current.includes(group) ? current.filter((entry) => entry !== group) : [...current, group]))
      const allGroups = groups.map(([group]) => group)
      const allCollapsed = allGroups.length > 0 && allGroups.every((group) => collapsedGroups.includes(group))
      const setAllCollapsed = (collapse) => setCollapsedGroups(collapse ? allGroups : [])

      const showDocs = (kindFilter === 'all' || kindFilter === 'doc') && !!data?.docs?.length

      const submitSkill = async () => {
        setCreateResult({ pending: true })
        try {
          const result = await api('/skills/create', { method: 'POST', body: JSON.stringify(draft) })
          setCreateResult({ ok: true, message: `已创建「${result.name}」（${result.scope === 'project' ? '当前项目' : 'DeepSeek Harness 通用'}）：${result.path}` })
          await load()
          await open({ path: result.path, name: result.name })
        } catch (error) {
          setCreateResult({ ok: false, message: `${error.message}${error.payload?.path ? `（${error.payload.path}）` : ''}` })
        }
      }

      return h(
        'div',
        { className: 'rdw-body' },
        h(
          'div',
          { className: 'rdw-head' },
          h('h2', null, '技能与规范'),
          h('span', { className: 'rdw-count' }, loading ? '扫描中…' : `${filtered.length}/${data?.items?.length ?? 0} 个技能 · ${data?.docs?.length ?? 0} 份规范`),
          h('span', { className: 'rdw-grow' }),
          h('button', { className: 'rdw-btn', onClick: () => setCreating(!creating) }, creating ? '收起新建' : '＋ 新建技能'),
          h('button', { className: 'rdw-btn', onClick: chooseDirectory }, '选择项目目录'),
          h('button', { className: 'rdw-btn', onClick: load }, '重新扫描'),
        ),
        h(
          'div',
          { className: 'rdw-toolbar' },
          ...[
            { key: 'all', label: '全部' },
            { key: 'harness', label: 'DeepSeek Harness' },
            { key: 'global', label: '全局' },
            { key: 'project', label: '项目' },
            { key: 'custom', label: '自定义' },
          ].map((entry) => {
            const bucket = scopeCount(entry.key)
            const count = entry.key === 'all' ? data?.items?.length ?? 0 : (bucket?.skills ?? 0) + (bucket?.agents ?? 0)
            return h(
              'button',
              {
                key: entry.key,
                className: `rdw-btn${scopeFilter === entry.key ? ' is-primary' : ''}`,
                onClick: () => setScopeFilter(entry.key),
              },
              `${entry.label}（${count}）`,
            )
          }),
          h(
            'select',
            { className: 'rdw-input', value: convFilter, onChange: (event) => setConvFilter(event.target.value), 'aria-label': '按目录约定筛选' },
            h('option', { value: 'all' }, '所有目录约定'),
            ...conventions.map((convention) => h('option', { key: convention, value: convention }, convention)),
          ),
          h(
            'select',
            { className: 'rdw-input', value: kindFilter, onChange: (event) => setKindFilter(event.target.value), 'aria-label': '按类型筛选' },
            h('option', { value: 'all' }, '技能 + 角色'),
            h('option', { value: 'skill' }, '只看技能'),
            h('option', { value: 'agent' }, '只看角色/规范'),
            h('option', { value: 'doc' }, '只看项目规范文档'),
          ),
          h('input', {
            className: 'rdw-input',
            placeholder: '搜技能名 / 描述',
            value: query,
            'aria-label': '搜索技能',
            onChange: (event) => setQuery(event.target.value),
          }),
          h('button', { className: 'rdw-btn', onClick: () => setAllCollapsed(!allCollapsed), title: '把所有来源分组一起收起或展开' }, allCollapsed ? '全部展开' : '全部收起'),
        ),
        creating
          ? h(
              'div',
              { className: 'rdw-card rdw-config' },
              h(
                'div',
                { className: 'rdw-toolbar' },
                h('strong', null, '新建技能'),
                h('span', { className: 'rdw-note' }, draft.scope === 'harness' ? `写入 DeepSeek Harness 通用技能目录：${data?.harnessSkillDir || '（取不到 DSH_HOME）'}` : '写入当前项目的 .claude/skills'),
              ),
              h(
                'div',
                { className: 'rdw-filterrow' },
                h('span', { className: 'rdw-note' }, '技能名称（小写字母 / 数字 / 连字符）'),
                h('input', { className: 'rdw-input', value: draft.name, placeholder: 'java-code-review', 'aria-label': '技能名称', onChange: (event) => setDraft({ ...draft, name: event.target.value }) }),
                h(
                  'select',
                  { className: 'rdw-input', value: draft.scope, 'aria-label': '技能适用范围', onChange: (event) => setDraft({ ...draft, scope: event.target.value }) },
                  h('option', { value: 'harness' }, 'DeepSeek Harness 通用（所有项目可用）'),
                  h('option', { value: 'project' }, '只放当前项目'),
                ),
              ),
              h(
                'div',
                { className: 'rdw-field' },
                h('span', null, '一句话描述（AI 靠它决定什么时候用）'),
                h('input', { className: 'rdw-input', value: draft.description, placeholder: '评审 Java 代码改动，先看 diff 再看测试', 'aria-label': '技能描述', onChange: (event) => setDraft({ ...draft, description: event.target.value }) }),
              ),
              h(
                'div',
                { className: 'rdw-field' },
                h('span', null, '什么时候用（可空，默认用上面的描述）'),
                h('textarea', { className: 'rdw-textarea', rows: 2, value: draft.whenToUse, 'aria-label': '使用场景', onChange: (event) => setDraft({ ...draft, whenToUse: event.target.value }) }),
              ),
              h(
                'div',
                { className: 'rdw-field' },
                h('span', null, '怎么做（一行一步）'),
                h('textarea', { className: 'rdw-textarea', rows: 4, value: draft.steps, 'aria-label': '步骤', onChange: (event) => setDraft({ ...draft, steps: event.target.value }) }),
              ),
              h(
                'div',
                { className: 'rdw-field' },
                h('span', null, '注意 / 红线（一行一条）'),
                h('textarea', { className: 'rdw-textarea', rows: 3, value: draft.notes, 'aria-label': '注意事项', onChange: (event) => setDraft({ ...draft, notes: event.target.value }) }),
              ),
              h(
                'div',
                { className: 'rdw-toolbar' },
                h('button', { className: 'rdw-btn is-primary', onClick: submitSkill }, createResult?.pending ? '创建中…' : '创建技能'),
                h('button', { className: 'rdw-btn', onClick: () => setCreating(false) }, '取消'),
                createResult?.message ? h('span', { className: createResult.ok ? 'rdw-note' : 'rdw-error' }, createResult.message) : null,
              ),
            )
          : null,
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
                { className: 'rdw-note', style: { marginBottom: 8 } },
                `来源：DeepSeek Harness 通用 + 全局（用户级）+ 项目（${settings.projectDir || '未选择项目'}）`,
              ),
              failure ? h('div', { className: 'rdw-error' }, failure.message) : null,
              h(
                'div',
                { className: 'rdw-checks', style: { marginBottom: 8 } },
                ...(data?.roots ?? []).map((root) =>
                  h(
                    'span',
                    { key: root.path, className: `rdw-chip${root.exists ? ' ok' : ''}`, title: root.path },
                    `${root.exists ? '✓' : '×'} ${root.label}${root.scope === 'harness' ? '' : ''}`,
                  ),
                ),
              ),
              groups.map(([group, entries]) =>
                h(
                  'div',
                  { key: group, style: { marginBottom: 12 } },
                  h(
                    'button',
                    {
                      className: `rdw-group${isCollapsed(group) ? ' is-collapsed' : ''}`,
                      'aria-expanded': isCollapsed(group) ? 'false' : 'true',
                      title: isCollapsed(group) ? '展开这一组' : '收起这一组',
                      onClick: () => toggleGroup(group),
                    },
                    h('span', { className: 'rdw-group-caret', 'aria-hidden': 'true' }, isCollapsed(group) ? '▸' : '▾'),
                    h('span', { className: 'rdw-group-title' }, group),
                    h('span', { className: 'rdw-group-count' }, `${entries.length}`),
                  ),
                  isCollapsed(group)
                    ? null
                    : entries.map((entry) =>
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
              showDocs
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
              !loading && !filtered.length && !showDocs
                ? h('div', { className: 'rdw-empty' }, '这个筛选下没有技能。换个范围，或点「＋ 新建技能」给自己攒一个。')
                : null,
            ),
          ),
          h(
            'div',
            { className: 'rdw-col rdw-col-detail' },
            h(
              'div',
              { className: 'rdw-scroll' },
              openFile ? h('div', null, h('div', { className: 'rdw-note', style: { marginBottom: 8 } }, openFile.path), h('pre', { className: 'rdw-pre' }, content)) : h('div', { className: 'rdw-empty' }, '从左边选一个技能或规范文档，这里显示正文'),
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
        h('div', { className: 'rdw-note', style: { marginBottom: 6 } }, '改模块名称：点左侧模块旁的 ✎，或直接双击模块名；回车保存、Esc 取消。侧边栏宽度拖右边缘即可调整（双击拖拽条恢复默认）。'),
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
      const [expertData, setExpertData] = useState(null)
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

      const reloadExperts = useCallback(async () => {
        try {
          setExpertData(await api('/experts'))
        } catch {
          setExpertData(null)
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

      /** 侧边栏宽度：拖动即时生效，松手才写盘（写进 view.json，全局一份）。 */
      const [railWidth, setRailWidth] = useState(() => clampRailWidth(view?.railWidth))
      const [railDragging, setRailDragging] = useState(false)
      useEffect(() => {
        if (typeof view?.railWidth === 'number') setRailWidth(clampRailWidth(view.railWidth))
      }, [view?.railWidth])

      const startRailDrag = useCallback(
        (event) => {
          if (typeof document === 'undefined') return
          event.preventDefault()
          const startX = event.clientX
          const startWidth = railWidth
          let latest = startWidth
          const onMove = (moveEvent) => {
            latest = clampRailWidth(startWidth + (moveEvent.clientX - startX))
            setRailWidth(latest)
          }
          const onUp = () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            document.body.classList.remove('rdw-rail-resizing')
            setRailDragging(false)
            if (latest !== startWidth) saveViewPatch({ railWidth: latest })
          }
          document.body.classList.add('rdw-rail-resizing')
          setRailDragging(true)
          document.addEventListener('mousemove', onMove)
          document.addEventListener('mouseup', onUp)
        },
        [railWidth, saveViewPatch],
      )

      /** 改模块名字：留空就当没改。 */
      const [renamingId, setRenamingId] = useState('')
      const [renameDraft, setRenameDraft] = useState('')
      const renameModule = useCallback(
        async (key, title) => {
          const trimmed = String(title ?? '').trim()
          setRenamingId('')
          if (!trimmed) return
          const current = view?.modules?.length ? view.modules : defaultModules(tables)
          const next = current.map((module) => (module.key === key ? { ...module, title: trimmed } : module))
          await saveViewPatch({ modules: next })
        },
        [view, tables, saveViewPatch],
      )

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
        reloadExperts()
      }, [reloadState, reloadTables, reloadView, reloadRuns, reloadExperts])

      useEffect(() => {
        if (active === 'overview') loadOverview(false)
      }, [active, loadOverview])

      const railModules = useMemo(() => {
        const list = [
          { kind: 'overview', id: 'overview', glyph: '📊', label: '总览' },
          { kind: 'dev', id: 'dev', glyph: '🛠', label: '项目开发' },
          { kind: 'experts', id: 'experts', glyph: '🎓', label: '专家与专家团' },
        ]
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
              {
                className: 'rdw-rail',
                'aria-label': '工作台模块',
                style: narrow ? undefined : { flex: `0 0 ${railWidth}px`, width: `${railWidth}px` },
              },
              h('div', { className: 'rdw-rail-title' }, '需求开发工作台'),
              ...railModules.map((entry) =>
                h(
                  'div',
                  { key: entry.id, className: 'rdw-mod-row' },
                  renamingId === entry.id
                    ? h('input', {
                        className: 'rdw-mod-rename',
                        autoFocus: true,
                        value: renameDraft,
                        'aria-label': `模块名称：${entry.label}`,
                        onChange: (event) => setRenameDraft(event.target.value),
                        onKeyDown: (event) => {
                          if (event.key === 'Enter') renameModule(entry.id, renameDraft)
                          if (event.key === 'Escape') {
                            setRenamingId('')
                            setRenameDraft('')
                          }
                        },
                        onBlur: () => renameModule(entry.id, renameDraft),
                      })
                    : h(
                        'button',
                        {
                          className: 'rdw-mod',
                          'aria-current': activeEntry?.id === entry.id ? 'true' : 'false',
                          title: entry.label,
                          onClick: () => {
                            setActive(entry.id)
                            setShowAdd(false)
                          },
                          onDoubleClick: () => {
                            if (entry.kind !== 'table') return
                            setRenamingId(entry.id)
                            setRenameDraft(entry.label)
                          },
                        },
                        h('span', { className: 'rdw-mod-glyph', 'aria-hidden': 'true' }, entry.glyph),
                        h('span', { className: 'rdw-mod-label' }, entry.label),
                      ),
                  entry.kind === 'table' && renamingId !== entry.id
                    ? h(
                        'button',
                        {
                          className: 'rdw-mod-edit',
                          title: `改模块名称：${entry.label}`,
                          'aria-label': `改模块名称：${entry.label}`,
                          onClick: (event) => {
                            event.stopPropagation()
                            setRenamingId(entry.id)
                            setRenameDraft(entry.label)
                          },
                        },
                        '✎',
                      )
                    : null,
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
            narrow
              ? null
              : h('div', {
                  className: `rdw-rail-resizer${railDragging ? ' is-active' : ''}`,
                  role: 'separator',
                  'aria-label': '拖动调整模块侧边栏宽度',
                  'aria-orientation': 'vertical',
                  title: '拖动调整侧边栏宽度（双击恢复默认）',
                  onMouseDown: startRailDrag,
                  onDoubleClick: () => {
                    setRailWidth(clampRailWidth(0))
                    saveViewPatch({ railWidth: clampRailWidth(0) })
                  },
                }),
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
                  : activeEntry?.kind === 'dev'
                    ? h(DevModule, { state, tables, runs, reloadRuns, onOpenTable: openTable, expertData })
                    : activeEntry?.kind === 'experts'
                      ? h(ExpertsModule, { state, reloadState, uiWorkspace, expertData, reloadExperts, service })
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
                        expertData,
                        reloadExperts,
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

    /* --------------------------------------------------- 对话输入框里的「＋ 专家」 */

    /**
     * 挂在宿主对话输入框「＋」那一排的入口（slot: conversation.input.left）。
     *
     * 专家/专家团是给「在 DeepSeek Harness 上干活」用的：选一个专家，就是把这轮对话交给
     * 他来理解需求、拆任务、写实现。所以入口放在输入框旁边 —— 选完直接把该专家的开场白
     * 写进输入框（宿主通过 slot 的标准 props 提供 inputActions.insertText，可撤销）；
     * 编辑器拒绝插入时退回复制，绝不吞掉结果。
     *
     * 这里的 ctx.slots 用嵌套 inject + try/catch 拿：宿主没提供 slots 时工作台本体照常可用。
     */
    function ExpertComposerEntry(props) {
      const [open, setOpen] = useState(false)
      const [data, setData] = useState(null)
      const [failure, setFailure] = useState('')
      const [status, setStatus] = useState('')
      const rootRef = useRef(null)
      const inputActions = props?.inputActions
      const sessionId = props?.sessionId

      /**
       * 把「我在哪个会话」上报给工作台本体：宿主的 slot 标准 props 带 sessionId，
       * 而「交给 AI 完善并创建」要把养成指令发进当前对话，就得知道会话是谁。
       * 上报失败无所谓，只是退回「复制指令」那条路。
       */
      const reportSession = () => {
        if (!sessionId) return
        api('/composer/session', { method: 'POST', body: JSON.stringify({ sessionId: String(sessionId) }) }).catch(() => {})
      }

      useEffect(() => {
        reportSession()
        return undefined
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [sessionId])

      // 点别处 / 按 Esc 收起面板
      useEffect(() => {
        if (!open || typeof document === 'undefined') return undefined
        const onDown = (event) => {
          if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
        }
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('mousedown', onDown)
          document.removeEventListener('keydown', onKey)
        }
      }, [open])

      const load = async () => {
        setStatus('')
        reportSession()
        if (data) return data
        try {
          const next = await api('/experts')
          setData(next)
          return next
        } catch (error) {
          setFailure(`读到专家列表失败：${error.message}`)
          return null
        }
      }

      const toggle = async () => {
        if (open) {
          setOpen(false)
          return
        }
        setFailure('')
        setOpen(true)
        await load()
      }

      /** 选中一个角色：记进工作台设置，并把开场白送进输入框。 */
      const use = async (pick, value) => {
        setFailure('')
        const text = expertOpenerText(pick)
        const label = pick.displayName || pick.name || pick.agentId || '专家'
        try {
          await api('/settings', { method: 'POST', body: JSON.stringify({ expert: value }) })
        } catch (error) {
          setFailure(`记下这个选择失败：${error.message}`)
        }
        let inserted = false
        if (text && inputActions && typeof inputActions.insertText === 'function' && typeof inputActions.captureInsertion === 'function') {
          try {
            inserted = Boolean(inputActions.insertText(text, inputActions.captureInsertion()))
          } catch {
            inserted = false
          }
        }
        if (inserted) {
          setStatus(`已把《${label}》的开场白写进输入框，接着补一句你的需求就能开工`)
          setOpen(false)
          await load()
          return
        }
        // 编辑器没接住（或宿主没给 inputActions）：退回复制，结果不丢。
        try {
          await navigator.clipboard.writeText(text)
          setStatus(`编辑器没接住，已复制《${label}》的开场白，粘贴进输入框即可`)
        } catch {
          setStatus(`编辑器没接住，剪贴板也不可用，请手动复制：${text}`)
        }
        setOpen(false)
        await load()
      }

      const selected = String((data?.selected ?? '') || '')
      const experts = data?.experts ?? []
      const teams = data?.teams ?? []
      const current = selected
        ? selected.startsWith('team:')
          ? teams.find((entry) => `team:${entry.id}` === selected)
          : experts.find((entry) => `agent:${entry.agentId}` === selected)
        : null
      const buttonLabel = current ? `＋ 专家 · ${current.displayName || current.name || current.id}` : '＋ 专家'

      return h(
        'div',
        { className: 'rdw-expert-entry', ref: rootRef },
        h(
          'button',
          {
            type: 'button',
            className: 'rdw-expert-entry-btn',
            'aria-expanded': open ? 'true' : 'false',
            'aria-label': '引入专家或专家团',
            title: '从需求开发工作台引入一位专家 / 一个专家团，把这轮对话交给他',
            onClick: toggle,
          },
          buttonLabel,
        ),
        open
          ? h(
              'div',
              { className: 'rdw-expert-pop', role: 'dialog', 'aria-label': '选择专家或专家团' },
              h('div', { className: 'rdw-expert-pop-head' }, '这轮对话交给谁？'),
              h(
                'div',
                { className: 'rdw-expert-pop-body' },
                h(
                  'button',
                  { type: 'button', className: `rdw-expert-option${selected ? '' : ' is-current'}`, onClick: () => use(null, '') },
                  h('span', { className: 'rdw-expert-option-title' }, '不用专家（普通交付）'),
                  h('span', { className: 'rdw-expert-option-note' }, '按工作台默认的开发指令来'),
                ),
                experts.length
                  ? h('div', { className: 'rdw-expert-pop-group' }, `专家（${experts.length}）`)
                  : null,
                ...experts.map((expert) =>
                  h(
                    'button',
                    {
                      key: `a-${expert.agentId}`,
                      type: 'button',
                      className: `rdw-expert-option${selected === `agent:${expert.agentId}` ? ' is-current' : ''}`,
                      onClick: () => use({ ...expert, kind: 'expert' }, `agent:${expert.agentId}`),
                    },
                    h('span', { className: 'rdw-expert-option-title' }, `${expert.displayName || expert.name} · ${expert.profession || expert.agentId}`),
                    expert.description ? h('span', { className: 'rdw-expert-option-note' }, expert.description) : null,
                  ),
                ),
                teams.length ? h('div', { className: 'rdw-expert-pop-group' }, `专家团（${teams.length}）`) : null,
                ...teams.map((team) =>
                  h(
                    'button',
                    {
                      key: `t-${team.id}`,
                      type: 'button',
                      className: `rdw-expert-option${selected === `team:${team.id}` ? ' is-current' : ''}`,
                      onClick: () => use({ ...team, kind: 'team' }, `team:${team.id}`),
                    },
                    h('span', { className: 'rdw-expert-option-title' }, team.name),
                    h('span', { className: 'rdw-expert-option-note' }, `${team.members?.length ?? 0} 人 · ${team.profession || ''}`),
                  ),
                ),
                experts.length || teams.length
                  ? null
                  : h(
                      'div',
                      { className: 'rdw-expert-option-note', style: { padding: '6px 8px' } },
                      '还没有专家。在「需求开发工作台 · 专家与专家团」里点「＋ 新建专家」写一位，回到这里刷新即可。',
                    ),
              ),
              status ? h('div', { className: 'rdw-expert-pop-foot' }, status) : null,
              failure ? h('div', { className: 'rdw-expert-pop-foot is-error' }, failure) : null,
            )
          : null,
      )
    }

    function apply(ctx) {
      const uiWorkspace = typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : undefined
      // 会话服务：工作台靠它把「养专家」的指令发进当前对话（agent 模式）。没有就自动退回复制。
      const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
      // 对话输入框的「＋ 专家」入口：宿主没有 slots 服务时静默跳过，不影响工作台本体。
      try {
        const registerEntry = (slots) => {
          if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') return
          slots.inject('conversation.input.left', () =>
            slots.register(
              // order 取小值 = 排在输入框工具栏最左端（对齐 WorkBuddy 的「＋ 专家」位置），
              // 同排其余原生控件一概不动。
              { name: 'conversation.input.left', id: 'rdw-expert-entry', order: 5, label: () => '专家' },
              (entryProps) => h(ExpertComposerEntry, entryProps ?? {}),
            ),
          )
        }
        if (ctx.slots) registerEntry(ctx.slots)
        else if (typeof ctx.inject === 'function') ctx.inject(['slots'], (scoped) => registerEntry(scoped?.slots))
      } catch (error) {
        // 入口挂了也不能拖垮工作台
        if (typeof console !== 'undefined' && console.warn) console.warn('[rdw] 对话输入框专家入口注册失败：', error?.message ?? error)
      }
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
              service: { ...(props?.service ?? {}), uiWorkspace, desktopWorkbenches: ctx.desktopWorkbenches, sessions },
            }),
        ),
      )
    }

    return {
      apply,
      inject: ['desktopWorkbenches'],
      // 自测钩子：给 test/smoke.mjs 直接跑组件函数体与纯函数用；宿主只读 apply/inject，多余的键会被忽略。
      __components: { BusinessPanel, TableModule, OverviewModule, ModuleDialog, DetailView, ViewConfigPanel, SettingsView, SkillsModule, DevModule, ExpertsModule, ExpertComposerEntry },
      __pure: {
        summarizeBuckets,
        runBadge,
        sliceForTable,
        defaultModules,
        formatTime,
        buildModules,
        matchesFilters,
        applyOverrides,
        defaultListFields,
        clampRailWidth,
        buildInstruction,
        expertInstructionLines,
        expertOpenerText,
        expertEnrichmentPrompt,
        promptCurrentSession,
        resolveExpertPick,
        recordValue,
        statusTone,
      },
    }
  },
})
