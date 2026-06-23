---
date: 2026-06-12
type: code
tags: [ABAP, CDS, 未下单, 规则3]
---

# CDS View — 长期未下单（规则3）

> View 名：`Z_C_CUSTOMER_INACTIVITY`  
> 读取表：`VBAK`（销售订单头）  
> 输出：最近下单日期 + 未下单天数 + 活跃状态

---

## 代码

```cds
@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: '客户长期未下单预警'
@Metadata.ignorePropagatedAnnotations: true

define view entity Z_C_CUSTOMER_INACTIVITY
  as select from vbak
{
  key vkorg                                        as SalesOrg,
  key kunnr                                        as CustomerID,

  -- 最近一次下单日期
  max( audat )                                     as LastOrderDate,

  -- 未下单天数（今天 - 最近下单日）
  datediff(
    cast( $session.system_date as abap.dats ),
    cast( max( audat ) as abap.dats )
  )                                                as DaysInactive,

  -- 活跃状态
  case
    when datediff(
           cast( $session.system_date as abap.dats ),
           cast( max( audat ) as abap.dats )
         ) >= 60 then 'ALERT'
    when datediff(
           cast( $session.system_date as abap.dats ),
           cast( max( audat ) as abap.dats )
         ) >= 30 then 'WARNING'
    else              'ACTIVE'
  end                                              as InactivitySt

}
where
  -- 只统计正式销售订单，排除退货单和报价单
  auart in ( 'OR', 'ZOR' )
  -- 排除已被拒绝的订单
  and abgru = ' '

group by
  vkorg,
  kunnr
```

---

## 验证方法

```abap
SELECT * FROM z_c_customer_inactivity
  WHERE customerid = 'Z_TEST_003'
  AND salesorg = 'CN01'
  INTO TABLE @DATA(lt_result).

" 预期：Z_TEST_003 的 DaysInactive = 65（约），InactivitySt = 'ALERT'
```

---

## 注意事项

- `AUART`（订单类型）要和业务确认，九号公司实际使用的标准订单类型可能是 `OR` 或自定义的 `ZOR`，用 SE16N 查 VBAK 实际有哪些 AUART 值
- `ABGRU`（拒绝原因）为空格表示有效，不为空表示被拒绝的订单，不应算入"有效下单"
- 如果客户从没下过单（VBAK 无记录），这个 View 里不会出现该客户，批处理 Job 里需要对缺失的客户单独处理（`DAYS_INACTIVE` 写成极大值如 9999）
