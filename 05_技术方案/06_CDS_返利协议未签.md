---
date: 2026-06-12
type: code
tags: [ABAP, CDS, 返利协议, 规则5]
---

# CDS View — 年度返利协议未签（规则5）

> View 名：`Z_C_REBATE_STATUS`  
> 读取表：`KONA`（条件协议头）  
> 输出：当前财年返利协议是否已签署

---

## 代码

```cds
@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: '年度返利协议未签预警'
@Metadata.ignorePropagatedAnnotations: true

define view entity Z_C_REBATE_STATUS
  as select from kona
{
  key vkorg                                        as SalesOrg,
  key kunnr                                        as CustomerID,

  -- 当前财年内最新的返利协议编号（有则填，无则空）
  max( knuma_bo )                                  as RebateKnuma,

  -- 签署日期（取最新协议的开始日作为近似）
  max( datab )                                     as RebateSignDate,

  -- 返利协议状态
  case
    -- 在当前财年内存在激活状态（BOSTA='B'）的协议
    when max( case when bosta = 'B'
                    and datab <= $session.system_date
                    and datbi >= $session.system_date
                   then 1 else 0 end ) = 1
    then 'SIGNED'
    -- 协议存在但未激活（如草稿状态）
    when count(*) > 0 then 'DRAFT'
    -- 完全没有协议
    else 'UNSIGNED'
  end                                              as RebateSt

}
where
  -- 只看返利类协议类型（BO=标准返利，按实际类型调整）
  botyp in ( 'BO01', 'BO02', 'BO03' )
  -- 只看当前财年范围内的协议（财年1月1日到12月31日）
  and datbi >= cast( concat( left( $session.system_date, 4 ), '0101' ) as abap.dats )
  and datab <= cast( concat( left( $session.system_date, 4 ), '1231' ) as abap.dats )

group by
  vkorg,
  kunnr
```

---

## 关于返利协议表结构

返利协议的表比较分散，先用这个查询定位数据：

```abap
" 查某个客户的返利协议，确认表和字段
SELECT knuma_bo, kunnr, botyp, bosta, datab, datbi
  FROM kona
  WHERE kunnr = '你的测试客户'
  ORDER BY datab DESCENDING
  INTO TABLE @DATA(lt_rebate).

" BOSTA 字段含义：
"   A = 创建（草稿）
"   B = 已下达（激活）
"   C = 已结算
"   D = 已关闭
```

---

## 哪些客户不适用返利（NA处理）

批处理 Job 里补充：如果客户的客户分组（`KNA1.KTOKD`）不在需要管理返利的范围内，则将 `REBATE_ST` 写成 `'NA'`，不触发预警。

具体哪些客户分组需要返利管理，第1周内和业务确认。

---

## 验证方法

```abap
SELECT * FROM z_c_rebate_status
  WHERE customerid = 'Z_TEST_005'
  INTO TABLE @DATA(lt_result).

" 预期：Z_TEST_005 无任何返利协议，RebateSt = 'UNSIGNED'
```
