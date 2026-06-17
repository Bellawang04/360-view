---
date: 2026-06-12
type: code
tags: [ABAP, CDS, AR账龄, 规则1]
---

# CDS View — AR账龄逾期（规则1）

> View 名：`Z_C_AR_AGING_ALERT`  
> 读取表：`BSID`（客户未清AR凭证）  
> 输出：每个客户各账龄段的逾期金额 + 综合等级 AR_STATUS

---

## 代码（粘贴到 ADT → New CDS View）

```cds
@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'AR账龄逾期预警'
@Metadata.ignorePropagatedAnnotations: true

define view entity Z_C_AR_AGING_ALERT
  as select from bsid
{
  key bukrs                                        as CompanyCode,
  key kunnr                                        as CustomerID,

  -- 货币
  waers                                            as Currency,

  -- 未逾期：净到期日 >= 今天
  sum( case
    when datediff( cast( $session.system_date as abap.dats ),
                   cast( zfbdt as abap.dats ) ) <= 0
    then dmbtr else 0 end )                        as ArCurrent,

  -- 逾期1-30天
  sum( case
    when datediff( cast( $session.system_date as abap.dats ),
                   cast( zfbdt as abap.dats ) ) between 1 and 30
    then dmbtr else 0 end )                        as ArOvd30,

  -- 逾期31-60天
  sum( case
    when datediff( cast( $session.system_date as abap.dats ),
                   cast( zfbdt as abap.dats ) ) between 31 and 60
    then dmbtr else 0 end )                        as ArOvd60,

  -- 逾期61-90天
  sum( case
    when datediff( cast( $session.system_date as abap.dats ),
                   cast( zfbdt as abap.dats ) ) between 61 and 90
    then dmbtr else 0 end )                        as ArOvd90,

  -- 逾期90天以上
  sum( case
    when datediff( cast( $session.system_date as abap.dats ),
                   cast( zfbdt as abap.dats ) ) > 90
    then dmbtr else 0 end )                        as ArOvd180,

  -- 综合等级（0=正常 1=预警 2=高危 3=严重）
  cast(
    case
      when sum( case when datediff( cast( $session.system_date as abap.dats ),
                                    cast( zfbdt as abap.dats ) ) > 90
                     then dmbtr else 0 end ) > 0 then 3
      when sum( case when datediff( cast( $session.system_date as abap.dats ),
                                    cast( zfbdt as abap.dats ) ) between 61 and 90
                     then dmbtr else 0 end ) > 0 then 2
      when sum( case when datediff( cast( $session.system_date as abap.dats ),
                                    cast( zfbdt as abap.dats ) ) between 1 and 60
                     then dmbtr else 0 end ) > 0 then 1
      else 0
    end
  as abap.int1 )                                   as ArStatus

}
where
  -- 只取应收类科目，排除贷项
  koart = 'D'
  and shkzg = 'S'

group by
  bukrs,
  kunnr,
  waers
```

---

## 验证方法

```abap
" ADT 中按 F8 预览，或在 SE16N 执行以下 ABAP：
SELECT * FROM z_c_ar_aging_alert
  WHERE customerid = 'Z_TEST_001'  " 替换为你的测试客户
  INTO TABLE @DATA(lt_result).

" 预期：Z_TEST_001 的 ArOvd90 > 0，ArStatus = 3
```

---

## 注意事项

- `BSID.ZFBDT` 是**净到期日**（已考虑付款条款），不是凭证日期 `BLDAT`，账龄要用这个
- `SHKZG = 'S'` 过滤借方（应收），`'H'` 是贷方（预付款/贷项），不计入逾期
- 如果 `ZFBDT` 为空，部分系统会用 `BUDAT`（过账日）代替，视项目实际调整
- `$session.system_date` 在 CDS View 里取系统当前日期，不需要传参
