# GitHub 相关项目调研与借鉴结论

> 调研日期：2026-11-05。环境没有 `gh` 命令，因此通过 GitHub API/raw 阅读 README、许可证和关键源文件，并对仓库页面做了二次核验。星标是查询时点快照，不代表功能适配度。本轮只学习机制，没有复制代码。

## 1. 选型概览

| 项目 | 调研时热度 | 许可证 | 与 LifeGuard 最相关的部分 | 采用方式 |
| --- | ---: | --- | --- | --- |
| [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) | 约 4.77 万★ | GPL-3.0 | 文档消费、SHA-256 去重、人工校正、审计 | 借鉴机制，自主实现 |
| [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) | 约 9.23 万★ | Apache-2.0 | 中文 OCR、版面结构、坐标和结构化输出 | 可选独立 OCR 引擎 |
| [Wallos](https://github.com/ellite/Wallos) | 约 0.88 万★ | GPL-3.0 | 周期推进、提前提醒、续费与成本统计 | 借鉴规则，重写并加强边界 |
| [LangExtract](https://github.com/google/langextract) | 约 3.93 万★ | Apache-2.0 | schema 抽取、原文对齐、证据区间和自定义模型 | 借鉴证据链或作为适配器候选 |

四个项目分别覆盖“材料管理、OCR、订阅、模型抽取”，但没有一个直接完成 LifeGuard 的“确认后风险分析—行动—完成结果”闭环。产品差异化应放在跨材料事项模型与可执行权益管理，而不是简单拼装四个开源界面。

## 2. Paperless-ngx：材料消费、去重与人工修订

### 实际阅读位置

- [README/仓库](https://github.com/paperless-ngx/paperless-ngx)：扫描、索引和归档文档的成熟系统。
- [`src/documents/consumer.py`](https://github.com/paperless-ngx/paperless-ngx/blob/dev/src/documents/consumer.py)：文档消费管线、SHA-256 校验、解析和入库流程。
- [`document-detail.component.ts`](https://github.com/paperless-ngx/paperless-ngx/blob/dev/src-ui/src/app/components/document-detail/document-detail.component.ts)：详情编辑、dirty tracking 与仅提交修改字段的思路。
- [`src/documents/models.py`](https://github.com/paperless-ngx/paperless-ngx/blob/dev/src/documents/models.py)：文档模型及审计相关设计。

### 学到的机制

1. 消费管道先计算文件 SHA-256，并检查原件/归档件的 checksum；完全相同文件可在进入重型处理前被识别。
2. 处理使用临时工作副本，之后解析、生成派生资源、补齐元数据，再提交数据库记录，失败状态与成功状态有区分。
3. 详情编辑跟踪用户修改字段，而不是无条件覆盖整个文档；OCR 内容和元数据均可由人校正。
4. 审计记录让后续修改有迹可循。

### 对 LifeGuard 的落地

- 上传意图中保存 `sha256`，精确重复只提示“已有相同材料”，由用户决定复用或保留副本。
- 使用 `pending_upload → uploaded → processing → ready/rejected` 状态，不把上传请求发出当作完成。
- 字段编辑使用版本和修改字段白名单；原候选、人工值与审计事件分开。
- 识别失败保留材料与可恢复任务，允许改走手工录入。

### 不能照搬

- SHA-256 无法发现重新拍照、裁剪、压缩或修改一个像素后的同一票据；近似重复只能作为业务候选，不能自动合并。
- Paperless-ngx 的 Django/Angular、文档归档模型和事务方式不适合直接塞入 Sites Edge Function。
- 自托管或本地保存不自动等于加密和权限安全；LifeGuard 仍需独立验证 Storage、身份与日志边界。
- GPL-3.0 项目仅借鉴机制，不在未评估许可证义务时复制实现代码。

## 3. PaddleOCR：中文 OCR 与结构化坐标证据

### 实际阅读位置

- [README/仓库](https://github.com/PaddlePaddle/PaddleOCR)：PP-StructureV3 可将 PDF/图像转换为 Markdown/JSON，并提供更细粒度坐标信息，包括表格单元格坐标。
- [`pp_structurev3.py`](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr/_pipelines/pp_structurev3.py)：方向校正、去畸变、版面、OCR、表格等模块组合的管线。
- [`ocr.py`](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr/ocr.py)：识别分数阈值、文本框/词盒等相关输出选项。

### 学到的机制

- OCR 不只是返回一整段文字，还可以保留页内结构、文本/表格坐标与识别信号。
- 对票据、保修卡和合同，版面结构与位置证据比单纯全文更有利于人工核对。
- OCR 管线可独立封装，LifeGuard 业务核心只消费标准化结果，无需绑定具体引擎。

### 对 LifeGuard 的落地

统一 OCR 输出至少包含：

```text
page → blocks[] → text / bbox / ocr_score / block_type
```

字段证据再关联 `page + text + bbox?`，供确认页定位原文。OCR 不可用时，领域与手工闭环不受影响。

### 不能照搬

- OCR 分数只表示文字识别信号，不等于“退货日期正确率”或“金额业务可信度”。字段仍需模型/规则、证据对齐、格式校验和用户确认。
- PP-StructureV3 的重型管线不应默认运行在轻量 Edge Function 或手机浏览器中。
- 坐标证明文字位置，不证明对合同语义、平台政策或周期的理解正确。
- 推荐将 PaddleOCR 放入可选 FastAPI 服务；只有在真实部署与代表性中文材料测试后才标记可用。

## 4. Wallos：周期推进、提醒与订阅成本

### 实际阅读位置

- [README/仓库](https://github.com/ellite/Wallos)：周期订阅、下次付款、通知和统计；核心是用户维护的订阅数据，不是银行流水识别。
- [`updatenextpayment.php`](https://github.com/ellite/Wallos/blob/main/endpoints/cronjobs/updatenextpayment.php)：对有效自动续费项目按 `P{n}D/W/M/Y` 推进下次付款日期。
- [`sendnotifications.php`](https://github.com/ellite/Wallos/blob/main/endpoints/cronjobs/sendnotifications.php)：默认提前天数、单项覆盖和通知发送思路。
- [`sendcancellationnotifications.php`](https://github.com/ellite/Wallos/blob/main/endpoints/cronjobs/sendcancellationnotifications.php)：取消日提醒场景。
- [`stats_calculations.php`](https://github.com/ellite/Wallos/blob/main/includes/stats_calculations.php)：将不同周期折算为月成本的思路。

### 学到的机制

- 续费不是静态日期：经过当前日期后，需要按周期推进到下一个有效日期。
- 用户默认提醒提前量与单项覆盖是实用设计。
- 取消提醒与普通续费提醒是不同业务目标。
- 月成本折算便于比较月付、年付，但必须与原周期金额同时展示。

### 对 LifeGuard 的落地

- 用纯函数实现周期推进，明确时区、月末和跨多个周期的规则。
- 期限统一进入 `deadlines`，订阅页面和首页共享同一记录，避免重复提醒和重复潜在损失。
- 数据结构预留用户默认/单项 `lead_days`，但外部通知只有在真实调度接入后开放。
- 每月等值和实际扣款严格分开；重复订阅只给候选，不根据相似名称自动认定。

### 不能照搬

- 手工订阅系统中的周期记录不能证明用户真实扣款，更不能直接实现重复扣费/异常支出识别。
- LifeGuard 需要增加实际 `payments`、至少三笔同服务交易、重复导入防护和证据展示。
- 定时脚本不能照搬到 Sites；未确认调度能力前只提供站内雷达。
- 月成本常数折算和日期推进要重新编写测试，尤其处理时区、闰年和月末。
- GPL-3.0 项目仅学习规则，不直接复制 PHP 代码。

## 5. LangExtract：模型抽取的原文证据链

### 实际阅读位置

- [README/仓库](https://github.com/google/langextract)：schema/few-shot 结构化抽取、原文精确区间 grounding、高亮和自定义模型端点。
- [`langextract/extraction.py`](https://github.com/google/langextract/blob/main/langextract/extraction.py)：抽取、分块、多遍处理和模型调用编排。
- [`langextract/resolver.py`](https://github.com/google/langextract/blob/main/langextract/resolver.py)：抽取结果与原文的 exact/fuzzy 对齐。
- [`langextract/core/data.py`](https://github.com/google/langextract/blob/main/langextract/core/data.py)：抽取数据及 `char_interval` 等来源表示，无法定位时可为空。

### 学到的机制

- 模型抽取结果应回到原文定位，而不是只给一个看似完整的 JSON。
- exact/fuzzy 对齐状态和 `char_interval` 能支持证据高亮与复核队列。
- schema、少样本示例和自定义模型端点有利于将模型能力做成可替换适配器。
- 找不到原文位置时应保留“无证据”，不能强行给高置信。

### 对 LifeGuard 的落地

- `matter_fields` 同时保存候选值、来源、证据原文、页码/字符区间或 bbox、对齐状态和人工确认状态。
- `confidenceKind` 区分 OCR 信号、模型/抽取器分数与规则匹配，禁止把模型自报分数包装成准确率。
- 无定位、字段冲突、非法日期/金额时统一进入待确认。
- 模型只接收最小必要文本，云调用需显式配置并做脱敏、超时和审计。

### 不能照搬

- 原文 grounding 只证明“值有出处”，不证明模型把开始日/截止日、总价/实付款等语义理解正确。
- LangExtract 不替代图片 OCR、PDF 预处理、对象权限、人工确认界面和行动闭环。
- Python 库不直接运行于 Sites Edge Function；若使用需放入外部识别服务，或仅借鉴其数据思想在 TypeScript 中自主实现。

## 6. 综合后形成的设计决策

| 调研发现 | LifeGuard 决策 |
| --- | --- |
| 哈希可发现完全相同文件 | 文件级精确去重；业务近似重复仅提示 |
| OCR 可输出坐标与分数 | 保存证据，但 OCR 分数不等于字段可信度 |
| 模型结果可对齐原文 | 字段保存原文区间/bbox 与对齐状态，无证据则待确认 |
| 人工可修正 OCR 和元数据 | 所有重要字段可编辑，候选与人工值都保留 |
| 周期订阅可自动推进 | 统一期限规则，明确时区、月末、取消和提醒幂等 |
| 订阅工具多是手工记录 | 异常支出只基于实际扣款，至少三笔才检测 |
| 文档系统有成熟消费状态 | 上传、识别、确认分状态，失败可恢复，不伪装成功 |
| 各项目均不覆盖完整权益闭环 | 自主实现确认、风险、行动、完成和真实统计核心 |

## 7. 许可证与后续复用规则

- GPL-3.0 的 Paperless-ngx、Wallos：以机制和流程学习为主，不复制源代码；若未来决定复制或衍生，先单独评估分发与许可证义务。
- Apache-2.0 的 PaddleOCR、LangExtract：可作为依赖/适配器候选，实施时保留相应许可证与 NOTICE，并锁定实际版本。
- 任何第三方代码进入项目前记录仓库、版本/commit、许可证、修改内容和用途；本调研文档不构成“已复制”的记录。
- 星标不作为技术验收。最终选择取决于中文票据识别质量、部署体积、维护状态、服务成本和隐私要求。
