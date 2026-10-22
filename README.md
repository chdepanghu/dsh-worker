# 需求开发工作台（dsh-requirement-dev-workbench）

DSH Desktop 工作台：**把飞书多维表格里的开发需求读进来，选中本地项目，生成可以直接交给 AI 的开发指令，并能随手翻项目/全局 skill 与开发规范。**

- 形态：标准分栏里的业务面板。左侧是「可选模块」列表，右侧是当前模块内容；后续加模块只改列表。
- 模块：`开发需求`、`技能与规范`（第一版）。
- 数据：工作台设置写在 DSH 数据目录 `requirement-dev-workbench/settings.json`；**不保存任何飞书凭证**，一律调用本机已登录的 `lark-cli`。

## 怎么用

1. 打开工作台 → `开发需求` → 设置：**先选项目目录**。项目里若已有 `.requirement-sources.json`（`feishu-requirement-intake` 用的那一份），工作台会直接认出来，选一下即可，不用重填表格地址。
2. 列表里点一条需求 → 详情页（原始需求 / 详细设计 / 验收标准分块展示）→ 「生成开发指令并复制」。
3. 把指令粘到左侧 AI 对话，AI 就在该项目里按已有规范/skill 做前后端开发。
4. 需要的话点「待开发/开发中/已完成」把状态回写飞书表格。
5. `技能与规范` 模块扫描全局 skill（`DSH_HOME/skills`）与所选项目的 `.claude/skills`、`.agents/skills`、`skills`，以及 `doc/standards/*.md`、`AGENTS.md`、`CLAUDE.md`。

## 读表方式

- 优先 `lark-cli base +record-list --format ndjson`（带字段名），只读；
- ndjson 不可用时退回 `--format json` 的值矩阵，并用 `+field-list` 对齐列名，列数不一致就不猜、直接报错。
- 拉取文件写在 `DSH 数据目录/requirement-dev-workbench/pull/`，用完即删。

## 本机接口

都在本工作台自己的前缀下：`/api/requirement-dev-workbench/{state,settings,sources,requirements,requirement/status,skills,skill}`。

## 身份说明

`register({ repository })` 目前填的是**占位地址**（`github.com/local-dev-workbench/...`），只为满足工作台身份字段；等真实仓库（Gitee/GitHub）确定后替换，并按迁移规则处理已有会话。

## 开发

```bash
pnpm pack          # 产出 dsh-requirement-dev-workbench-1.0.0.tgz
```
