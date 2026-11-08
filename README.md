# 知悉 LifeGuard

**个人生活权益与风险智能管家** —— 把合同、订单、保修单等生活材料，转化为可解释的风险评分、期限提醒和行动建议。

- 在线演示（任何人可直接访问，无需登录）：<https://zhixi-lifeguard-hbqs1xdfdme.qoder.zone>
- 仓库地址：<https://github.com/jiushiLaBQ/LifeGuard>

> 本项目为竞赛演示原型：纯前端本地运行，所有数据只保存在当前浏览器，预置内容均为虚构样例。

## 核心闭环

```
材料上传 → 浏览器内识别 → 用户核对确认 → 风险分析 → 期限管理 → 行动建议 → 完成记录
```

| 模块 | 说明 |
| --- | --- |
| 欢迎 / 竞赛演示 | 3 组标记为"模拟数据"的演示案例，一键加载；已有用户数据时先提示保护 |
| 今日概览 | 紧急事项、近期期限、风险分布等统计，全部由真实记录计算 |
| 材料中心 | 上传 PDF / 图片，浏览器内提取文本（PDF 文本层 + OCR），字段逐项核对后才生成正式事项 |
| 期限雷达 | 截止日期倒计时与时间轴，过期、临期分级提醒 |
| 行动中心 | 基于规则的行动方案（含"核对事实"步骤），逐步勾选并记录处理结果 |
| 消费分析 | 订阅月/季/年周期、30 天续费提醒、月/年支出预测、重复订阅识别、趋势图与节省建议 |
| 事项详情 | 五维风险评分、信息来源标记（识别 / 用户提供 / 待确认）、编辑、完成与删除 |
| 隐私与设置 | 数据导出、清空工作区、隐私说明 |

## 技术栈

- Vue 3（`<script setup>` + TypeScript strict）
- Pinia（唯一数据源 `useDemoStore`，localStorage 持久化）
- Vue Router 4（history 模式 + SPA fallback，深路由刷新不 404）
- Vite 6 + Tailwind CSS 4
- ECharts 5（趋势 / 分布图）
- pdfjs-dist（PDF 文本层解析）+ tesseract.js（浏览器内 OCR，chi_sim+eng）
- Vitest + jsdom（单元测试）

## 快速开始

要求：Node.js 18+（建议 20+）、npm 9+。

```bash
npm install        # 根目录为 npm workspaces，一次安装全部依赖
npm run dev        # 开发服务器 http://127.0.0.1:5173
npm run test       # Vitest 单元测试（当前 87 项通过）
npm run typecheck  # vue-tsc 类型检查
npm run build      # 生产构建，产物在 apps/web/dist
npm run preview    # 本地预览生产构建 http://127.0.0.1:4173
```

## 竞赛演示流程

1. 打开首页（欢迎页），点击"加载演示数据"区域中任一组"模拟数据"案例；
2. 一键加载后进入今日概览，查看由演示记录实时计算的统计；
3. 依次走查：材料中心（识别结果核对）→ 事项详情（风险评分与依据）→ 期限雷达 → 行动中心（勾选步骤、记录完成）→ 消费分析（续费提醒与重复订阅）；
4. 也可上传自己的测试材料走完整识别流程（文件不会离开浏览器）。

所有演示案例均明确标记为模拟数据；界面统计不使用固定数字冒充动态计算。

## 测试与验收

- **单元测试**：`npm run test`，87 项，覆盖风险引擎、行动引擎、订阅统计、store 迁移等；
- **算法场景**：`apps/web/src/features/decision/acceptanceScenarios.test.ts` 含 25 组验收场景（A01–A25：紧急低额、不紧急大额、续费、过期、日期不明、重复订阅、币种隔离等）；
- **浏览器验收脚本**：`artifacts/validate_*.py`（Python + Playwright，使用本机 Chrome），覆盖功能、识别、集成、订阅、UX 演示与生产预览共 50+ 项检查。运行示例：

```bash
# 先启动 dev 或 preview 服务，再运行脚本
PYTHONIOENCODING=utf-8 python artifacts/validate_acceptance.py
# 生产/线上验收可指定目标地址
LG_BASE=https://zhixi-lifeguard-hbqs1xdfdme.qoder.zone PYTHONIOENCODING=utf-8 python artifacts/validate_production_preview.py
```

`artifacts/` 中同时归档了验收截图、导出样例与虚构测试材料（不含任何真实私人信息）。

## 隐私与安全边界

- **数据不出浏览器**：材料在浏览器内解析，应用不向任何服务端上传文件或字段；生产构建中无应用层网络写请求。
- **本地存储**：工作区保存在 localStorage（`lifeguard.demo.workspace.v1`），可在设置页导出或清空；无账号、无云端同步。
- **诚实标记**：识别结果仅为候选，须用户核对；无法确定的字段标记为"待确认"，不编造结论。
- **无密钥暴露**：前端与构建产物不含任何 API 密钥；未接入外部模型 API。
- **操作边界**：暂停 / 删除订阅只影响本地记录，不会冒充已在第三方服务商处完成取消；风险建议不构成法律结论。
- OCR 首次运行需从 CDN 下载语言数据（仅模型文件，不含用户材料）。

## 部署

线上站点通过 Qoder Sites 发布：

- 访问权限：public（任何人均可访问，无需登录 Qoder）；
- SPA fallback：任意深路由刷新返回应用入口，不出现 404；
- 站点描述文件：`apps/web/.知悉 LifeGuard.qoder.site`（由发布工具生成，仅含站点 ID 与产物哈希，无凭据）；
- 部署说明见 `docs/05-qoder-sites-deployment.md`。

## 已知限制

- OCR 语言数据首次加载依赖 CDN，弱网下较慢；
- 无云同步、无系统级推送通知，提醒以页面内呈现为准；
- pdfjs 与 ECharts 产物 chunk 较大（约 500 kB 级，gzip 后约 150–175 kB），已按路由懒加载与分包缓解；
- tesseract.js 存在少量上游参数警告，不影响识别结果。

## 项目结构

```
apps/web/               Vue 3 前端应用
  src/app/              路由与应用外壳
  src/features/         按业务划分的页面与逻辑（demo / dashboard / materials /
                        deadlines / actions / subscriptions / matters / settings / decision）
  src/stores/           Pinia store 与持久化
artifacts/              验收脚本、截图与虚构测试材料
docs/                   产品、架构、数据模型、测试与部署文档
```

文档索引：`docs/00-planning-overview.md`（总览）、`01-product-prd.md`、`02-architecture.md`、`03-data-model.md`、`04-roadmap-and-structure.md`、`05-qoder-sites-deployment.md`、`06-test-plan.md`。