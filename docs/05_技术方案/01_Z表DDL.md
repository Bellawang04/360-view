---
date: 2026-06-12
type: code
tags: [ABAP, DDL, Z表]
---

# Z表 DDL — 缓存表建表语句

> 在 Eclipse ADT 中：右键包 → New → Other ABAP Repository Object → Dictionary → Database Table  
> 表名：`Z_CUST_KPI_CACHE`

---

## 建表 DDL（直接粘贴到 ADT）

```abap
@EndUserText.label : '客户360预警KPI缓存表'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table z_cust_kpi_cache {

  " === 主键 ===
  key mandt          : mandt not null;
  key kunnr          : kunnr not null;     " 客户编号
  key bukrs          : bukrs not null;     " 公司代码
  key vkorg          : vkorg not null;     " 销售组织

  " === 元数据 ===
  calc_date          : dats;               " 计算日期
  last_upd_time      : tims;               " 最后更新时间

  " === 规则1：AR账龄逾期 ===
  ar_current         : abap.curr(15,2);    " 未逾期应收金额
  ar_ovd_30          : abap.curr(15,2);    " 逾期30天内金额
  ar_ovd_60          : abap.curr(15,2);    " 逾期31-60天金额
  ar_ovd_90          : abap.curr(15,2);    " 逾期61-90天金额
  ar_ovd_180         : abap.curr(15,2);    " 逾期90天以上金额
  ar_waers           : waers;              " 货币单位（货币字段必须配此参考字段）
  ar_status          : abap.int1;          " 0=正常 1=预警 2=高危 3=严重

  " === 规则2：信用额度预警 ===
  credit_limit       : abap.curr(15,2);    " 信用额度上限
  credit_used        : abap.curr(15,2);    " 当前已用额度
  credit_waers       : waers;              " 货币单位
  credit_util        : abap.dec(5,2);      " 占用率%（如 78.50）
  credit_status      : abap.char(10);      " NORMAL/WARNING/CRITICAL/EXCEEDED

  " === 规则3：长期未下单 ===
  last_order_date    : dats;               " 最近一次下单日期
  days_inactive      : abap.int4;          " 距今天数
  inactivity_st      : abap.char(8);       " ACTIVE/WARNING/ALERT

  " === 规则4：合同快到期 ===
  contract_vbeln     : vbeln;              " 最近到期合同编号
  contract_name      : abap.char(40);      " 合同描述
  contract_exp_date  : dats;              " 到期日
  contract_days      : abap.int4;          " 剩余天数（负=已过期）
  contract_st        : abap.char(12);      " NORMAL/EXPIRY_60/EXPIRY_30/EXPIRY_15/EXPIRED

  " === 规则5：年度返利协议 ===
  rebate_knuma       : abap.char(10);      " 返利协议编号（无则空）
  rebate_st          : abap.char(8);       " SIGNED/UNSIGNED/NA
  rebate_sign_date   : dats;              " 签署日期

  " === 智能分析组写入（由他们维护，此处预留） ===
  rfm_score          : abap.dec(4,1);      " RFM综合评分 3.0~15.0
  rfm_tier           : abap.char(1);       " A/B/C/D

}
```

---

## SE11 建表替代方式（如果 ADT 不顺畅）

```
事务码：SE11
→ 选 Database Table → 输入 Z_CUST_KPI_CACHE → Create
→ 手动逐个填字段（字段名 / 数据类型 / 长度）
→ 参考上面 DDL 的字段清单
→ 激活（Ctrl+F3）
```

---

## 建完后验证

```abap
" SE16N 查表，确认表结构正确，此时应为空表
SELECT * FROM z_cust_kpi_cache UP TO 1 ROWS INTO TABLE @DATA(lt_test).
" 能查到（即便是空结果）说明表建成功
```

---

## 同步给智能分析组

建完表后，把以下内容发给分析组确认：

```
表名：Z_CUST_KPI_CACHE
主键：MANDT + KUNNR + BUKRS + VKORG
提醒组负责写入的字段：AR_* / CREDIT_* / DAYS_INACTIVE / INACTIVITY_ST / CONTRACT_* / REBATE_*
分析组负责写入的字段：RFM_SCORE / RFM_TIER
货币单位字段：AR_WAERS / CREDIT_WAERS（写入时必须同步填写）
刷新频率：每日 00:00，提醒组 Job 先执行
```
