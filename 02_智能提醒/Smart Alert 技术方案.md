# Smart Alert — 智能提醒组技术方案
> 九号公司 · SAP S/4HANA 2024/2025 Private Cloud  
> 版本：v1.0 · 2026-06-12  
> 适用范围：Phase 1（第1-4周）

---

## 分工

**一人负责数据层**（ABAP CDS View + 批处理 Job + Z表写入），**一人负责页面集成与测试数据准备**。CDS View 先定好字段结构，页面侧可用测试数据并行验证展示效果。

---

## 核心逻辑

```
SAP S/4HANA 业务表
（BSID / BSAD / KNKK / VBAK / VKDFS / WB2R_M）
         │
         ▼
  ABAP CDS View（5个）
  每个规则一个 View，定义读取和计算逻辑
         │
         ▼
  ABAP 批处理 Job（每日 00:00 自动执行）
  读取5个 CDS View，把结果写入共享缓存表
         │
         ▼
  Z_CUST_KPI_CACHE（共享缓存表）← 与智能分析组对齐的唯一接口
         │
         ├─── 智能提醒组读取：驱动4张预警卡片 + Launchpad KPI Tile
         └─── 智能分析组读取：在 360° 页面展示预警状态徽章
```

---

## 5大检测规则

### 规则1：应收账款账龄逾期（FIN-01）

**读哪张表**：`BSID`（未清AR明细）+ `BSAD`（已清AR历史，用于补全）

**计算逻辑**：
```
逾期天数 = 系统当前日期 - 凭证到期日（BSID.ZFBDT + BSID.ZBD1T）

分级：
  当前（未逾期）：逾期天数 ≤ 0
  逾期30天：    0  < 逾期天数 ≤ 30
  逾期60天：    30 < 逾期天数 ≤ 60
  逾期90天：    60 < 逾期天数 ≤ 90
  逾期180天+：  逾期天数 > 90
```

**写入 Z_CUST_KPI_CACHE 字段**：

| 字段名 | 类型 | 含义 |
|--------|------|------|
| `AR_OVD_30` | CURR | 逾期30天金额 |
| `AR_OVD_60` | CURR | 逾期60天金额 |
| `AR_OVD_90` | CURR | 逾期90天金额 |
| `AR_OVD_180` | CURR | 逾期180天+金额 |
| `AR_CURRENT` | CURR | 未逾期应收金额 |
| `AR_STATUS` | INT1 | 最高逾期等级：0=正常/1=预警/2=高危/3=严重 |

**触发阈值（AR_STATUS 计算规则）**：

| AR_STATUS | 条件 |
|-----------|------|
| 3（严重） | `AR_OVD_180 > 0` |
| 2（高危） | `AR_OVD_90 > 0` |
| 1（预警） | `AR_OVD_30 > 0 OR AR_OVD_60 > 0` |
| 0（正常） | 全部为0 |

---

### 规则2：信用额度预警（FIN-02）

**读哪张表**：`KNKK`（客户信用管理）

**计算逻辑**：
```
信贷占用率 = KNKK.SKFOR / KNKK.KLIMK × 100
```

**写入字段**：

| 字段名 | 类型 | 含义 |
|--------|------|------|
| `CREDIT_LIMIT` | CURR | 信用额度上限 |
| `CREDIT_USED` | CURR | 当前已用额度 |
| `CREDIT_UTIL` | DEC | 占用率（%，保留1位小数） |
| `CREDIT_STATUS` | CHAR4 | NORMAL / WARNING / CRITICAL / EXCEEDED |

**触发阈值**：

| CREDIT_STATUS | 条件 |
|---------------|------|
| `EXCEEDED` | 占用率 ≥ 100% |
| `CRITICAL` | 85% ≤ 占用率 < 100% |
| `WARNING` | 70% ≤ 占用率 < 85% |
| `NORMAL` | 占用率 < 70% |

---

### 规则3：长期未下单（SAL-02）

**读哪张表**：`VBAK`（销售订单头）

**计算逻辑**：
```
最近下单日期 = MAX(VBAK.AUDAT) WHERE VBAK.KUNNR = 客户编号
               AND VBAK.AUART IN ('OR','ZOR')   -- 标准订单类型，按实际调整
               AND VBAK.ABGRU = ''              -- 排除已拒绝

未下单天数 = 系统日期 - 最近下单日期
```

**写入字段**：

| 字段名 | 类型 | 含义 |
|--------|------|------|
| `LAST_ORDER_DATE` | DATS | 最近一次下单日期 |
| `DAYS_INACTIVE` | INT4 | 距今天数 |
| `INACTIVITY_ST` | CHAR8 | ACTIVE / WARNING / ALERT |

**触发阈值**：

| INACTIVITY_ST | 条件 |
|---------------|------|
| `ALERT` | `DAYS_INACTIVE ≥ 60` |
| `WARNING` | `30 ≤ DAYS_INACTIVE < 60` |
| `ACTIVE` | `DAYS_INACTIVE < 30` |

---

### 规则4：合同快到期（COM-01）

**读哪张表**：`VKDFS`（销售合同条款）/ `VBAK` WHERE `AUART = 'KM'`（合同类型）

**计算逻辑**：
```
剩余天数 = 合同到期日(VKDFS.KDATB) - 系统日期

取该客户剩余天数最小的合同（即最快到期的那一张）
```

**写入字段**：

| 字段名 | 类型 | 含义 |
|--------|------|------|
| `CONTRACT_VBELN` | VBELN | 最近到期合同编号 |
| `CONTRACT_NAME` | CHAR40 | 合同描述 |
| `CONTRACT_EXP_DATE` | DATS | 到期日 |
| `CONTRACT_DAYS` | INT4 | 剩余天数（负值=已过期） |
| `CONTRACT_ST` | CHAR12 | NORMAL / EXPIRY_60 / EXPIRY_30 / EXPIRY_15 / EXPIRED |

**触发阈值**：

| CONTRACT_ST | 条件 |
|-------------|------|
| `EXPIRED` | `CONTRACT_DAYS < 0` |
| `EXPIRY_15` | `0 ≤ CONTRACT_DAYS ≤ 15` |
| `EXPIRY_30` | `15 < CONTRACT_DAYS ≤ 30` |
| `EXPIRY_60` | `30 < CONTRACT_DAYS ≤ 60` |
| `NORMAL` | `CONTRACT_DAYS > 60` 或无合同 |

---

### 规则5：年度返利协议未签（COM-02）

**读哪张表**：`WB2R_M` / `KONA`（协议头）+ `KONH`（协议条件头）

**计算逻辑**：
```
当前财年开始日 = 每年 1月1日（或按九号公司财年约定调整）

检测逻辑：
  在当前财年期间内，客户是否存在状态为"激活"的返利协议
  （KONA.DATAB ≤ 当前日期 ≤ KONA.DATBI，且 KONA.BOSTA = 'B'）
```

**写入字段**：

| 字段名 | 类型 | 含义 |
|--------|------|------|
| `REBATE_KNUMA` | CHAR10 | 返利协议编号（无则空） |
| `REBATE_ST` | CHAR8 | SIGNED / UNSIGNED / NA（不适用） |
| `REBATE_SIGN_DATE` | DATS | 签署日期 |

**触发阈值**：

| REBATE_ST | 条件 |
|-----------|------|
| `UNSIGNED` | 财年已开始 > 30天，且无激活返利协议 |
| `SIGNED` | 当前财年内存在激活协议 |
| `NA` | 客户类型不适用返利管理（按客户分组判断） |

---

## 共享缓存表设计（Z_CUST_KPI_CACHE）

> 与智能分析组对齐的核心接口，**第2周会议必须双方确认字段和主键后再开发**。

```abap
@EndUserText.label: '客户KPI预计算缓存表'
define structure Z_CUST_KPI_CACHE {
  -- 主键
  MANDT          : MANDT;          " 集团
  KUNNR          : KUNNR;          " 客户编号
  BUKRS          : BUKRS;          " 公司代码
  VKORG          : VKORG;          " 销售组织
  
  -- 元数据
  CALC_DATE      : DATS;           " 计算日期（每日刷新）
  LAST_UPD_TIME  : TIMS;           " 最后更新时间
  
  -- 智能提醒组写入字段
  AR_OVD_30      : CURR;           " 逾期30天金额
  AR_OVD_60      : CURR;           " 逾期60天金额
  AR_OVD_90      : CURR;           " 逾期90天金额
  AR_OVD_180     : CURR;           " 逾期180天+金额
  AR_CURRENT     : CURR;           " 未逾期应收金额
  AR_STATUS      : INT1;           " 0-3 逾期等级
  CREDIT_LIMIT   : CURR;           " 信用额度
  CREDIT_USED    : CURR;           " 已用额度
  CREDIT_UTIL    : DEC;            " 占用率%
  CREDIT_STATUS  : CHAR4;          " NORMAL/WARNING/CRITICAL/EXCEEDED
  LAST_ORDER_DATE: DATS;           " 最近下单日期
  DAYS_INACTIVE  : INT4;           " 未下单天数
  INACTIVITY_ST  : CHAR8;          " ACTIVE/WARNING/ALERT
  CONTRACT_VBELN : VBELN;          " 最近到期合同号
  CONTRACT_DAYS  : INT4;           " 合同剩余天数
  CONTRACT_ST    : CHAR12;         " 合同状态
  REBATE_ST      : CHAR8;          " 返利协议状态
  
  -- 智能分析组写入字段（供参考，由他们维护）
  RFM_SCORE      : DEC;            " RFM综合评分 3-15
  RFM_TIER       : CHAR1;          " A/B/C/D
}
```

---

## 批处理 Job 设计

> 每日 00:00 自动执行，读取5个 CDS View，逐客户写入 `Z_CUST_KPI_CACHE`。

```abap
PROGRAM Z_CUST_KPI_BATCH.

" 主逻辑：遍历所有客户
SELECT kunnr, bukrs, vkorg
  FROM kna1
  WHERE kunnr IN @s_kunnr          " 可指定范围，默认全量
  INTO TABLE @DATA(lt_customers).

LOOP AT lt_customers INTO DATA(ls_cust).

  " 从5个CDS View读取各规则结果
  SELECT SINGLE * FROM Z_C_AR_AGING_ALERT
    WHERE kunnr = @ls_cust-kunnr
    INTO @DATA(ls_ar).

  SELECT SINGLE * FROM Z_C_CREDIT_UTILIZATION
    WHERE kunnr = @ls_cust-kunnr
    INTO @DATA(ls_credit).

  SELECT SINGLE * FROM Z_C_CUSTOMER_INACTIVITY
    WHERE kunnr = @ls_cust-kunnr
    INTO @DATA(ls_inactive).

  SELECT SINGLE * FROM Z_C_CONTRACT_EXPIRY
    WHERE kunnr = @ls_cust-kunnr
    INTO @DATA(ls_contract).

  SELECT SINGLE * FROM Z_C_REBATE_STATUS
    WHERE kunnr = @ls_cust-kunnr
    INTO @DATA(ls_rebate).

  " UPSERT 写入缓存表（存在更新，不存在插入）
  MODIFY Z_CUST_KPI_CACHE FROM @( VALUE #(
    mandt          = sy-mandt
    kunnr          = ls_cust-kunnr
    bukrs          = ls_cust-bukrs
    vkorg          = ls_cust-vkorg
    calc_date      = sy-datum
    last_upd_time  = sy-uzeit
    ar_ovd_30      = ls_ar-ar_ovd_30
    ar_ovd_60      = ls_ar-ar_ovd_60
    ar_ovd_90      = ls_ar-ar_ovd_90
    ar_status      = ls_ar-ar_status
    credit_util    = ls_credit-credit_util
    credit_status  = ls_credit-credit_status
    days_inactive  = ls_inactive-days_inactive
    inactivity_st  = ls_inactive-inactivity_st
    contract_days  = ls_contract-contract_days
    contract_st    = ls_contract-contract_st
    rebate_st      = ls_rebate-rebate_st
  ) ).

ENDLOOP.
COMMIT WORK.
```

> Job 通过事务码 **SM36** 注册为每日定时任务，执行后可在 **SM37** 查看运行状态和日志。

---

## 页面设计

### 整体分工说明

智能提醒组负责以下页面和数据的产出：

```
Fiori Launchpad
│
├── KPI Tile 数据来源（提醒组产出）
│   ├── 高流失风险数     ← DAYS_INACTIVE ≥ 60 的客户数
│   ├── 合同即将到期数   ← CONTRACT_ST IN ('EXPIRY_15','EXPIRY_30') 的客户数
│   ├── AR逾期总金额     ← SUM(AR_OVD_30 + AR_OVD_60 + AR_OVD_90 + AR_OVD_180)
│   └── 信用超限客户数   ← CREDIT_STATUS = 'EXCEEDED' 的客户数
│
└── Customer 360° View（F2187A）中的4张卡片
    ├── 卡片A：财务风险雷达    ← 提醒组
    ├── 卡片B：销售活跃度      ← 提醒组
    ├── 卡片C：合规状态        ← 提醒组
    └── 卡片E：外部风险标签    ← 提醒组（Phase 1 用 Mock 数据）
```

---

### 新增页面：预警中心（Alert Center）

> 提醒组独立负责的汇总页面，集中展示所有触发预警的客户清单，供销售和财务主动巡检使用。以 **SAP Build Apps** 实现，数据通过 BTP OData 读取 `Z_CUST_KPI_CACHE`。

**页面1：预警总览**

```
┌────────────────────────────────────────────────────────────────────┐
│  预警中心                                  [刷新]  [导出Excel]     │
│────────────────────────────────────────────────────────────────────│
│  预警汇总                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────┐ │
│  │  AR严重逾期  │  │  信用超限    │  │  合同即将    │  │ 长期   │ │
│  │              │  │              │  │  到期        │  │ 未下单 │ │
│  │  🔴 ¥218万   │  │  🔴 4 客户  │  │  ⚠ 7 客户   │  │ ⚠ 12  │ │
│  │  涉及 9 客户 │  │  需立即处理  │  │  30天内      │  │ >60天  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └────────┘ │
│────────────────────────────────────────────────────────────────────│
│  筛选：[全部] [AR逾期] [信用超限] [合同到期] [长期未下单] [返利未签]│
│  排序：预警等级 ▼                                                  │
│────────────────────────────────────────────────────────────────────│
│  预警等级  客户名称           触发规则          最高等级   操作    │
│────────────────────────────────────────────────────────────────────│
│  🔴 严重   苏州博众精工       AR逾期90天+       严重       [详情]  │
│  🔴 严重   南京埃斯顿自动化   信用超限 108%     严重       [详情]  │
│  ⚠ 预警   九号机器人苏州      合同剩余28天      预警       [详情]  │
│  ⚠ 预警   上海辉度智能        长期未下单63天    预警       [详情]  │
│  ● 关注   常州铭赛机器人      信用占用82%       关注       [详情]  │
│────────────────────────────────────────────────────────────────────│
│  共 23 条预警  严重 6  预警 11  关注 6          < 1 2 >            │
└────────────────────────────────────────────────────────────────────┘
```

**字段映射**：

| 列 | 数据来源 | 逻辑 |
|----|---------|------|
| 预警等级（最高） | `Z_CUST_KPI_CACHE` 各状态字段综合 | 取5个规则中最高等级 |
| 触发规则描述 | 根据各状态字段拼接 | 列出当前触发的规则名，多个用`/`分隔 |
| AR逾期金额 | `AR_OVD_30 + AR_OVD_60 + AR_OVD_90 + AR_OVD_180` | 求和 |
| 点击[详情] | 跳转到 Customer 360° View（F2187A） | 传入 `KUNNR` 参数 |

**综合等级计算规则**：

| 显示等级 | 触发条件（任一满足即触发） |
|---------|------------------------|
| 🔴 严重 | `AR_STATUS = 3` 或 `CREDIT_STATUS = 'EXCEEDED'` 或 `CONTRACT_ST = 'EXPIRED'` |
| ⚠ 预警 | `AR_STATUS = 2` 或 `CREDIT_STATUS = 'CRITICAL'` 或 `CONTRACT_ST IN ('EXPIRY_15','EXPIRY_30')` 或 `DAYS_INACTIVE ≥ 60` 或 `REBATE_ST = 'UNSIGNED'` |
| ● 关注 | `AR_STATUS = 1` 或 `CREDIT_STATUS = 'WARNING'` 或 `CONTRACT_ST = 'EXPIRY_60'` 或 `30 ≤ DAYS_INACTIVE < 60` |

---

**页面2：单客户预警详情（在 Customer 360° View 的4张卡片）**

> 这4张卡片由提醒组提供数据，在分析组搭建的 F2187A 框架内展示，第4周联调接入。

**卡片A：财务风险雷达**

```
┌─────────────────────────────────────┐
│  财务风险雷达          [展开详情 ↗] │
│─────────────────────────────────────│
│  应收账款逾期                       │
│  当前   ██████████████  ¥12.4万     │
│  30天   ████            ¥ 3.2万     │
│  60天   ██              ¥ 1.8万  ⚠  │
│  90天+  █               ¥ 0.5万  🔴 │
│  总逾期：¥5.5万  占应收 31%          │
│                                     │
│  信贷额度                           │
│  已用 ████████████░░░░  78%  ⚠      │
│  额度：¥80万  已用：¥62.4万         │
└─────────────────────────────────────┘
```

颜色阈值：

| 指标 | 绿色 | 橙色 | 红色 |
|------|------|------|------|
| AR逾期占比 | < 10% | 10-25% | > 25% |
| 信贷占用率 | < 70% | 70-85% | > 85% |

---

**卡片B：销售活跃度**

```
┌─────────────────────────────────────┐
│  销售活跃度            [查看订单 ↗] │
│─────────────────────────────────────│
│  ● 关注  距上次下单：47天           │
│                                     │
│  近12月下单趋势                      │
│  ▂ ▄ █ █ ▆ ▄ ▃ ▂ ▂ ▁ ▁ ▁          │
│  7 8 9 10 11 12 1 2 3 4 5 6月       │
│                                     │
│  本年累计   ¥284,000                │
│  上年同期   ¥412,000  ↓ 31%         │
└─────────────────────────────────────┘
```

| DAYS_INACTIVE | 状态文字 | 颜色 |
|--------------|---------|------|
| 0-29天 | 正常活跃 | 绿色 |
| 30-59天 | 关注 | 橙色 |
| ≥ 60天 | 未下单预警 | 红色 |

---

**卡片C：合规状态**

```
┌─────────────────────────────────────┐
│  合规状态              [查看合同 ↗] │
│─────────────────────────────────────│
│  合同到期                           │
│  ⚠ 年度框架合同  剩余 28 天         │
│    CN-2024-0892  到期：2026-07-08   │
│                                     │
│  ✓ 经销协议  剩余 95 天             │
│                                     │
│  返利协议                           │
│  ✓ 2026年度返利协议  已签署         │
│    签署日期：2026-01-15             │
└─────────────────────────────────────┘
```

| 剩余天数 | 颜色 |
|---------|------|
| > 60天 | 绿色 |
| 31-60天 | 橙色 |
| ≤ 30天 | 红色 |
| 已过期 | 深红 |

---

**卡片E：外部风险标签（Phase 1 演示数据）**

```
┌─────────────────────────────────────┐
│  外部风险                           │
│─────────────────────────────────────│
│  工商状态   ✓ 正常营业              │
│  司法风险   ✓ 无执行记录            │
│                                     │
│  数据更新：2026-06-09               │
│  来源：企查查（演示数据）            │
└─────────────────────────────────────┘
```

> Phase 1 直接手动写入 `Z_CUST_RISK_EXT` 表，页面加注"演示数据"。Phase 2 接入企查查 API 后去掉该标注，并增加税务处罚、股权变更等字段。

---

## 测试数据准备（第1周）

建5个测试客户（事务码 **XD01**），每个客户制造不同的预警状态：

| 测试客户 | 要造的数据 | 预警触发 | 涉及事务码 |
|---------|----------|---------|-----------|
| Z_TEST_001 | AR凭证逾期90天以上 | AR_STATUS = 3（严重） | XD01建客户 + F-22过账AR凭证（凭证日期设90天前） |
| Z_TEST_002 | 信用额度设100万，用掉92万 | CREDIT_STATUS = CRITICAL | XD01建客户并设信用额度 + VKM1查信用状态 |
| Z_TEST_003 | 最近一张销售订单日期设65天前 | INACTIVITY_ST = ALERT | VA01建一张老订单 |
| Z_TEST_004 | 合同到期日设20天后 | CONTRACT_ST = EXPIRY_15 | VA41建合同（AUART=KM），有效期结束日设近期 |
| Z_TEST_005 | 不创建任何返利协议 | REBATE_ST = UNSIGNED | 仅建客户，不做其他操作 |
| Z_TEST_000 | 全部正常，无任何预警 | 全部绿色（对照客户） | XD01建客户 + 建正常订单 |

> 建 AR 逾期凭证（Z_TEST_001）涉及 FI 模块，建议第1周内找财务顾问协助操作一次，之后自己可以照做。

---

## 工作流设计（端到端）

```
每日 00:00  SM36 定时 Job 触发
     │
     ├─ 读 BSID/BSAD → Z_C_AR_AGING_ALERT      → AR_STATUS / AR_OVD_xx
     ├─ 读 KNKK       → Z_C_CREDIT_UTILIZATION  → CREDIT_STATUS / CREDIT_UTIL
     ├─ 读 VBAK       → Z_C_CUSTOMER_INACTIVITY → DAYS_INACTIVE / INACTIVITY_ST
     ├─ 读 VKDFS      → Z_C_CONTRACT_EXPIRY     → CONTRACT_DAYS / CONTRACT_ST
     └─ 读 KONA       → Z_C_REBATE_STATUS       → REBATE_ST
                │
                ▼
         UPSERT Z_CUST_KPI_CACHE（全量刷新，写入当天计算结果）
                │
         ┌──────┴───────────────────────────────┐
         ▼                                      ▼
  预警中心页面                       Customer 360° View（F2187A）
  (SAP Build Apps)                  4张预警卡片 + 头部状态徽章
  列出所有触发预警的客户              单客户预警详情展示
         │
         ▼
  Fiori Launchpad KPI Tile
  汇总数字显示（如：严重逾期¥218万）

```

---

## 与智能分析组的接口约定

> 以下约定在**第2周会议**中双方确认，确认后不再修改字段名和类型。

| 约定项 | 内容 |
|--------|------|
| 表名 | `Z_CUST_KPI_CACHE` |
| 主键 | `MANDT + KUNNR + BUKRS + VKORG` |
| 刷新频率 | 每日一次，提醒组 Job 先写，分析组 Job 后补写 `RFM_SCORE / RFM_TIER` |
| 货币字段单位 | 人民币 CNY，存储单位：元 |
| 日期格式 | SAP DATS（`YYYYMMDD`） |
| 提醒组写入字段 | 见上方 Z 表结构中"智能提醒组写入字段"部分 |
| 分析组写入字段 | `RFM_SCORE`、`RFM_TIER` 及后续分析字段，由分析组维护 |
