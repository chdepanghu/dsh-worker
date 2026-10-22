# 需求开发工作台（dsh-requirement-dev-workbench）

DSH Desktop 工作台：**把飞书多维表格里的开发需求汇总成「总需求清单 + 卡片看板」（按表字段筛选、分组、拖拽），选中本地项目后生成可以直接交给 AI 的开发指令，并能随手翻项目/全局 skill 与开发规范。**

- 形态：标准分栏里的业务面板（业务区在右侧，默认占 50%）。面板内左侧是模块栏，右侧是当前模块内容；加模块只改列表。
- 模块：`开发需求`、`技能与规范`。
- 数据：设置写在 DSH 数据目录 `requirement-dev-workbench/settings.json`，页面配置写在同目录 `view.json`，表结构缓存在 `fields-<tableId>.json`；**不保存任何飞书凭证**，一律调用本机已登录的 `lark-cli`。

## 开发需求模块

**两种视图（同一份数据，随时切换）**

| 视图 | 用途 |
| --- | --- |
| 汇总清单 | 一行一条需求、按配置的列展示全部字段内容；「复制清单」把当前筛选结果整段复制，直接贴给 AI 或存档 |
| 卡片看板 | 按「分组字段」自动分成若干模块，每个模块一组卡片（标题 + 编号/优先级/类型/负责人 + 摘要），卡片可在模块间拖拽 |

**页面配置（筛选与分组）**：分组字段、卡片摘要字段、汇总清单显示哪些列、按表字段的筛选条件（选项字段多选、文本字段包含）、拖拽是否回写飞书。配置存在 `view.json`，下次打开一致。

**拖拽**：卡片拖到别的模块 = 改这条需求的「分组字段」值（默认只改页面；勾了回写开关才写飞书）；模块头部可拖动排序，可折叠/隐藏。

## 怎么用

1. 打开工作台 → `开发需求` → 设置：**先选项目目录**。项目里若已有 `.requirement-sources.json`（`feishu-requirement-intake` 用的那一份），工作台会直接认出来，选一下即可；也可以手动粘贴多维表格链接。
2. 「筛选与分组」里按字段筛出这一轮要做的需求 → 汇总清单看全貌 / 卡片看板排期。
3. 点一条需求 → 详情（原始需求 / 详细设计 / 验收标准分块展示）→ 「生成开发指令并复制」。
4. 把指令粘到左侧 AI 对话，AI 就在该项目里按已有规范/skill 做前后端开发。
5. 需要的话点「待开发/开发中/已完成」或直接用拖拽把状态回写飞书表格。
6. `技能与规范` 模块扫描全局 skill（`DSH_HOME/skills`）与所选项目的 `.claude/skills`、`.agents/skills`、`skills`，以及 `doc/standards/*.md`、`AGENTS.md`、`CLAUDE.md`。

## 读表方式

- 优先 `lark-cli base +record-list --format ndjson`（带字段名），只读；
- ndjson 不可用时退回 `--format json` 的值矩阵，并用 `+field-list` 对齐列名，列数不一致就不猜、直接报错；
- 表结构用 `lark-cli base +field-list` 读（字段名/类型/选项值），缓存 10 分钟；
- 拉取文件写在 `DSH 数据目录/requirement-dev-workbench/pull/`，用完即删。

## 本机接口

都在本工作台自己的前缀下：
`/api/requirement-dev-workbench/{state,settings,sources,requirements,requirement/status,fields,view,skills,skill}`。

## 身份说明

`register({ repository })` 目前填的是**占位地址**（`github.com/local-dev-workbench/...`），只为满足工作台身份字段；等真实仓库（Gitee/GitHub）确定后替换，并按迁移规则处理已有会话。

## 开发

```bash
pnpm pack          # 产出 dsh-requirement-dev-workbench-<version>.tgz
node test/smoke.mjs  # 冒烟测试（含真实需求表端到端）
```
