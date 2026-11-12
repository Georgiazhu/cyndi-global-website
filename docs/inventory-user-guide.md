# 库存管理使用指南（Inventory User Guide）

适用范围：**Showcase（B2B 客户下单平台）** 的广州仓 SKU 级库存。
公开商城（shop）不受影响，不计库存。

本指南面向后台管理员（admin）。阶段一（Phase 1）已上线的功能见下文；标注 _(Phase 2)_ 的为后续版本。

---

## 1. 核心概念

### 1.1 库存按"变体（SKU）"计数
一个变体 = 一个商品的 **颜色 × 尺码** 组合（例如 `黑色 / M`）。每个变体有独立的库存数。

- **某变体在库存表里有记录 → 计库存**：前台显示实时数量，缺货会拦截下单。
- **没有记录 → 不计库存**：按单生产 / 不限量，行为和以前一样。

也就是说，库存是"选择性开启"的——你只给需要实时管控的变体开启跟踪，其余维持按单生产。

### 1.2 四个数量桶
每个变体的库存分成四桶：

| 桶 | 含义 | 谁来改（Phase 1） |
|---|---|---|
| **Available 可售** | 当前可下单的数量，前台显示 "N in stock" | admin 手动维护 |
| **Reserved 已预留** | 已下单、尚未发货的数量 | 系统自动（下单 / 取消 / 发货时） |
| **Incoming 在途** | 采购/补货在路上、还没到仓 | _(Phase 2)_ 只读 |
| **Damaged 残次** | 残次、不可售 | _(Phase 2)_ 只读 |

> 单仓假设：目前唯一仓库是广州，不区分仓库。

### 1.3 库存怎么随订单变动
以某变体 available=100 为例：

1. 客户下单 1 件 → **available 99，reserved 1**（系统记一条 `Order placed`）。
2. 客户在发货前取消 → **available 100，reserved 0**（`Order cancelled`，预留回滚）。
3. admin 把订单状态改成 **shipped** → **reserved 0，发出 1 件**（`Shipped out`，从 reserved 真正扣减出库；该变体 Total shipped +1）。

**缺货拦截**：若下单数量超过 available，系统拒绝该订单（前台提示缺货）。

---

## 2. 日常操作（Phase 1）

后台入口：**Admin → Inventory**。

### 2.1 开启某商品的库存跟踪
1. 在 Inventory 页搜索并点开目标商品。
2. 看到该商品的 **颜色 × 尺码矩阵**（每个变体一行）。
3. 对要管控的变体点击 **开启跟踪（Track）**，填写原因（可选）。
4. 开启后该变体即计库存，初始 available 为 0，记一条 `Tracking enabled`。

> 仅对需要实时管控的变体开启。未开启的变体继续按单生产。

### 2.2 设定可售数量（Set）
用于盘点后直接写定一个准确数字。
- 填入 available 目标值 + 原因（必填）。
- 采用乐观锁：若期间数据被别处改动，会提示冲突、让你重新确认，避免覆盖。
- 记一条 `Stock set`。

### 2.3 增减可售数量（Adjust）
用于在当前基础上 +N / −N（如到货补入、损耗扣减）。
- 填入增量（可正可负）+ 原因（必填）。
- 记一条 `Adjusted`。

### 2.4 设置低库存阈值（Threshold）
- 给变体设一个阈值；available 低于它时，矩阵里该变体标记为 **Low stock**。
- 清空阈值即取消提醒。
- 记一条 `Low-stock threshold`。
- Phase 1 只在页面上标记，不发邮件。主动提醒见 _(Phase 2)_。

### 2.5 发货扣减（在 Orders 页，非 Inventory 页）
库存的出库动作由订单驱动，入口在 **Admin → Orders**：
- 把订单状态改为 **shipped** → 对应变体从 reserved 扣减、Total shipped 增加。
- 若误操作把 shipped 撤回 → 预留恢复（`Shipment reversed`）。

> admin **不直接编辑 reserved**；它只由订单流程变动。

---

## 3. 读懂 Inventory 页面

### 3.1 库存矩阵
每个变体一行，列出 Available / Reserved / Total shipped / Threshold 等。
- **Total shipped**：该变体历史累计发出的数量（只读，来自发货流水）。
- **N of M**：如 "Low stock 2 of 5" 表示 5 个变体里有 2 个处于低库存；"Out of stock 1 of 5" 表示 1 个已售罄。

### 3.2 Stock history（库存流水）面板
记录每一次库存变动，一次事件一行，可读到：
Time（时间）｜Event（事件）｜Variant（变体）｜Change（各桶增减）｜Balance after（变动后余额）｜Order no（关联订单号）｜Reason（原因）。

- 点击矩阵里某个变体行，可**只看该变体的历史**；点 "Show all variants" 回到全部。
- 最多显示最近 50 条。

### 3.3 事件类型（Event）对照
| Event | 含义 | 来源 |
|---|---|---|
| Tracking enabled | 开启跟踪 | admin |
| Stock set | 设定可售数 | admin |
| Adjusted | 增减可售数 | admin |
| Low-stock threshold | 改阈值 | admin |
| Order placed | 下单预留 | 系统（客户下单） |
| Order cancelled | 取消回滚 | 系统（订单取消） |
| Shipped out | 发货扣减 | admin 改订单为 shipped 时触发 |
| Shipment reversed | 撤回发货 | 系统 |
| Relinked to product | 变体重新关联 | 系统 |

> 面板里还预留了 Tracking stopped / Stocktake / Incoming expected / Received into stock / Marked damaged / Repaired / Written off 等标签，属于 _(Phase 2)_，Phase 1 不会产生。

---

## 4. 常见情况

**Q：之前已有未发货的订单，现在才给这个变体开启跟踪，reserved 对吗？**
A：开启跟踪时系统不会自动回填历史订单的预留（变体身份无法可靠匹配，自动回填有风险）。页面会**提醒有未发货订单并显示每变体数量**，请你据此手动用 Adjust 扣减，使 available/reserved 与实际相符。

**Q：客户下单时提示缺货？**
A：下单数量超过该变体 available。请确认是否需要补货并用 Adjust/Set 增加可售数。

**Q：某变体不想再计库存了？**
A：Phase 1 暂无"停止跟踪"入口，见 _(Phase 2)_ 的 Tracking stopped。临时办法：联系开发或等 Phase 2。

---

## 5. Phase 2 预告（尚未上线）
- Incoming（在途）录入与到货入库（`incoming` / `receive`）
- Damaged（残次）标记、修复、报废（`damage` / `repair` / `writeoff`）
- 低库存**邮件提醒**
- 停止跟踪（`untrack`）、整仓盘点（`stocktake`）
- 出货 / 销售报表与导出
- 仓库角色权限与库存操作审计

---

_文档版本：Phase 1。如功能有更新，请同步修订本指南。_
