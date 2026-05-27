# Dexter A-Share 使用说明

Dexter 当前是一个基于 Bun + TypeScript + Ink 的命令行金融研究 Agent。它有交互式 CLI/TUI，也有 WhatsApp gateway；当前没有浏览器 Web UI、Vite/Next 前端或 HTTP Web 服务启动脚本。

## 启动方式

### 1. 安装依赖

```bash
bun install
```

### 2. 配置环境变量

项目会从根目录 `.env` 读取 API key。建议从示例文件复制：

```bash
cp env.example .env
```

A 股和 DeepSeek 相关字段：

```bash
DEEPSEEK_API_KEY=your-deepseek-api-key
TUSHARE_API_TOKEN=your-tushare-api-token

# 可选：Tushare 不可用时尝试 AkShare 兜底，需要本机 Python 安装 akshare
AKSHARE_FALLBACK=false
AKSHARE_PYTHON_BIN=python3
```

如需 AkShare 兜底：

```bash
pip3 install akshare
```

然后在 `.env` 中设置：

```bash
AKSHARE_FALLBACK=true
```

### 3. 启动 CLI

标准交互式 CLI：

```bash
bun run start
```

等价命令：

```bash
bun run src/index.tsx
```

开发 watch 模式：

```bash
bun run dev
```

启动后会进入终端交互界面，可以直接输入金融研究问题。当前本地默认模型配置为 DeepSeek V4 Flash；在 CLI 中输入 `/model` 可以切换模型，例如需要深度研究时切到 DeepSeek V4 Pro。

### 4. WhatsApp gateway

这不是 Web UI，而是消息入口。首次登录：

```bash
bun run gateway:login
```

启动监听：

```bash
bun run gateway
```

详细说明见 `src/gateway/channels/whatsapp/README.md`。

### 5. 验证命令

类型检查：

```bash
bun run typecheck
```

测试：

```bash
bun test
```

## CLI / Web 现状

| 入口 | 命令 | 状态 | 说明 |
| --- | --- | --- | --- |
| CLI/TUI | `bun run start` | 支持 | 主要使用方式，基于 Ink 的终端交互界面 |
| Dev CLI | `bun run dev` | 支持 | watch 模式，适合开发调试 |
| WhatsApp gateway | `bun run gateway:login` / `bun run gateway` | 支持 | 通过 WhatsApp 与 Dexter 对话 |
| Web UI | 无 | 暂不支持 | 当前没有浏览器前端或 Web 服务脚本 |

## A 股能力范围

Dexter 已接入中国 A 股/ETF 数据能力，数据优先来自 Tushare，可选 AkShare 兜底。自然语言问题会自动路由到合适工具。

### 1. 行情与估值快照

支持 A 股和场内 ETF：

- 最新收盘价、涨跌幅、成交量、成交额
- 市值、PE TTM、PB、换手率等估值字段
- 股票基础信息，如公司名、行业、交易所、上市日期

示例：

```text
贵州茅台最新行情怎么样？
600519.SH 最近的估值和成交情况
宁德时代今天的收盘价、市值、PE TTM
沪深300ETF 最新净值和成交情况
```

### 2. 历史价格与走势

支持按自然语言推断时间范围，例如近 1 月、近 3 月、半年、一年。

示例：

```text
贵州茅台近三个月走势如何？
300750.SZ 过去一年日线表现
沪深300ETF 最近半年价格走势
比较贵州茅台和宁德时代近一年走势
```

### 3. 财务指标与报表

支持 A 股财务指标和三大报表：

- EPS、ROE、毛利率、净利率、负债率、成长指标
- 利润表、资产负债表、现金流量表
- 多期趋势分析

示例：

```text
贵州茅台最近4期 ROE、毛利率、净利率变化
宁德时代最近几个报告期收入和利润趋势
600519.SH 最近三期资产负债表和现金流有什么变化？
比较贵州茅台和五粮液的盈利能力
```

### 4. 公告与披露

支持把中国上市公司公告作为 SEC filings 的中国市场 counterpart 来读取：

- 年报、半年报、季报
- 问询函、回购、减持、增持
- 分红、权益分派、重组、并购、定增

示例：

```text
贵州茅台最近半年有哪些重要公告？
宁德时代最近一年有没有回购或减持公告？
600519.SH 最近的年报和分红公告
找一下平安银行最近三个月的问询或重大事项公告
```

### 5. ETF 持仓

支持查询可用的中国 ETF 组合持仓和权重。

示例：

```text
沪深300ETF 当前前十大持仓是什么？
510300.SH 的成分股和权重
科创50ETF 的主要持仓有哪些？
```

### 6. 交易日历

支持中国交易所交易日、休市日、上一交易日等查询。

示例：

```text
今天 A 股开市吗？
下周有哪些 A 股交易日？
春节前后 A 股交易日历
最近一个月上交所休市日有哪些？
```

### 7. 分红与公司行动

支持现金分红、送转、股权登记日、除权除息日、派息日等记录。

示例：

```text
贵州茅台最近10次分红记录
600519.SH 最近的除权除息日和派息日
宁德时代最近有没有现金分红或送转？
```

### 8. A 股筛选

支持按 Tushare 行业、交易所、PE TTM、PB、市值做初筛。

示例：

```text
筛选 A 股白酒行业 PE TTM 小于 30 的公司
找 A 股银行里 PB 小于 0.8、市值大于 1000 亿的股票
筛选上交所市值大于 500 亿且 PE 小于 20 的股票
找北交所市值小于 100 亿的公司
```

## 推荐提问方式

直接用自然语言提问即可。更稳定的写法是同时给出公司名或股票代码，以及你关心的维度。

较好：

```text
贵州茅台最近4期 ROE、净利率、收入增速变化，并结合估值说一下当前贵不贵
```

不够明确：

```text
茅台怎么样？
```

代码格式也支持：

```text
600519.SH 最新行情
000001.SZ 最近一年走势
510300.SH 前十大持仓
```

## 常用示例问题

```text
贵州茅台最新行情、估值和最近公告综合看一下
```

```text
宁德时代最近一年股价表现和最近4期财务指标有什么背离？
```

```text
筛选 A 股银行股：PB 小于 0.8，市值大于 1000 亿，列出前 10 个
```

```text
沪深300ETF 的主要持仓有哪些？最近半年走势如何？
```

```text
今天 A 股开市吗？如果不开市，上一个交易日是哪天？
```

```text
贵州茅台最近10次分红记录，股权登记日和除息日分别是什么？
```

```text
比较贵州茅台、五粮液、泸州老窖最近4期 ROE 和利润率
```

```text
找一下宁德时代最近一年涉及回购、减持、定增、重大事项的公告
```

## 模型选择建议

- `deepseek-v4-flash`：默认快速模型，适合行情快照、简单筛选、常规问答。
- `deepseek-v4-pro`：适合深度研究、多公司对比、公告和财务指标综合分析。项目会为该模型启用 `reasoning_effort=high` 和 thinking 模式。

在 CLI 中输入：

```text
/model
```

即可切换 provider 和 model。

## 当前限制

- A 股数据质量和覆盖范围取决于 Tushare 权限；部分接口可能受积分、权限或字段可用性影响。
- AkShare 是可选兜底，需要本机 Python 环境和 `akshare` 包。
- 当前没有 Web UI。需要图形界面时，应另行增加 Web 前端或 HTTP API 层。
- 结果仅用于研究和信息参考，不构成投资建议。
