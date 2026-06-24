---
date: 2026-06-12
type: code
tags: [ABAP, CDS, 信用额度, 规则2]
---

# CDS View — 信用额度预警（规则2）

> View 名：`Z_C_CREDIT_UTILIZATION`  
> 读取表：`KNKK`（客户信用管理）  
> 输出：信用占用率 + 状态等级 CREDIT_STATUS

---

## 代码

```cds
@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: '信用额度占用预警'
@Metadata.ignorePropagatedAnnotations: true

define view entity Z_C_CREDIT_UTILIZATION
  as select from knkk
{
  key mandt                                        as Client,
  key kunnr                                        as CustomerID,
  key kkber                                        as CreditControlArea,

  -- 信用额度上限（KLIMK=0 表示未设置额度，需特殊处理）
  klimk                                            as CreditLimit,

  -- 当前已用额度（SKFOR = 已开放订单金额 + 未清发票金额）
  skfor                                            as CreditUsed,

  -- 货币
  waers                                            as Currency,

  -- 占用率%（额度为0时设为-1，表示无额度不适用）
  cast(
    case
      when klimk = 0 then cast( -1 as abap.dec(5,2) )
      else cast( skfor / klimk * 100 as abap.dec(5,2) )
    end
  as abap.dec(5,2) )                               as CreditUtil,

  -- 状态（额度为0时标记 NA，其余按占用率分级）
  case
    when klimk = 0              then 'NA'
    when skfor >= klimk         then 'EXCEEDED'
    when skfor / klimk >= 0.85  then 'CRITICAL'
    when skfor / klimk >= 0.70  then 'WARNING'
    else                             'NORMAL'
  end                                              as CreditStatus

}
where
  -- 过滤掉未激活的信用控制范围记录
  klimk > 0 or skfor > 0
```

---

## 验证方法

```abap
SELECT * FROM z_c_credit_utilization
  WHERE customerid = 'Z_TEST_002'
  INTO TABLE @DATA(lt_result).

" 预期：Z_TEST_002 的 CreditUtil ≈ 92.00，CreditStatus = 'CRITICAL'
```

---

## 注意事项

- `KNKK.KKBER` 是信用控制范围（Credit Control Area），一个客户可能在多个范围有记录，取最高风险那条即可（批处理 Job 里处理）
- `KNKK.SKFOR` 包含：已开立但未收款的发票 + 未交货的销售订单金额，是综合占用额
- 如果 `KLIMK = 0` 说明这个客户没有设置信用额度，不应触发预警，标记 `NA`
- 某些客户是"无限额度"（设了极大值如 99,999,999），也不应触发预警，可按业务约定加过滤条件
