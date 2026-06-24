# 客户360°视图 — 前端 Demo

乙方公司 · SAP S/4HANA POC · 智能提醒组 + 智能分析组

---

## 快速启动

**前提：** 已安装 Node.js（v18+）

```bash
# 进入项目目录
cd "360 POC/360-view/frontend"

# 安装依赖（首次运行需要）
npm install

# 启动开发服务器
npm start
```

启动后浏览器自动打开，或手动访问：

```
http://localhost:8080/index.html
```

> 如果 8080 端口被占用，指定其他端口：
> ```bash
> npx ui5 serve --port 8091
> ```

---

## 页面说明

| 页面 | URL | 说明 |
|------|-----|------|
| Launchpad 主页 | `#` | 三角色视图 + KPI 预警 Tile + 客户列表 |
| 客户360°详情页 | `#/customer/{客户号}` | 客户全貌，6张卡片 |
| 客户总览列表 | `#/customers` | 可按风险/RFM等级筛选 |

**演示用的 Mock 客户直达链接：**

| 客户 | 场景 | URL |
|------|------|-----|
| 乙方机器人（苏州）B级 | 合约28天到期、AR逾期 | `#/customer/0001002345` |
| 苏州精工精密工业 D级 | 最典型高风险：90天逾期+信贷超额+87天未下单+返利未签 | `#/customer/0001003421` |
| 上海辉度智能科技 A级 | 全绿健康客户（演示对比用） | `#/customer/0001004890` |

---

## 项目结构

```
frontend/
├── webapp/
│   ├── controller/
│   │   ├── Launchpad.controller.ts    # 主页逻辑（KPI Tile 点击、客户列表跳转）
│   │   ├── Customer360.controller.ts  # 360°详情页逻辑（加载客户数据）
│   │   └── CustomerList.controller.ts # 客户列表筛选逻辑
│   ├── view/
│   │   ├── Launchpad.view.xml         # 主页（三角色 Tab + KPI Tile + 客户列表）
│   │   ├── Customer360.view.xml       # 360°详情页（头部徽章 + 6张卡片）
│   │   └── CustomerList.view.xml      # 客户总览列表
│   ├── model/
│   │   └── app.json                   # ← 所有 Mock 数据在这里，改这个文件换数据
│   ├── Component.ts                   # 应用入口，负责加载数据
│   └── manifest.json                  # 路由配置（三个页面的 URL 规则）
├── package.json
└── README.md
```

---

## 当前数据来源

**所有数据来自 `webapp/model/app.json`，为本地静态 Mock 数据，不连接任何 SAP 系统。**

文件包含两部分：

**1. KPI 汇总数据**（Launchpad Tile 显示的数字）
```json
{
  "kpiTiles": {
    "highRisk": 12,         // 高流失风险客户数
    "contractExpiry": 7,    // 30天内合约到期客户数
    "externalRisk": 3,      // 外部风险客户数
    "longInactive": 5       // 长期未拜访客户数
  }
}
```

**2. 客户详情列表**（Customer 360°页面的所有卡片数据）
```json
{
  "customers": [
    {
      "id": "0001002345",       // 客户号（改成 SAP 系统里真实的）
      "name": "乙方机器人...",
      "rfmTier": "B",           // RFM等级：A/B/C/D
      "ar30": 32000,            // 30天逾期金额（元）
      "ar60": 18000,            // 60天逾期金额
      "ar90": 5000,             // 90天+逾期金额
      "creditUtil": 78,         // 信贷占用率（%）
      "daysInactive": 12,       // 距上次下单天数
      "contractDays": 28,       // 合同剩余天数
      "rebateSt": "SIGNED",     // 返利协议状态：SIGNED/UNSIGNED/NA
      "externalRiskLevel": 0    // 外部风险等级：0=正常 1=关注 2=高危
    }
  ]
}
```

> **要换成真实数据：** 直接修改 `app.json` 里的客户号和字段值即可，页面实时刷新。

---

## 接口改造计划（接入 SAP 真实数据）

### 第一步：ABAP 侧暴露 OData Service（智能提醒组负责）

创建 OData Service `Z_CUST_KPI_SRV`，读取批量 Job 写入的缓存表 `Z_CUST_KPI_CACHE`：

| EntitySet | 对应 SAP 表 | 关键字段 |
|-----------|------------|---------|
| `CustomerKpiSet` | `Z_CUST_KPI_CACHE` | `AR_STATUS`、`CREDIT_UTIL`、`DAYS_INACTIVE`、`CONTRACT_ST`、`RFM_TIER` |
| `CustomerSet` | `KNA1` + KPI 缓存 | 客户基础信息 + KPI 汇总 |

### 第二步：前端替换数据加载（改 1 个文件）

修改 `webapp/Component.ts`，把静态文件读取换成 OData 调用：

```typescript
// 改造前（当前方式，读本地 JSON）
const xhr = new XMLHttpRequest();
xhr.open("GET", "model/app.json", false);
xhr.send();
this.setModel(new JSONModel(JSON.parse(xhr.responseText)), "app");

// 改造后（接 SAP OData Service）
import ODataModel from "sap/ui/model/odata/v2/ODataModel";
const model = new ODataModel("/sap/opu/odata/sap/Z_CUST_KPI_SRV/");
this.setModel(model, "app");
```

同时把视图里的绑定路径从 `{app>/customers}` 改为 `{app>/CustomerSet}`。

### 第三步：激活 SAP 标准 App（Basis 系统管理员负责）

| App 名称 | App ID | 需要激活的 OData Service |
|---------|--------|------------------------|
| Customer 360° View | F2187A | `API_BUSINESS_PARTNER` 等 |
| Customer Overview 列表 | F4645 | `C_CUSTOMER_FS_V2` |

激活路径：`/IWFND/MAINT_SERVICE` → 激活 Service → Fiori Launchpad Designer 配置 Catalog + Role → 给用户分配 Role

### 工作量估算

| 工作项 | 负责方 | 预计时间 |
|--------|--------|---------|
| 创建 `Z_CUST_KPI_SRV` OData Service | 智能提醒组（ABAP） | 1 天 |
| Component.ts 换 ODataModel + 视图路径调整 | 前端 | 半天 |
| 激活 F2187A / F4645 标准 App | Basis 管理员 | 半天 |

---

## 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| SAPUI5 | 1.136.19（LTS） | 前端框架，SAP Horizon 主题 |
| TypeScript | - | 类型安全 |
| UI5 Tooling | - | 本地开发服务器 |

无需连接 SAP 系统即可本地运行。

---

*乙方公司 · SAP S/4HANA 2024/2025 PCE · 客户360°视图 POC · 2026-06*
