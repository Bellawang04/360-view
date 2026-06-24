
### 分工：
**一人负责数据层**（BTP OData + Z表接口），**一人负责 Build Apps 页面**。数据接口先定好结构，前端就可以用 mock 数据并行开发
### 核心逻辑：

```
SAP S/4HANA  ──OData API──▶  SAP Build Apps 前端
BTP AI Core  ──REST API──▶   （你自己设计的每一个页面）
BTP IS       ──数据同步──▶   Z 表 → BTP OData 暴露
```
### 页面设计
**页面1：客户列表总览**

搜索栏 / 筛选（RFM等级 / 风险状态 / 生命周期阶段）
─────────────────────────────────────────────
客户名称    销售额    RFM   生命周期   流失风险   操作
九号苏州    ¥28万     B级   成长期     低         [查看]
苏州博众    ¥19万     D级   衰退期     高⚠        [查看]
─────────────────────────────────────────────
**页面2：单客户 360° 详情页（你们设计，完全自由）**
六张卡片自由排版：

- 财务健康（AR账龄可视化）AR：Available receivable
- AI 洞察（RFM + 流失概率 + 生命周期）
- 销售活跃度（趋势图）
- 合规状态
- 外部风险
- 智能摘要（Joule / LLM 生成的一段自然语言总结）

**页面3：AI 洞察仪表盘（管理层）**
- A/B/C/D 分布饼图
- 流失风险热力图
- 需要干预的客户列表（可导出）
### 所有可用的 SAP AI 能力

| AI 能力                 | 接入方式            | 用在哪                            |
| --------------------- | --------------- | ------------------------------ |
| BTP AI Core（XGBoost）  | REST API        | 流失预测评分，每周批量跑，结果写回 Z 表          |
| BTP AI Core（K-Means）  | REST API        | RFM 聚类，替代规则分箱，更准               |
| SAP Joule             | Joule Studio 插件 | 自然语言提问："这个客户最近有什么风险？"          |
| ABAP AI SDK / BTP LLM | 调用 LLM          | 自动生成每个客户的风险摘要文字                |
| SAP Document AI       | REST API        | 合同文件上传后自动解析到期日                 |
| SAP Datasphere        | 数据层             | 把 S/4HANA + 外部数据统一成一个数据集给 AI 用 |
### 工作流设计（端到端）

每日00:00
   │
   ├─ ABAP Batch Job → 读 S/4HANA 表 → 写 Z_CUST_KPI_CACHE
   │   （AR账龄 / 信贷 / 合同 / 未下单 / 返利）
   │
   ├─ BTP AI Core 批量评分
   │   → 特征从 S/4HANA OData 抽取
   │   → XGBoost 推理 → 流失概率写入 Z_CUST_AI_SCORES
   │   → K-Means 聚类 → RFM_TIER 更新
   │
   └─ BTP Integration Suite
       → 企查查 API 拉取工商/司法数据
       → 写入 Z_CUST_RISK_EXT

用户打开页面
   │
   SAP Build Apps 调用 BTP OData API
   │
   ├─ 展示预计算好的所有指标（<1秒）
   │
   └─ 用户点「AI 分析」按钮
       → 调用 BTP LLM API
       → 传入该客户所有指标
       → 返回自然语言风险摘要
       → 显示在「智能摘要」卡片