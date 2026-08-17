# Logistics API

物流页面位于 `catalog/logistics.html`。页面会优先请求线上接口，接口没有记录时才读取 `data/logistics.json` 中的演示数据。

## 查询接口

```http
GET /api/logistics?productNo=CY-THERMOS-001
Accept: application/json
```

成功时可以直接返回物流对象，也可以包在 `data` 字段中：

```json
{
  "productNo": "CY-THERMOS-001",
  "productName": "Cyndi Thermal Bottle Gift Set",
  "productNameZh": "Cyndi 保温杯礼盒",
  "status": "in_transit",
  "lastUpdated": "2026-08-10T09:30:00+08:00",
  "origin": "Shenzhen, China",
  "originZh": "中国 · 深圳",
  "destination": "Hong Kong, China",
  "destinationZh": "中国 · 香港",
  "carrier": "Cyndi Global Logistics",
  "trackingNo": "CYG20260810001",
  "eta": "2026-08-13",
  "packages": 12,
  "quantity": 480,
  "warehouseLocation": "HK Warehouse · A-03-18",
  "warehouseLocationZh": "香港仓 · A-03-18",
  "warehouseUpdated": "2026-08-09T16:20:00+08:00",
  "events": [
    {
      "time": "2026-08-10T09:30:00+08:00",
      "status": "current",
      "title": "Shipment in transit",
      "titleZh": "货物运输中",
      "description": "The shipment has departed the Shenzhen distribution centre.",
      "descriptionZh": "货物已离开深圳分拨中心。",
      "location": "Shenzhen, China",
      "locationZh": "中国 · 深圳"
    }
  ],
  "warehouseImages": [
    {
      "url": "https://your-cdn.example.com/warehouse/CY-THERMOS-001-01.jpg",
      "caption": "Packed cartons ready for dispatch",
      "captionZh": "已打包、待发运的纸箱",
      "date": "2026-08-09"
    }
  ]
}
```

`status` 可使用 `in_transit`、`delivered`、`stored`、`production` 或 `pending`。图片建议上传到对象存储或 CDN，再将可公开访问的 HTTPS 地址写入 `warehouseImages[].url`。若接口部署在不同域名，需要允许 `https://www.cyndiglobal.com` 的 CORS 请求。

## 数据库建议

可以用三张表维护：`logistics_shipments` 保存产品编号和运输摘要，`logistics_events` 保存每个物流节点，`warehouse_images` 保存仓库图片地址及拍摄日期。后台修改数据库后，网页下一次查询即可读取最新内容，不需要修改前端文件。
