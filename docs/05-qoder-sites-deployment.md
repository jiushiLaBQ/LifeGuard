# Qoder Sites 部署能力与限制分析

> 依据：2026-11-05 随当前 Qoder Desktop 安装的 `sites-building` 插件文档，包括 `environment.md`、`functions.md`、`function-backend.md`、`database.md`、`database-migration.md`、`storage.md`、`static-site.md` 与 `records-example.md`。本轮未创建云资源、未部署，因此“平台支持”不等于“本项目已完成实网验收”。

## 1. 结论

Qoder Sites 可以承载知悉的 Vue 前端、私人数据、附件和服务端模型代理，推荐形态为：

**Vue 静态构建 + 一个 TypeScript Edge Function + Function-owned Database + Private Storage + Secrets。**

它不能直接承载用户设想的常驻 Python FastAPI 进程。FastAPI/PaddleOCR 若需要自托管，必须部署到其他支持 Python 的环境，再由 Function 通过固定 HTTPS 接口调用。不能把 Python 源码放入项目就声称 Sites 已提供 OCR 后端。

## 2. 已确认的平台能力

| 能力 | 当前契约 | 对 LifeGuard 的意义 |
| --- | --- | --- |
| 静态网站 | 发布包含 `index.html` 的构建目录；SPA 可开启 fallback | 部署 Vue/Vite `dist`，深链刷新需实测 |
| 服务端 | 一个逻辑名 `app` 的 Edge Function，根目录 `index.ts`，如 `Deno.serve(handler)` | 承载业务 API、权限、规则、模型代理 |
| 浏览器调用 | 同源 `/functions/v1/app`，支持子路径和 query | 无需向浏览器暴露服务域名与凭证 |
| 数据库 | Function 侧 Supabase 适配器，声明 `read_only/read_write` 与验证过的 `schemaRef` | 保存事项、字段、期限、行动、完成等私有记录 |
| 新私有后端 | `function_backend` 访问模型，平台固定私有策略 | 浏览器不直接访问数据库，Function 执行业务 owner 谓词 |
| 文件 | Function 中注入 Storage SDK，支持上传、下载、删除、签名上传/下载 | 保存私人图片/PDF，上传后校验，授权预览 |
| 身份 | Gateway 向 Function 注入用户上下文，应用 SDK 读取 | 可实现按用户隔离，但需验证入口与 Provider 直连防护 |
| 第三方密钥 | Sites Settings 中配置应用 Secret，Function 用 `Deno.env.get` 读取 | 模型/OCR Key 不进入浏览器和源码 |
| 本地开发 | Vite 同源代理 + 本地 Deno handler + 无凭证假适配器 | 可测试真实业务 handler，但 fixture 不证明云端集成 |

## 3. 明确限制与应对

### 3.1 运行时与依赖

- 没有可假设的 Node 常驻服务器、SSR 进程、FastAPI 容器或后台 worker。
- Function 入口和依赖需自包含，使用带扩展名的相对导入。
- 打包器不解析 TS path alias、不转换 Node 专属模块、不安装依赖；复制 `node_modules` 不是解决方案。
- 纯领域代码与第三方依赖需要在发布前完成兼容构建/打包，并对最终 `functions/index.ts` 做 Deno 检查。
- 不假设请求结束后还能继续 OCR。长任务需要外部任务状态与轮询，或独立异步服务。

### 3.2 数据库与迁移

当前迁移接口是受限 PostgreSQL 子集：

- 支持 `CREATE TABLE app.<table>`、`ALTER TABLE ... ADD COLUMN`、普通 `CREATE INDEX`。
- 支持 `boolean/integer/bigint/text/uuid/timestamptz/jsonb`，不支持 `date/numeric/varchar(n)` 等类型和修饰。
- 不支持自定义函数、触发器、任意 SQL/RLS、CHECK、表达式/谓词索引。
- 日期用 `text YYYY-MM-DD`，金额用 `bigint`，JSON 由 Function 校验。
- 多个 SDK 调用不是一个事务。上传元数据、Storage 和识别任务需要持久状态、幂等键与对账，不能宣称跨资源原子性。
- 条件更新可同时作为单行 compare-and-set，但必须检查实际影响行；多行/多表强事务需另行验证可用原子能力。

### 3.3 文件与私人材料

- Storage 需要单独授权启用并等待 ready，启用能力不等于业务权限完成。
- 每次 list/upload/download/remove/sign 前都要做应用授权；对象路径和浏览器 owner 不是权限证明。
- 浏览器签名上传后，Function 必须实际下载并验证字节数、MIME 和必要文件格式，再标记 ready。
- 签名 URL 是短期 bearer capability，过期前即使权限改变也可能仍可使用；不得写日志或公开分享。
- 私有材料不能放在 `public/`、`dist/` 或演示 fixture 中。

### 3.4 身份与安全边界

- `x-qoder-user-context` 由升级后的 Gateway 注入，Function SDK 验证格式而不是签名；必须验收 Provider 直连、备用入口和跨租户路由是否关闭。
- 本地伪造身份、双账号 fixture 或站点私有设置不能单独证明生产隔离。
- 身份状态撤销/资料变化可能最多滞后 10 分钟，需要在隐私说明和验收中考虑。
- 公开站点可以匿名访问，私有业务路由仍必须要求用户并校验 owner；还需要额度与滥用控制。
- 未完成真实隔离验收时，只能按用户明确同意的限定功能测试范围存储测试数据，不能宣传生产级隐私保证。

### 3.5 Secret

- 仅声明实际需要的 Secret 名称；值通过 Portal Settings 输入并确认同步后再发布依赖版本。
- Secret 值不得出现在源码、工具参数、聊天、命令行、前端构建变量和日志中。
- `QODER_`、`SUPABASE_`、`POSTGRES_` 等保留前缀及 `DATABASE_URL` 不能用作应用 Secret。
- 缺少模型/OCR Secret 时返回稳定 `service_not_configured`，UI 显示能力未配置，不读取或回显环境值。
- 若使用 Qoder Cloud Agent，其 `QODER_PAT` 属平台 Secret，按专门能力文档处理；不能与自定义第三方模型 Key 混用。

### 3.6 静态路由与打包

- SPA 使用 `spa: true` 并验证深链、刷新、静态资源 Content-Type 与正文；200 也可能是 HTML fallback，不能仅凭状态码判定 JS 加载成功。
- 应用路由避开 `/api`、`/internal`、`/__qoder_auth`、`/__qoder_internal`、`/functions`、`/storage`、`/rest/v1`、`/supabase` 等平台命名空间。
- 当前本地打包限制：目录扫描 10,000 文件；单文件 50 MiB；原始 Web 450 MiB；原始 Function 50 MiB；ZIP 本地 100 MiB 但 Worker 有更严格 50 MiB 限制。交付包应按 **50 MiB 以内**控制，服务端配额仍需以实际结果为准。
- 排除 `.git`、`node_modules`、`.env*`、私钥、`_qoder`、本地 fixture 和测试材料。
- ECharts 按需引入；OCR WASM/语言模型若采用浏览器方案需单独控制体积、缓存和加载失败，不把它们打包进 Function。

### 3.7 预览、发布和运行验收

- Desktop 发布预览渲染冻结的静态包，**不执行 Function、不提供网站凭证、不证明后端行为**。
- 前端构建成功、发布成功和真实访客可用是三件不同的事。
- 数据库、Storage、登录、模型和 OCR 必须在发布后通过实际业务 URL 做代表性验收。
- 旧页面可能仍打开，API 变更需兼容相邻 Function 版本，避免发布瞬间破坏进行中的确认操作。

### 3.8 尚未从现有文档确认的配额

以下不能自行假设数值，架构确认后应通过当前 Portal/工具或限定测试核实：

- Function 单请求时长、CPU、内存、请求/响应体上限和并发。
- 外部网络 allowlist、可用 OCR/模型供应商及出站限制。
- Storage 单对象与总额度、数据库容量和请求配额。
- 是否提供适合本产品的定时调度，以及后台任务保证。
- 公共访问的费用、限流和滥用控制边界。

在这些值明确前，产品采用较小的文件/页数预算、有界轮询和可降级流程；不承诺大文件批量 OCR。

## 4. 推荐发布拓扑

```text
浏览器
  └─ Vue dist（Qoder Sites 静态托管）
       └─ 同源 /functions/v1/app/api
            └─ app Edge Function
                 ├─ Function-owned Database
                 ├─ Private Storage
                 ├─ 可配置 LLM HTTPS API（Secret）
                 └─ OCR HTTPS API（Secret）
                      └─ 可选外部 FastAPI + PaddleOCR/PyMuPDF
```

第三方地址由服务端固定配置并设置超时；浏览器不能提交任意转发 URL。外部 FastAPI 只返回标准化 OCR/PDF 结果，LifeGuard 的 owner、事项状态和统计仍由 Function 管理。

## 5. 纯静态本地版边界

若用户选择不启用后端，仍可交付真实产品，但必须显示“本地模式”：

| 功能 | 本地版真实实现 | 边界 |
| --- | --- | --- |
| 事项/期限/行动/完成 | IndexedDB + 同一领域规则 | 仅当前浏览器，清数据可能丢失 |
| 手工录入和编辑 | 完整 | 需导出备份 |
| PDF | PDF.js 文本提取 | 扫描 PDF 无文本时需 OCR 或手工 |
| 图片 OCR | 仅在实际集成 Tesseract.js/WASM 等并成功后开放 | 中文识别质量、内存、速度需实测；失败不返回样本 |
| AI 抽取 | 无服务端时不调用需要秘密的模型 | 不用前端 Key，不伪装 AI；规则可用 |
| 附件 | IndexedDB Blob | 浏览器配额、隐私模式和清理风险 |
| 提醒 | 打开应用时计算站内提醒 | 无后台推送、邮件和跨设备同步 |
| 统计 | 本地真实记录 | 演示数据独立数据库 |
| 隐私 | 默认材料不出设备 | 若用户主动启用外部服务，需另行告知传输范围 |

本地版不是“完整云版”的营销说法，交付页和设置页都需列出上述限制。

## 6. 发布顺序与授权点

1. **本地验证**：前端 build、领域规则、真实 Function handler、Deno 检查、主流程浏览器测试。
2. **云资源授权**：用户确认后才创建/启用 Functions、Function-owned Database、Storage；本轮不执行。
3. **schema**：读取当前后端，提交受限迁移计划，审查后应用，重新读取 `schemaRef`。
4. **Secret**：只把名称传入准备配置；用户在 Settings 安全输入值，确认同步。
5. **准备草案**：`webDirectory=apps/web/dist`、`functionDirectory=functions`、`spa=true`、`databaseAccess=read_write` 和当前 `schemaRef`。
6. **发布前检查**：无秘密/私人材料、包大小、深链、静态资源、未知路由、方法校验。
7. **发布后验收**：真实双账号权限、上传下载、数据库持久化、模型/OCR、失败降级和统计。
8. **交付**：明确哪些经过本地 fixture、哪些经过部署实测、哪些仍未配置；预览不能替代动态验收。

## 7. 上线 Go/No-Go 清单

- [ ] 真实身份入口和 Provider 直连防护已验收，或明确限定测试范围。
- [ ] 两个账户不能互查事项、识别结果和附件。
- [ ] 上传实际字节验证、私有下载和删除路径通过。
- [ ] 模型/OCR 密钥只在服务端，缺失时能力状态准确。
- [ ] 日期、金额、幂等、版本冲突、空数据和重复材料通过。
- [ ] 演示与真实统计完全隔离。
- [ ] 静态深链与资源加载、Function 业务路由分别验证。
- [ ] 所有 P0 按钮有实际 handler，失败不会伪造成功。
- [ ] 未配置的调度、AI、OCR、同步能力在 UI 与交付说明中明确标注。
