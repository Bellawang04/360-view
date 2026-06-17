---
date: 2026-06-12
type: code
tags: [ABAP, CDS, 合同到期, 规则4]
---

# CDS View — 合同快到期（规则4）

> View 名：`Z_C_CONTRACT_EXPIRY`  
> 读取表：`VBAK`（合同头，AUART = 合同类型）  
> 输出：最近到期合同的剩余天数 + 状态

---

## 代码

```cds
@AbapCatalog.viewEnhancementCategory: [#NONE]
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: '合同快到期预警'
@Metadata.ignorePropagatedAnnotations: true

-- 先用子查询找出每个客户最近到期的合同
define view entity Z_C_CONTRACT_EXPIRY
  as select from vbak as contract
    inner join vbkd as billing                     -- 合同销售数据（含到期日）
      on  contract.vbeln = billing.vbeln
      and billing.posnr  = '000000'               -- 头行
{
  key contract.vkorg                               as SalesOrg,
  key contract.kunnr                               as CustomerID,

  -- 取该客户到期日最近的那张合同
  min( billing.bstdk )                             as ContractExpDate,  -- 到期日（按实际字段调整）

  -- 剩余天数（负值=已过期）
  datediff(
    cast( min( billing.bstdk ) as abap.dats ),
    cast( $session.system_date as abap.dats )
  )                                                as ContractDays,

  -- 合同到期状态
  case
    when datediff(
           cast( min( billing.bstdk ) as abap.dats ),
           cast( $session.system_date as abap.dats )
         ) < 0   then 'EXPIRED'
    when datediff(
           cast( min( billing.bstdk ) as abap.dats ),
           cast( $session.system_date as abap.dats )
         ) <= 15  then 'EXPIRY_15'
    when datediff(
           cast( min( billing.bstdk ) as abap.dats ),
           cast( $session.system_date as abap.dats )
         ) <= 30  then 'EXPIRY_30'
    when datediff(
           cast( min( billing.bstdk ) as abap.dats ),
           cast( $session.system_date as abap.dats )
         ) <= 60  then 'EXPIRY_60'
    else               'NORMAL'
  end                                              as ContractSt

}
where
  -- 合同类型：KM=主框架合同，按九号公司实际类型调整
  contract.auart in ( 'KM', 'ZKM' )
  -- 排除已删除/已拒绝合同
  and contract.abgru = ' '
  -- 只看未来60天内到期的，减少扫描量
  and datediff(
        cast( billing.bstdk as abap.dats ),
        cast( $session.system_date as abap.dats )
      ) <= 60

group by
  contract.vkorg,
  contract.kunnr
```

---

## 关于合同到期日字段

SAP 合同的到期日字段在不同版本存储位置不一样，需要进系统确认：

| 可能位置 | 字段 | 说明 |
|---------|------|------|
| `VBKD.BSTDK` | 采购订单日期 | 部分系统存到期日在这里 |
| `VEDA.VDATU` | 合同开始日 | `VEDA` 是合同专用表 |
| `VEDA.VBDAT` | 合同结束日 | **最常见的到期日字段** |
| `VBKD.KDATB` | 有效期截止日 | 也是常见字段 |

**上机后第一步**：用 SE16N 查 `VEDA` 表（合同有效期），看里面有没有数据，如果有，`VBDAT` 就是到期日。代码中把 `billing.bstdk` 替换成对应字段即可。

```abap
" 快速验证：找一张合同，看到期日在哪
SELECT vbeln, vdatu, vbdat FROM veda
  WHERE vbeln = '你的合同编号'
  INTO TABLE @DATA(lt_veda).
```

---

## 验证方法

```abap
SELECT * FROM z_c_contract_expiry
  WHERE customerid = 'Z_TEST_004'
  INTO TABLE @DATA(lt_result).

" 预期：ContractDays ≈ 20，ContractSt = 'EXPIRY_15' 或 'EXPIRY_30'
```
