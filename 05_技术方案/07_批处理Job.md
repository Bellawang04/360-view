---
date: 2026-06-12
type: code
tags: [ABAP, 批处理, Job, SM36]
---

# 批处理 Job — 每日刷新缓存表

> 程序名：`Z_CUST_KPI_BATCH`  
> 功能：每日 00:00 读取5个 CDS View，UPSERT 写入 `Z_CUST_KPI_CACHE`  
> 注册方式：SM36（事务码）

---

## 完整代码

```abap
REPORT z_cust_kpi_batch.

" ============================================================
" 参数：支持指定客户范围（默认全量）
" ============================================================
SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
  SELECT-OPTIONS: s_kunnr FOR kna1-kunnr,    " 客户范围
                  s_bukrs FOR t001-bukrs,    " 公司代码范围
                  s_vkorg FOR tvko-vkorg.    " 销售组织范围
SELECTION-SCREEN END OF BLOCK b1.

" ============================================================
" 类型声明
" ============================================================
TYPES:
  BEGIN OF ty_customer,
    kunnr TYPE kunnr,
    bukrs TYPE bukrs,
    vkorg TYPE vkorg,
  END OF ty_customer.

DATA:
  lt_customers  TYPE STANDARD TABLE OF ty_customer,
  ls_cust       TYPE ty_customer,
  ls_ar         TYPE z_c_ar_aging_alert,
  ls_credit     TYPE z_c_credit_utilization,
  ls_inactive   TYPE z_c_customer_inactivity,
  ls_contract   TYPE z_c_contract_expiry,
  ls_rebate     TYPE z_c_rebate_status,
  lv_processed  TYPE i,
  lv_errors     TYPE i.

" ============================================================
" 主程序
" ============================================================
START-OF-SELECTION.

  " Step 1：取所有客户（或指定范围）
  SELECT kna1~kunnr, t001~bukrs, tvko~vkorg
    FROM kna1
    JOIN knvv ON knvv~kunnr = kna1~kunnr
    JOIN t001 ON t001~bukrs = knvv~bukrs   " 按实际join条件调整
    JOIN tvko ON tvko~vkorg = knvv~vkorg
    WHERE kna1~kunnr IN @s_kunnr
      AND t001~bukrs  IN @s_bukrs
      AND tvko~vkorg  IN @s_vkorg
    INTO TABLE @lt_customers.

  WRITE: / '客户总数:', lines( lt_customers ).

  " Step 2：逐客户计算并写入缓存表
  LOOP AT lt_customers INTO ls_cust.

    " --- 规则1：AR账龄 ---
    SELECT SINGLE *
      FROM z_c_ar_aging_alert
      WHERE companycode = @ls_cust-bukrs
        AND customerid  = @ls_cust-kunnr
      INTO @ls_ar.

    " --- 规则2：信用额度 ---
    SELECT SINGLE *
      FROM z_c_credit_utilization
      WHERE customerid = @ls_cust-kunnr
      ORDER BY creditutil DESCENDING  " 取占用率最高的信控范围
      INTO @ls_credit.

    " --- 规则3：未下单 ---
    SELECT SINGLE *
      FROM z_c_customer_inactivity
      WHERE salesorg   = @ls_cust-vkorg
        AND customerid = @ls_cust-kunnr
      INTO @ls_inactive.

    " 从没下过单的客户在 View 里不存在，特殊处理
    IF sy-subrc <> 0.
      CLEAR ls_inactive.
      ls_inactive-daysinactive = 9999.
      ls_inactive-inactivityst = 'ALERT'.
    ENDIF.

    " --- 规则4：合同到期 ---
    SELECT SINGLE *
      FROM z_c_contract_expiry
      WHERE salesorg   = @ls_cust-vkorg
        AND customerid = @ls_cust-kunnr
      INTO @ls_contract.

    " --- 规则5：返利协议 ---
    SELECT SINGLE *
      FROM z_c_rebate_status
      WHERE salesorg   = @ls_cust-vkorg
        AND customerid = @ls_cust-kunnr
      INTO @ls_rebate.

    " --- 写入缓存表（UPSERT：存在更新，不存在插入）---
    MODIFY z_cust_kpi_cache FROM @(
      VALUE z_cust_kpi_cache(
        mandt             = sy-mandt
        kunnr             = ls_cust-kunnr
        bukrs             = ls_cust-bukrs
        vkorg             = ls_cust-vkorg
        calc_date         = sy-datum
        last_upd_time     = sy-uzeit
        " 规则1
        ar_current        = ls_ar-arcurrent
        ar_ovd_30         = ls_ar-arovd30
        ar_ovd_60         = ls_ar-arovd60
        ar_ovd_90         = ls_ar-arovd90
        ar_ovd_180        = ls_ar-arovd180
        ar_waers          = ls_ar-currency
        ar_status         = ls_ar-arstatus
        " 规则2
        credit_limit      = ls_credit-creditlimit
        credit_used       = ls_credit-creditused
        credit_waers      = ls_credit-currency
        credit_util       = ls_credit-creditutil
        credit_status     = ls_credit-creditstatus
        " 规则3
        last_order_date   = ls_inactive-lastorderdate
        days_inactive     = ls_inactive-daysinactive
        inactivity_st     = ls_inactive-inactivityst
        " 规则4
        contract_vbeln    = ls_contract-contractvbeln    " 按实际字段名调整
        contract_exp_date = ls_contract-contractexpdate
        contract_days     = ls_contract-contractdays
        contract_st       = ls_contract-contractst
        " 规则5
        rebate_knuma      = ls_rebate-rebateknuma
        rebate_st         = ls_rebate-rebatest
        rebate_sign_date  = ls_rebate-rebatesigndate
      )
    ).

    IF sy-subrc = 0.
      ADD 1 TO lv_processed.
    ELSE.
      ADD 1 TO lv_errors.
      WRITE: / 'ERROR 客户:', ls_cust-kunnr.
    ENDIF.

  ENDLOOP.

  " Step 3：提交
  COMMIT WORK.

  " Step 4：输出日志
  WRITE: /
    '执行完成。处理:', lv_processed,
    '成功  错误:', lv_errors.
```

---

## SM36 注册每日定时执行

```
1. 事务码：SM36
2. Job name：Z_CUST_360_DAILY
3. Job class：C（后台普通级）
4. Step：
   → Program/report name：Z_CUST_KPI_BATCH
   → Variant：（可选，用于限定公司代码范围）
5. Start condition：
   → 选 Date/Time
   → Date：明天日期
   → Time：00:30:00（避开整点，减少系统负载）
   → 勾选 Periodic Job → Period：Daily
6. 保存
```

---

## SM37 查执行日志

```
事务码：SM37
→ Job name：Z_CUST_360_DAILY
→ 查看最近一次执行状态
→ 点击 Job log 看详细日志
→ 绿色 Finished 表示成功
→ 红色 Aborted 看错误信息
```

---

## 调试技巧

第一次运行建议手动执行（SE38 → 输入程序名 → F8），加上单客户参数验证结果：

```
S_KUNNR = Z_TEST_001 to Z_TEST_005
S_BUKRS = CN01
```

执行后用 SE16N 查 `Z_CUST_KPI_CACHE`，核对每个测试客户的字段值是否符合预期。
