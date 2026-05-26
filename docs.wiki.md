# Dexter 项目 Wiki（中国 A 股 / ETF 全量改造方案）

## 0. 目标与范围

本文给出 **面向中国 A 股（含 ETF）** 的完整改造蓝图，覆盖：

1. LLM 推理层替换（含 OpenAI 兼容接口）。
2. 金融数据层从 Financial Datasets 迁移到中国市场数据源（Tushare / AkShare 等）。
3. 除行情外的关键能力补齐：**资讯、公告、财报、行业与宏观、交易日历、成分股、基金数据、复权与公司行为**。
4. 工程分阶段实施计划、风险、验收清单。

---

## 1. 现状基线（当前仓库）

### 1.1 LLM 层

当前项目已具备多 Provider 路由和 OpenAI 兼容接入模式：

- Provider 注册：`src/providers.ts`
- LLM 工厂：`src/model/llm.ts`
- `ChatOpenAI + baseURL` 方式已用于多家兼容服务

**结论：模型替换是低风险改造。**

### 1.2 金融数据层

- 统一 HTTP 调用封装：`src/tools/finance/api.ts`
- 但工具逻辑对 Financial Datasets endpoint/schema 耦合较深：`src/tools/finance/*.ts`
- 格式化层也依赖既有字段：`src/tools/finance/formatters.ts`

**结论：数据源替换是中高风险改造（主要风险在 schema 与语义映射）。**

---

## 2. 目标架构（A 股 / ETF 可持续架构）

建议把 finance 层拆成四层，避免再次被单一供应商锁死：

1. **Provider Client 层**：TushareClient / AkShareClient / 其他源 Client
2. **Adapter 层**：各 provider 原始字段 → 统一 Domain DTO
3. **Domain Service 层**：按业务语义聚合（行情、财报、公告、基金）
4. **Tool 层**：`get_financials` / `get_market_data` / `stock_screener` / `read_filings` 只依赖 Domain Service

### 2.1 建议新增目录

```text
src/tools/finance/providers/
  tushare/
  akshare/
  eastmoney/
  sina/
src/tools/finance/adapters/
src/tools/finance/domain/
src/tools/finance/symbol/
```

### 2.2 关键设计原则

- **多源冗余**：关键数据（价格、公告、ETF 成分）至少两源兜底。
- **时间语义一致化**：交易日、财报期、时区、盘前盘后定义统一。
- **字段标准化**：统一金额单位、百分比、小数精度、币种（CNY/HKD/USD）。
- **可降级**：某 provider 挂掉时，工具仍可返回可用的“降级答案 + 数据来源说明”。

---

## 3. A 股 / ETF 必备能力清单（不仅仅是行情）

> 你关心“除了行情还缺什么”，这里给出完整 checklist。

### 3.1 行情与交易微观结构

- 日线/分钟线 OHLCV（前复权/后复权/不复权）
- 盘口与逐笔（若未来接实时）
- 停牌、涨跌停状态、换手率、振幅
- 北向/南向资金、两融余额（如需策略分析）

### 3.2 公司基础与财务

- 利润表/资产负债表/现金流（年报、季报）
- 关键财务指标（ROE、毛利率、净利率、资产负债率、现金流质量）
- 业绩预告、快报、分红送转、股本变动

### 3.3 公告与信息披露（中国语义替代 SEC filing）

- 上市公司公告（定期报告、临时公告、问询函回复、并购重组、回购增持、减持）
- 公告全文抓取与要点抽取
- 公告事件分类（利好/利空/中性 + 事件类型）

### 3.4 资讯与舆情

- 财经快讯（交易时段内）
- 媒体新闻（证券时报、上证报、财联社等）
- 社交舆情（可选）
- 去重、可信度评分、时间衰减

### 3.5 ETF 专项数据

- ETF 基础信息（管理人、跟踪标的、费率）
- ETF 日频净值、IOPV（如可得）、折溢价率
- ETF 成分股及权重、行业暴露
- 申赎清单（PCF）与规模变化（若源可得）

### 3.6 指数与行业

- 宽基/行业指数行情
- 申万/中信行业分类映射
- 行业轮动指标、估值分位

### 3.7 宏观与利率（增强分析质量）

- CPI/PPI、社融、PMI、M2
- 国债收益率曲线、Shibor/LPR
- 人民币汇率与大宗商品（对周期行业影响）

### 3.8 交易日历与市场规则

- 交易日历（节假日、临时休市）
- 涨跌停制度、ST 规则、科创板/创业板差异
- T+1、最小报价单位等规则（用于回答行为约束问题）

---

## 4. 数据源策略（Tushare / AkShare 之外的建议）

## 4.1 定位建议

- **Tushare**：结构化财务与基础面较完整，适合“核心事实层”。
- **AkShare**：覆盖面广，很多中国市场接口可补齐；适合“广覆盖补充层”。
- **其他来源（建议）**：
  - 东方财富/同花顺/新浪等公开页面或接口（需合法合规评估）
  - 交易所官网（上交所/深交所/北交所）公告原文
  - 巨潮资讯（公告主渠道）

> 备忘录：第三方网站抓取需评估 ToS、反爬策略、稳定性与法律合规。

### 4.2 推荐“分域主源 + 备源”

- 价格行情：主 Tushare，备 AkShare
- 财报指标：主 Tushare，备 AkShare
- 公告原文：主 交易所/巨潮，备 AkShare 聚合
- 新闻资讯：主 多新闻源聚合，备 web_search
- ETF 成分/折溢价：主 AkShare 或基金公司公开数据，备 东方财富类公开源

### 4.3 数据质量治理

- 一致性校验：同一 ticker 同一日期多源比对
- 新鲜度监控：延迟阈值报警
- 异常值检测：成交量突变、财务字段缺失、零值异常
- 溯源记录：每条答案附数据来源与时间戳

---

## 5. 对现有工具的改造映射

### 5.1 `get_market_data`

新增/调整能力：

- 支持 A 股 symbol（`600519.SH`, `000001.SZ`）和 ETF（`510300.SH`）
- 返回复权模式可选（qfq/hfq/none）
- 补充涨跌停、换手率、成交额、北向资金
- 失败时自动 fallback 到第二数据源

### 5.2 `get_financials`

新增/调整能力：

- 财务报表按中国披露口径映射到统一 DTO
- 指标统一单位（亿元/万元）并在输出中明确
- 对业绩预告、快报提供事件摘要

### 5.3 `read_filings` → 建议升级为 `read_disclosures`

- US 市场仍可保留 SEC 路径
- CN 市场改为公告/定期报告读取
- 增加公告类型过滤（年报、问询、重组、减持、回购等）

### 5.4 `stock_screener`

- 适配 A 股字段（TTM、扣非净利、ROE、资产负债率、现金流）
- 支持行业/板块过滤（申万一级/二级）
- 支持 ETF 筛选（规模、流动性、折溢价）

---

## 6. 耦合治理：把“半抽象”升级为“可插拔”

### 6.1 新增统一接口（示意）

- `FinanceProvider`：标准方法集（quotes, financials, disclosures, etf_holdings, news）
- `FinanceDomainService`：组合查询和业务语义拼装

### 6.2 DTO（示意）

- `QuoteBar`, `QuoteSnapshot`
- `IncomeStatement`, `BalanceSheet`, `CashFlow`
- `FinancialMetricSnapshot`
- `DisclosureDoc`, `DisclosureEvent`
- `ETFProfile`, `ETFHolding`, `ETFPremiumDiscount`

### 6.3 Symbol Resolver

- 输入容错：中文简称、拼音、代码、带后缀代码
- 输出标准：`{ market, symbol, exchange, assetType }`
- 市场路由：US 走原链路，CN 走新链路

---

## 7. 分阶段实施计划（建议 4 个里程碑）

### M1（2~3 周）：跑通 A 股基础分析

- 接入 Tushare/AkShare Client
- 完成 symbol resolver
- 打通 `get_market_data` + `get_financials` 的 CN 分支
- 支持日线、基础财务、主要估值指标

**验收**：能稳定回答“贵州茅台/宁德时代/沪深300ETF”的估值与趋势类问题。

### M2（2~4 周）：公告与财报阅读能力

- `read_disclosures` 上线
- 公告全文抓取 + 摘要 + 事件标签
- 年报/季报重点段落抽取

**验收**：能回答“最近三个月重大公告及影响”。

### M3（2~3 周）：ETF 与行业增强

- ETF 成分与折溢价
- 行业映射和板块筛选
- 北向资金、两融等增强指标

**验收**：能完成“ETF 对比 + 行业轮动解释”。

### M4（持续）：质量与运维

- 多源一致性监控
- 数据延迟与失败告警
- 回归评测（问答准确率、引用率、稳定性）

---

## 8. 风险与备忘录（你特别关心的“方案之外”）

1. **合规风险**：部分站点/接口抓取受 ToS 限制，必须先走法务与合规评估。
2. **稳定性风险**：公开接口变化快，建议做 adapter 与 contract test。
3. **时效性风险**：资讯与公告时效要求高，需建立刷新策略和缓存失效规则。
4. **语义风险**：A 股公告文本噪声大，建议引入事件分类器与置信度。
5. **解释风险**：回答需带“数据来源 + 时间戳 + 口径说明”（特别是复权/单位/币种）。

---

## 9. 对你的两个问题的最终结论

### 9.1 OpenAI 替换 / OpenAI 兼容接口

**完全可行，且当前架构已证明可行。**
项目已通过统一 provider registry + `ChatOpenAI(baseURL)` 实现多家兼容服务接入。

### 9.2 Financial Datasets 耦合与 Tushare 改造

- 当前是“**半抽象**”而不是“可插拔”：HTTP 层有抽象，业务语义层强耦合。
- 替换为 Tushare 支持 A 股/ETF **可行**，但要补足以下能力才算“可用于中国市场研究生产”：
  - 公告与财报原文阅读
  - 新闻与舆情聚合
  - ETF 专项数据
  - 行业/指数/宏观增强
  - 数据质量治理与合规体系

---

## 10. 执行备忘录（可直接转 Jira）

- [ ] 新建 `finance/providers + adapters + domain + symbol` 目录结构
- [ ] 定义 DTO 与 Provider 接口（先覆盖 quote/financials/disclosures/etf/news）
- [ ] 接入 Tushare（主）+ AkShare（备）
- [ ] 改造 `get_market_data`, `get_financials`, `stock_screener`
- [ ] `read_filings` 升级为 `read_disclosures`（US/CN 双分支）
- [ ] 增加来源与时间戳透传
- [ ] 增加 contract tests + multi-source consistency checks
- [ ] 建立数据延迟与可用性监控
- [ ] 建立合规检查清单（来源、ToS、抓取策略）
