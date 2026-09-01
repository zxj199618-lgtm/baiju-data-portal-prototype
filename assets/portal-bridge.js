
    (() => {
      const simpleNav = [
        { group: "灵犀智析", icon: "analysis", badge: "5.0", items: [{ name: "灵犀智析", badge: "5.0" }] },
        { group: "数据看板", icon: "dashboard", items: [{ name: "数据看板" }] },
        { group: "数据服务", icon: "gateway", badge: "3.0", items: [{ name: "人群包管理", badge: "3.0" }, { name: "数据开放平台", badge: "2.0" }] },
        { group: "数据资产", icon: "asset", items: [{ name: "看板管理" }, { name: "表管理", badge: ["2.0", "3.0", "4.0"] }, { name: "标签管理", badge: "3.0" }, { name: "维表管理", badge: "4.0" }, { name: "字典管理", badge: "4.0" }] },
        { group: "数据推送", icon: "push", badge: "3.0", items: [{ name: "人群包推送渠道", badge: "3.0" }] },
        { group: "权限管理", icon: "permission", items: [{ name: "用户管理" }, { name: "权限组" }] },
        { group: "系统管理", icon: "system", items: [{ name: "菜单管理" }, { name: "模型配置" }, { name: "Skill 配置", badge: "5.0" }] }
      ];
      const boardCategories = [
              "全部",
              "大盘数据",
              "新媒体",
              "达人业务部",
              "存量业务部",
              "伯都子公司",
              "创新业务部",
              "权益业务部",
              "产品运营部",
              "客服",
              "CPA事业部"
      ];

      const migratedBoards = [
              {
                      "category": "大盘数据",
                      "name": "存量经营分析（江总）",
                      "desc": "",
                      "quickBiId": "QB_001",
                      "owner": "谭嘉颖",
                      "groups": [
                              "门户管理员",
                              "数据分析师",
                              "只读访客"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "大盘数据",
                      "name": "存量全部渠道收入",
                      "desc": "",
                      "quickBiId": "QB_002",
                      "owner": "黄佩贤",
                      "groups": [
                              "门户管理员",
                              "数据分析师",
                              "只读访客"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "大盘数据",
                      "name": "号卡订单数据",
                      "desc": "",
                      "quickBiId": "QB_003",
                      "owner": "林金维",
                      "groups": [
                              "门户管理员",
                              "数据分析师",
                              "只读访客"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "大盘数据",
                      "name": "号卡提单数据",
                      "desc": "",
                      "quickBiId": "QB_004",
                      "owner": "李雨航",
                      "groups": [
                              "门户管理员",
                              "数据分析师",
                              "只读访客"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "大盘数据",
                      "name": "权益订单数据",
                      "desc": "",
                      "quickBiId": "QB_005",
                      "owner": "曾祥竞",
                      "groups": [
                              "门户管理员",
                              "数据分析师",
                              "只读访客"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "大盘数据",
                      "name": "信息流广告账户流水（财务对账用）",
                      "desc": "",
                      "quickBiId": "QB_006",
                      "owner": "谭嘉颖",
                      "groups": [
                              "门户管理员",
                              "数据分析师",
                              "只读访客"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "大盘数据",
                      "name": "权益财务净收入看板",
                      "desc": "",
                      "quickBiId": "QB_007",
                      "owner": "黄佩贤",
                      "groups": [
                              "门户管理员",
                              "数据分析师",
                              "只读访客"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "新媒体",
                      "name": "【工具】营销页AB测试看板",
                      "desc": "",
                      "quickBiId": "QB_008",
                      "owner": "黄佩贤",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "新媒体",
                      "name": "【流量】新媒体PVUV",
                      "desc": "",
                      "quickBiId": "QB_009",
                      "owner": "林金维",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "新媒体",
                      "name": "【订单】新媒体大盘订单",
                      "desc": "",
                      "quickBiId": "QB_010",
                      "owner": "李雨航",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "新媒体",
                      "name": "【订单】新媒体B站数据（近1个月数据）",
                      "desc": "",
                      "quickBiId": "QB_011",
                      "owner": "曾祥竞",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "新媒体",
                      "name": "【订单】新媒体B站数据（含历史至今数据）",
                      "desc": "",
                      "quickBiId": "QB_012",
                      "owner": "谭嘉颖",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "新媒体",
                      "name": "【订单】B站达人订单（近1个月数据）",
                      "desc": "",
                      "quickBiId": "QB_013",
                      "owner": "黄佩贤",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "新媒体",
                      "name": "【订单】新媒体B站达人数据（含历史至今数据）",
                      "desc": "",
                      "quickBiId": "QB_014",
                      "owner": "林金维",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "新媒体",
                      "name": "【流量】订单查询推荐模块",
                      "desc": "",
                      "quickBiId": "QB_015",
                      "owner": "李雨航",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "新媒体",
                      "name": "【流量】列表页数据",
                      "desc": "",
                      "quickBiId": "QB_016",
                      "owner": "曾祥竞",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "新媒体",
                      "name": "【流量】小程序整体数据",
                      "desc": "",
                      "quickBiId": "QB_017",
                      "owner": "谭嘉颖",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "新媒体",
                      "name": "【流量】新媒体小程序PVUV",
                      "desc": "",
                      "quickBiId": "QB_018",
                      "owner": "黄佩贤",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "新媒体",
                      "name": "【活动】营销活动报表",
                      "desc": "",
                      "quickBiId": "QB_019",
                      "owner": "林金维",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "新媒体",
                      "name": "新媒体全部历史数据概览",
                      "desc": "",
                      "quickBiId": "QB_020",
                      "owner": "李雨航",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "新媒体",
                      "name": "微信公众号数据",
                      "desc": "",
                      "quickBiId": "QB_021",
                      "owner": "曾祥竞",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "达人业务部",
                      "name": "号卡-订单实时",
                      "desc": "",
                      "quickBiId": "QB_022",
                      "owner": "李雨航",
                      "groups": [
                              "门户管理员",
                              "投放组长"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "达人业务部",
                      "name": "号卡-流量数据",
                      "desc": "",
                      "quickBiId": "QB_023",
                      "owner": "曾祥竞",
                      "groups": [
                              "门户管理员",
                              "投放组长"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "达人业务部",
                      "name": "号卡数据（原powerBI）",
                      "desc": "",
                      "quickBiId": "QB_024",
                      "owner": "谭嘉颖",
                      "groups": [
                              "门户管理员",
                              "投放组长"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "达人业务部",
                      "name": "达人号卡投放数据",
                      "desc": "",
                      "quickBiId": "QB_025",
                      "owner": "黄佩贤",
                      "groups": [
                              "门户管理员",
                              "投放组长"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "存量业务部",
                      "name": "信息流存量投放数据（修任）",
                      "desc": "",
                      "quickBiId": "QB_026",
                      "owner": "谭嘉颖",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "存量业务部",
                      "name": "存量营收数据（头条）",
                      "desc": "",
                      "quickBiId": "QB_027",
                      "owner": "黄佩贤",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "存量业务部",
                      "name": "实时营收数据（内测中）",
                      "desc": "",
                      "quickBiId": "QB_028",
                      "owner": "林金维",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "存量业务部",
                      "name": "实时营收数据（快手）",
                      "desc": "",
                      "quickBiId": "QB_029",
                      "owner": "李雨航",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "存量业务部",
                      "name": "实时订单报表（头条）",
                      "desc": "",
                      "quickBiId": "QB_030",
                      "owner": "曾祥竞",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "存量业务部",
                      "name": "投放账户问题排查看板",
                      "desc": "",
                      "quickBiId": "QB_031",
                      "owner": "谭嘉颖",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "存量业务部",
                      "name": "运营产品问题排查看板",
                      "desc": "",
                      "quickBiId": "QB_032",
                      "owner": "黄佩贤",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "存量业务部",
                      "name": "产品分析看板",
                      "desc": "",
                      "quickBiId": "QB_033",
                      "owner": "林金维",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "存量业务部",
                      "name": "投放策略看板",
                      "desc": "",
                      "quickBiId": "QB_034",
                      "owner": "李雨航",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "存量业务部",
                      "name": "存量消耗报表",
                      "desc": "",
                      "quickBiId": "QB_035",
                      "owner": "曾祥竞",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "存量业务部",
                      "name": "页面进单情况（看流量数据）",
                      "desc": "",
                      "quickBiId": "QB_036",
                      "owner": "谭嘉颖",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "存量业务部",
                      "name": "存量接品看板",
                      "desc": "",
                      "quickBiId": "QB_037",
                      "owner": "黄佩贤",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "存量业务部",
                      "name": "素材分析看板（设计）",
                      "desc": "",
                      "quickBiId": "QB_038",
                      "owner": "林金维",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "存量业务部",
                      "name": "存量产品顺序",
                      "desc": "",
                      "quickBiId": "QB_039",
                      "owner": "李雨航",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "存量业务部",
                      "name": "存量用户行为分析",
                      "desc": "",
                      "quickBiId": "QB_040",
                      "owner": "曾祥竞",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "存量业务部",
                      "name": "存量业务产品看板（FX）",
                      "desc": "",
                      "quickBiId": "QB_041",
                      "owner": "谭嘉颖",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "存量业务部",
                      "name": "投放数据漏斗（测试中）",
                      "desc": "",
                      "quickBiId": "QB_042",
                      "owner": "黄佩贤",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "存量业务部",
                      "name": "大数据投放账户看板",
                      "desc": "",
                      "quickBiId": "QB_043",
                      "owner": "林金维",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "存量业务部",
                      "name": "存量退订率",
                      "desc": "",
                      "quickBiId": "QB_044",
                      "owner": "李雨航",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "伯都子公司",
                      "name": "伯都号卡投放数据",
                      "desc": "",
                      "quickBiId": "QB_045",
                      "owner": "林金维",
                      "groups": [
                              "门户管理员",
                              "数据分析师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "伯都子公司",
                      "name": "直播整体数据",
                      "desc": "",
                      "quickBiId": "QB_046",
                      "owner": "李雨航",
                      "groups": [
                              "门户管理员",
                              "数据分析师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "伯都子公司",
                      "name": "中兴随身WiFi数据",
                      "desc": "",
                      "quickBiId": "QB_047",
                      "owner": "曾祥竞",
                      "groups": [
                              "门户管理员",
                              "数据分析师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "伯都子公司",
                      "name": "中兴随身WiFi一口价看板",
                      "desc": "",
                      "quickBiId": "QB_048",
                      "owner": "谭嘉颖",
                      "groups": [
                              "门户管理员",
                              "数据分析师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "创新业务部",
                      "name": "B站存量投放看板",
                      "desc": "",
                      "quickBiId": "QB_049",
                      "owner": "曾祥竞",
                      "groups": [
                              "门户管理员",
                              "投放组长"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "创新业务部",
                      "name": "B站短视频看板",
                      "desc": "",
                      "quickBiId": "QB_050",
                      "owner": "谭嘉颖",
                      "groups": [
                              "门户管理员",
                              "投放组长"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "创新业务部",
                      "name": "B站直播看板",
                      "desc": "",
                      "quickBiId": "QB_051",
                      "owner": "黄佩贤",
                      "groups": [
                              "门户管理员",
                              "投放组长"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "创新业务部",
                      "name": "创一返费看板",
                      "desc": "",
                      "quickBiId": "QB_052",
                      "owner": "林金维",
                      "groups": [
                              "门户管理员",
                              "投放组长"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "创新业务部",
                      "name": "创新一部私域组业务看板",
                      "desc": "",
                      "quickBiId": "QB_053",
                      "owner": "李雨航",
                      "groups": [
                              "门户管理员",
                              "投放组长"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "创新业务部",
                      "name": "快手电商数据看板",
                      "desc": "",
                      "quickBiId": "QB_054",
                      "owner": "曾祥竞",
                      "groups": [
                              "门户管理员",
                              "投放组长"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "权益业务部",
                      "name": "权益投放看板（新）",
                      "desc": "",
                      "quickBiId": "QB_055",
                      "owner": "林金维",
                      "groups": [
                              "门户管理员",
                              "数据分析师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "权益业务部",
                      "name": "权益投放看板（银联优化师）",
                      "desc": "",
                      "quickBiId": "QB_056",
                      "owner": "李雨航",
                      "groups": [
                              "门户管理员",
                              "数据分析师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "权益业务部",
                      "name": "权益投放看板（银联）",
                      "desc": "",
                      "quickBiId": "QB_057",
                      "owner": "曾祥竞",
                      "groups": [
                              "门户管理员",
                              "数据分析师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "权益业务部",
                      "name": "权益回收测算",
                      "desc": "",
                      "quickBiId": "QB_058",
                      "owner": "谭嘉颖",
                      "groups": [
                              "门户管理员",
                              "数据分析师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "权益业务部",
                      "name": "权益自营商户监控",
                      "desc": "",
                      "quickBiId": "QB_059",
                      "owner": "黄佩贤",
                      "groups": [
                              "门户管理员",
                              "数据分析师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "权益业务部",
                      "name": "权益商户投放明细",
                      "desc": "",
                      "quickBiId": "QB_060",
                      "owner": "林金维",
                      "groups": [
                              "门户管理员",
                              "数据分析师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "权益业务部",
                      "name": "权益分析看板",
                      "desc": "",
                      "quickBiId": "QB_061",
                      "owner": "李雨航",
                      "groups": [
                              "门户管理员",
                              "数据分析师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "权益业务部",
                      "name": "权益素材数据（设计）",
                      "desc": "",
                      "quickBiId": "QB_062",
                      "owner": "曾祥竞",
                      "groups": [
                              "门户管理员",
                              "数据分析师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "产品运营部",
                      "name": "套餐省内外占比",
                      "desc": "",
                      "quickBiId": "QB_063",
                      "owner": "黄佩贤",
                      "groups": [
                              "门户管理员",
                              "数据分析师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "客服",
                      "name": "客服部看板",
                      "desc": "",
                      "quickBiId": "QB_064",
                      "owner": "曾祥竞",
                      "groups": [
                              "门户管理员",
                              "只读访客"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "CPA事业部",
                      "name": "app产品转化漏斗",
                      "desc": "",
                      "quickBiId": "QB_065",
                      "owner": "林金维",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "CPA事业部",
                      "name": "app产品转化漏斗（优化师）",
                      "desc": "",
                      "quickBiId": "QB_066",
                      "owner": "李雨航",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "CPA事业部",
                      "name": "CPA产品转化漏斗（非中移）",
                      "desc": "",
                      "quickBiId": "QB_067",
                      "owner": "曾祥竞",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "CPA事业部",
                      "name": "拉新拉活媒体订单转化监测",
                      "desc": "",
                      "quickBiId": "QB_068",
                      "owner": "谭嘉颖",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "CPA事业部",
                      "name": "app产品转化漏斗（中移分销）",
                      "desc": "",
                      "quickBiId": "QB_069",
                      "owner": "黄佩贤",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "CPA事业部",
                      "name": "移动APP拉活项目看板（旧看板）",
                      "desc": "",
                      "quickBiId": "QB_070",
                      "owner": "林金维",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "CPA事业部",
                      "name": "历史重推转化数据看板",
                      "desc": "",
                      "quickBiId": "QB_071",
                      "owner": "李雨航",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              },
              {
                      "category": "CPA事业部",
                      "name": "CPA产品转化数据看板",
                      "desc": "",
                      "quickBiId": "QB_072",
                      "owner": "曾祥竞",
                      "groups": [
                              "门户管理员",
                              "投放组长",
                              "优化师"
                      ],
                      "status": "已上线",
                      "updatedAt": "2026-06-16 18:50"
              }
      ];

      const simpleUsers = [
        { name: "黄佩贤", phone: "138****2491", dept: "商业化中心 / 投放一组", role: "部门管理员", email: "huangpeixian@baiju.com", group: "门户管理员", peopleStatus: "在职", status: "启用", login: "2026-06-15 09:21", feishu: "ou_7f31c9" },
        { name: "林金维", phone: "136****5830", dept: "商业化中心 / 投放二组", role: "投放组长", email: "linjinwei@baiju.com", group: "投放组长", peopleStatus: "在职", status: "启用", login: "2026-06-15 08:46", feishu: "ou_2a90de" },
        { name: "谭嘉颖", phone: "159****2037", dept: "商业化中心 / 投放一组", role: "优化师", email: "tanjy@baiju.com", group: "优化师", peopleStatus: "在职", status: "启用", login: "2026-06-14 19:12", feishu: "ou_9d21ab" },
        { name: "李雨航", phone: "185****7781", dept: "增长数据 / 分析组", role: "数据分析师", email: "liyuhang@baiju.com", group: "只读访客", peopleStatus: "在职", status: "启用", login: "2026-06-14 15:30", feishu: "ou_f91c20" },
        { name: "刘盾", phone: "137****0018", dept: "商业化中心 / 投放三组", role: "优化师", email: "liudun@baiju.com", group: "未分配", peopleStatus: "在职", status: "未分配权限组", login: "-", feishu: "ou_5bca72" },
        { name: "梁然", phone: "188****9142", dept: "商业化中心 / 投放三组", role: "优化师", email: "liangran@baiju.com", group: "优化师", peopleStatus: "离职", status: "已停用", login: "2026-06-01 11:05", feishu: "ou_1e83fb" }
      ];

      const importedUserNames = [
        "黄嘉锋", "陈锦涛", "陈文东", "李振汕", "章瑞林", "郭淇昕", "梁俊恒", "刘阳", "吴燕芳", "刘晓琪",
        "魏广兴", "肖鸿铭", "曾祥竞", "张志聪", "吴晓民", "江育斌", "江育进", "伍朝波", "刘雨婷", "卢锦雄",
        "林华娜", "蓝瑜", "许少娟", "许浩鑫", "赖琦琦", "陈海彤", "邱柯", "钟洋洋", "陈佳曼", "吴杨",
        "彭文杰", "李唯", "梁铭茵", "刘俊杰", "郑若仪", "杨齐乐", "钟赛", "梁思逸", "赖金丹", "李思宁",
        "许浩韩", "彭兴剑", "蒋梦凌", "何如晖", "冯艳玲", "刘春妮", "刘芬婷", "卢俭聪", "叶首龙", "周嘉宝",
        "巫鑫琴", "曲成", "李依依", "杨鑫", "杨青青", "林金维", "谢满兰", "郑邦灿", "郭子墨", "陈羽思",
        "韩啸", "黄佩贤", "黄雄伟", "陈少容", "刘琪莉", "董晓云", "郑慧艳", "胡雪琼", "许少煌", "胡盼鹤",
        "崔志恒", "张梦", "张洁仪", "戴修任", "李勇均", "李思蝶", "李秋仪", "李雨航", "林鍱", "梁晓晴",
        "梁铭", "欧越龙", "潘锦明", "邱美茜", "陈燕燕", "陈霈琳", "高紫婷", "黄旭辉", "黎舒晴", "蔡锐鸿",
        "谭嘉颖", "王苑萍", "余淑仪", "孙都", "戚嘉豪", "李媛", "李炜祺", "蔡悦玲", "梁兵", "尹文秀",
        "朱倩仪", "陈钱雯", "李亚蕊", "黄润佳", "符立杭", "苏建雄", "邹惠敏", "刘旭", "刘盾", "卜梦晴",
        "叶知遠", "文娟", "方漫玲", "李万雅", "李依柠", "林绍康", "梁然", "温国能", "谢晓钰", "郑育琪",
        "闵晶", "黄泳新", "陈咏诗", "谢绍钦", "黎兆旺", "刘欣婷", "姚丰育", "屈秋延", "赖嘉俊", "邝心愉",
        "陆玉婷", "黄诗雨", "梁丽君", "石铂嘉", "洪鑫", "吴楚核", "蔡家豪", "招冰洁", "伍鸿城", "吴晓霞",
        "杨旺", "陈佳欣", "车秀祺", "林德娣", "冯德明", "陈淑敏", "司徒俊豪", "方颖祺", "李昕桐", "张佳荧",
        "郭子冲", "林奋", "陈琳", "陈俊", "邵天龙", "何霞", "刘墁", "陈浩瑜", "邵燕妮", "骆俊寿",
        "曾双紫", "徐嘉欣", "王嘉欣", "劳萍静", "张鹏", "李爱绵", "林枫"
      ];
      const feishuPrimaryDepartmentByName = {
        "黄嘉锋": "大数据部 / 数据开发组",
        "陈锦涛": "大数据部 / 数据开发组",
        "陈文东": "大数据部 / 数据开发组",
        "李振汕": "大数据部 / 数据开发组",
        "章瑞林": "大数据部 / 数据开发组",
        "郭淇昕": "大数据部 / 数据分析组",
        "梁俊恒": "大数据部 / 数据分析组",
        "刘阳": "大数据部 / 数据分析组",
        "吴燕芳": "大数据部 / 数据分析组",
        "刘晓琪": "大数据部 / 数据测试组",
        "魏广兴": "大数据部 / 数据测试组",
        "肖鸿铭": "大数据部 / 数据测试组",
        "曾祥竞": "大数据部 / 数据应用组",
        "江育斌": "项目孵化部 / 伯都项目组",
        "江育进": "总裁办",
        "伍朝波": "项目孵化部 / 伯都项目组",
        "林华娜": "项目孵化部 / 伯都项目组",
        "蓝瑜": "总裁办",
        "许少娟": "总裁办",
        "赖琦琦": "财务部 / 财务BP组",
        "吴杨": "IP业务部 / B站组",
        "李唯": "IP业务部",
        "梁铭茵": "IP业务部 / 抖快组",
        "刘俊杰": "IP业务部 / 私域组",
        "郑若仪": "市场部 / 号卡运营组",
        "杨齐乐": "IP业务部 / B站组",
        "钟赛": "产研中心 / 研发部 / 开发组 / 前端组",
        "梁思逸": "IP业务部 / B站组",
        "李思宁": "IP业务部 / B站组",
        "许浩韩": "市场部 / 商务组",
        "彭兴剑": "产研中心 / 研发部",
        "蒋梦凌": "财务部 / 财务共享中心 / 收入分销组",
        "何如晖": "权益业务部 / 商务组",
        "冯艳玲": "人力资源部 / 薪酬绩效及员工关系",
        "刘春妮": "投放一部 / 权益二组",
        "卢俭聪": "投放一部 / 权益二组",
        "叶首龙": "投放一部 / 权益一组",
        "周嘉宝": "产研中心 / 产品部 / 产品组",
        "巫鑫琴": "内容制作中心",
        "曲成": "产研中心 / 产品部 / 产品组",
        "杨鑫": "权益业务部 / 投放组",
        "杨青青": "市场部 / 商务组",
        "林金维": "投放一部 / 权益一组",
        "谢满兰": "权益业务部 / 产品及运营组",
        "郑邦灿": "投放二部",
        "郭子墨": "产研中心 / 产品部 / 产品组",
        "陈羽思": "投放一部 / 权益一组",
        "韩啸": "总裁办",
        "黄佩贤": "投放一部 / 权益一组",
        "黄雄伟": "投放一部 / 权益二组",
        "陈少容": "财务部 / 财务BP组",
        "董晓云": "财务部 / 财务BP组",
        "郑慧艳": "CPA事业部 / 媒体组",
        "胡雪琼": "市场部",
        "许少煌": "总裁办",
        "胡盼鹤": "市场部 / 商务组",
        "崔志恒": "投放一部 / 存量组",
        "张梦": "人力资源部 / 招聘及HRBP",
        "张洁仪": "存量业务部 / 运营组 / 运营组",
        "戴修任": "投放一部 / 存量组",
        "李勇均": "市场部 / 商务组",
        "李思蝶": "存量业务部 / 运营组 / 运营组",
        "李秋仪": "市场部 / 存量产品组",
        "梁晓晴": "市场部 / 商务组",
        "欧越龙": "内容制作中心 / 设计组 / 视觉组",
        "潘锦明": "存量业务部 / 运营组 / 运营组",
        "邱美茜": "内容制作中心",
        "陈燕燕": "存量业务部 / 运营组 / 运营组",
        "陈霈琳": "产研中心 / 产品部 / 产品组",
        "高紫婷": "存量业务部 / 运营组 / 运营组",
        "黄旭辉": "市场部 / 商务组",
        "黎舒晴": "投放一部 / 存量组",
        "蔡锐鸿": "产研中心 / 研发部 / 测试组",
        "谭嘉颖": "投放一部 / 存量组",
        "王苑萍": "创新业务部 / 2部",
        "余淑仪": "产研中心 / 研发部 / 测试组",
        "孙都": "人力资源部 / 招聘及HRBP",
        "戚嘉豪": "投放一部 / 权益二组",
        "李媛": "投放一部 / 存量组",
        "李炜祺": "投放一部 / 存量组",
        "蔡悦玲": "市场部 / 存量产品组",
        "符立杭": "CPA事业部 / 运营组",
        "苏建雄": "产研中心 / 产品部 / 产品组",
        "邹惠敏": "总裁办",
        "温国能": "创新业务部 / 3部",
        "陈咏诗": "创新业务部 / 3部",
        "谢绍钦": "产研中心 / 研发部 / 开发组 / 后端组",
        "黎兆旺": "产研中心 / 研发部 / 开发组 / 后端组",
        "姚丰育": "投放一部 / 权益二组",
        "赖嘉俊": "投放一部 / 权益二组",
        "邝心愉": "权益业务部 / 商务组",
        "陆玉婷": "权益业务部 / 产品及运营组",
        "黄诗雨": "权益业务部 / 产品及运营组",
        "梁丽君": "内容制作中心",
        "招冰洁": "内容制作中心 / 设计组 / UI组",
        "伍鸿城": "产研中心 / 研发部 / 测试组",
        "吴晓霞": "产研中心 / 研发部 / 测试组",
        "杨旺": "产研中心 / 研发部 / 开发组 / 后端组",
        "陈佳欣": "财务部 / 财务共享中心 / 收入分销组",
        "车秀祺": "产研中心 / 研发部 / 运维组",
        "林德娣": "人力资源部 / 招聘及HRBP",
        "冯德明": "产研中心 / 研发部 / 测试组",
        "陈淑敏": "内容制作中心 / 设计组 / 视觉组",
        "司徒俊豪": "产研中心 / 研发部 / 开发组 / AI组",
        "方颖祺": "存量业务部 / 团长组",
        "李昕桐": "权益业务部 / 产品及运营组",
        "张佳荧": "市场部 / 存量产品组",
        "郭子冲": "产研中心 / 研发部 / 测试组",
        "林奋": "客服部 / 客服组",
        "陈琳": "总裁办",
        "陈俊": "产研中心 / 研发部 / 测试组",
        "何霞": "IP业务部 / 私域组",
        "陈浩瑜": "市场部 / 号卡运营组",
        "邵燕妮": "客服部 / 升级组 / 客诉组",
        "骆俊寿": "产研中心 / 研发部 / 开发组 / 后端组",
        "曾双紫": "产研中心 / 研发部 / 测试组",
        "徐嘉欣": "市场部 / 存量产品组",
        "王嘉欣": "财务部 / 财务共享中心 / 费用组",
        "劳萍静": "客服部 / 升级组",
        "张鹏": "IP业务部 / 私域组",
        "李爱绵": "市场部 / 号卡运营组",
        "林枫": "产研中心 / 研发部 / 开发组 / 后端组",
      };
      const feishuUnassignedDepartmentNames = new Set(["张志聪", "吴晓民", "吴楚核", "邵天龙", "刘墁"]);

      function getPrototypeUserDepartment(name, fallback = "飞书组织") {
        return feishuPrimaryDepartmentByName[name] || (feishuUnassignedDepartmentNames.has(name) ? "未挂部门" : fallback);
      }

      simpleUsers.forEach(user => {
        user.dept = getPrototypeUserDepartment(user.name, user.dept);
      });
      const existingUserNames = new Set(simpleUsers.map(user => user.name));
      const prototypeAdminAssignments = { "曾祥竞": { group: "门户管理员", role: "平台管理员", status: "启用", login: "2026-08-31 09:00" } };
      importedUserNames.forEach((name, index) => {
        if (existingUserNames.has(name)) return;
        simpleUsers.push({
          name,
          phone: "-",
          dept: getPrototypeUserDepartment(name),
          role: prototypeAdminAssignments[name]?.role || "成员",
          email: "-",
          group: prototypeAdminAssignments[name]?.group || "未分配",
          peopleStatus: "在职",
          status: prototypeAdminAssignments[name]?.status || "未分配权限组",
          login: prototypeAdminAssignments[name]?.login || "-",
          feishu: `ou_imported_${String(index + 1).padStart(3, "0")}`
        });
        existingUserNames.add(name);
      });
      window.simpleUsers = simpleUsers;

      const permissionGroups = [
        { name: "门户管理员", desc: "管理全站菜单、用户、权限组和所有看板。", menus: ["灵犀智析", "系统管理", "菜单管理", "Skill 配置", "数据看板", "数据服务", "人群包管理", "数据开放平台", "数据资产", "看板管理", "表管理", "标签管理", "维表管理", "字典管理", "数据推送", "人群包推送渠道", "权限管理", "用户管理", "权限组"], boards: ["全部看板"], tables: ["全部数据表"], status: "启用" },
        { name: "投放组长", desc: "查看本组数据，管理组内优化师看板访问。", menus: ["灵犀智析", "数据看板"], boards: ["CPA事业部", "大盘数据"], tables: ["广告计划日报表", "广告账户日报", "广告组转化日报", "媒体消耗汇总", "产品 ROI 日报"], status: "启用" },
        { name: "优化师", desc: "查看本人负责的媒体、账户、计划和产品看板。", menus: ["灵犀智析", "数据看板"], boards: ["CPA事业部", "新媒体"], tables: ["广告计划日报表", "广告账户日报"], status: "启用" },
        { name: "数据分析师", desc: "查看聚合数据和分析看板，不管理用户。", menus: ["灵犀智析", "数据看板"], boards: ["大盘数据", "产品运营部"], tables: ["广告计划日报表", "用户画像标签明细表", "用户订单明细", "用户生命周期日报", "渠道归因明细"], status: "启用" },
        { name: "只读访客", desc: "只查看被分发的聚合看板，不能下钻明细。", menus: ["数据看板"], boards: ["指定看板"], tables: [], status: "启用" }
      ];

      const dataAssets = [
        {
          source: "StarRocks",
          database: "prod_callup",
          table: "dm_ad_plan_daily_media_account_product_performance_detail",
          cnName: "广告计划日报表", bizLine: "权益",
          desc: "广告计划日粒度消耗、转化和成本数据，用于对外提供投放日报。",
          serviceStatus: "启用",
          status: "同步成功",
          lastSync: "2026-06-26 10:18",
          lastSuccessSync: "2026-06-26 10:18",
          nextSync: "每日 02:30",
          owner: "黄佩贤",
          fields: [
            { name: "stat_date", type: "DATE", comment: "统计日期", remark: "接口查询主时间字段" },
            { name: "media_source", type: "VARCHAR", comment: "媒体来源", remark: "枚举：巨量、广点通、快手、OPPO、VIVO" },
            { name: "plan_id", type: "VARCHAR", comment: "计划 ID", remark: "广告平台侧计划标识" },
            { name: "plan_name", type: "VARCHAR", comment: "计划名称", remark: "广告平台侧计划展示名称" },
            { name: "account_id", type: "VARCHAR", comment: "账户 ID", remark: "投放账户标识" },
            { name: "account_name", type: "VARCHAR", comment: "账户名称", remark: "投放账户展示名称" },
            { name: "product_name", type: "VARCHAR", comment: "产品名称", remark: "关联投放产品" },
            { name: "campaign_id", type: "VARCHAR", comment: "广告组 ID", remark: "媒体广告组标识" },
            { name: "cost", type: "DECIMAL(18,2)", comment: "消耗金额", remark: "单位：元" },
            { name: "click_cnt", type: "BIGINT", comment: "点击数", remark: "媒体回传点击" },
            { name: "show_cnt", type: "BIGINT", comment: "曝光数", remark: "媒体回传曝光" },
            { name: "activate_cnt", type: "BIGINT", comment: "激活数", remark: "按归因口径统计" },
            { name: "register_cnt", type: "BIGINT", comment: "注册数", remark: "按归因口径统计" },
            { name: "order_cnt", type: "BIGINT", comment: "订单数", remark: "后链路订单量" },
            { name: "cpa", type: "DECIMAL(18,4)", comment: "转化成本", remark: "cost / activate_cnt" },
            { name: "roi", type: "DECIMAL(18,4)", comment: "ROI", remark: "收入 / 消耗" },
            { name: "update_time", type: "DATETIME", comment: "更新时间", remark: "数据最近更新时间" }
          ]
        },
        {
          source: "StarRocks",
          database: "prod_cloud",
          table: "dwd_user_profile_tag",
          cnName: "用户画像标签明细表", bizLine: "存量",
          desc: "用户画像标签明细表，用于用户细查和外部系统标签查询。",
          serviceStatus: "启用",
          status: "同步成功",
          lastSync: "2026-06-26 09:42",
          lastSuccessSync: "2026-06-26 09:42",
          nextSync: "每日 03:00",
          owner: "李雨航",
          fields: [
            { name: "user_id", type: "VARCHAR", comment: "用户 ID", remark: "门户统一用户标识" },
            { name: "phone_md5", type: "VARCHAR", comment: "手机号 MD5", remark: "仅用于匹配，不直接展示明文" },
            { name: "tag_code", type: "VARCHAR", comment: "标签编码", remark: "稳定对接字段" },
            { name: "tag_value", type: "VARCHAR", comment: "标签值", remark: "业务展示值" },
            { name: "tag_name", type: "VARCHAR", comment: "标签名称", remark: "业务可读名称" },
            { name: "tag_category", type: "VARCHAR", comment: "标签分类", remark: "用于筛选标签域" },
            { name: "score", type: "DECIMAL(10,4)", comment: "标签分值", remark: "模型类标签得分" },
            { name: "effective_date", type: "DATE", comment: "生效日期", remark: "标签生效时间" },
            { name: "expire_date", type: "DATE", comment: "失效日期", remark: "标签失效时间" },
            { name: "update_time", type: "DATETIME", comment: "更新时间", remark: "标签更新时间" }
          ]
        },
        {
          source: "StarRocks",
          database: "prod_callup",
          table: "ads_rta_request_hour",
          cnName: "RTA 请求小时监控表", bizLine: "号卡",
          desc: "RTA 小时级请求、命中、耗时监控表。",
          serviceStatus: "停用",
          status: "同步失败",
          lastSync: "2026-06-25 18:08",
          lastSuccessSync: "2026-06-25 16:00",
          nextSync: "每小时 15 分",
          owner: "谭嘉颖",
          error: "StarRocks 连接超时",
          fields: []
        }
      ];

      [
        ["prod_callup", "dwd_ad_account_daily", "广告账户日报", "权益"],
        ["prod_callup", "dwd_campaign_conversion_daily", "广告组转化日报", "权益"],
        ["prod_callup", "ads_media_cost_summary", "媒体消耗汇总", "权益"],
        ["prod_cloud", "dwd_user_device_relation", "用户设备关系明细", "存量"],
        ["prod_cloud", "dwd_user_order_detail", "用户订单明细", "号卡"],
        ["prod_cloud", "dm_user_lifecycle_daily", "用户生命周期日报", "存量"],
        ["prod_callup", "ads_product_roi_daily", "产品 ROI 日报", "权益"],
        ["prod_cloud", "dwd_channel_attribution_detail", "渠道归因明细", "保险"],
        ["prod_callup", "dm_media_account_health", "媒体账户健康度", "权益"]
      ].forEach(([database, table, cnName, bizLine], demoIndex) => dataAssets.push({
        source: "StarRocks", database, table, cnName, bizLine,
        desc: `${cnName}，用于接口服务与数据分析。`, serviceStatus: demoIndex === 7 ? "停用" : "启用", status: "同步成功",
        lastSync: "2026-06-26 09:30", lastSuccessSync: "2026-06-26 09:30", nextSync: "每日 02:30", owner: "黄佩贤",
        fields: [
          { name: "biz_date", type: "DATE", comment: "业务日期", remark: "" },
          { name: "record_id", type: "VARCHAR", comment: "记录 ID", remark: "" },
          { name: "account_id", type: "VARCHAR", comment: "账户 ID", remark: "" },
          { name: "channel_code", type: "VARCHAR", comment: "渠道编码", remark: "" },
          { name: "metric_value", type: "DECIMAL(18,4)", comment: "指标值", remark: "" },
          { name: "update_time", type: "DATETIME", comment: "更新时间", remark: "" }
        ]
      }));

      const dataDictionaries = [
        {
          dictId: "DICT001", code: "media_source", name: "媒体来源",
          desc: "投放媒体编码对照，广告计划、消耗汇总等表共用。", owner: "黄佩贤", status: "启用", updatedAt: "2026-08-20 11:20",
          items: [
            { code: "ocean", name: "巨量", sort: 1, enabled: true },
            { code: "gdt", name: "广点通", sort: 2, enabled: true },
            { code: "kuaishou", name: "快手", sort: 3, enabled: true },
            { code: "oppo", name: "OPPO", sort: 4, enabled: true },
            { code: "vivo", name: "VIVO", sort: 5, enabled: true }
          ]
        },
        {
          dictId: "DICT002", code: "channel_type", name: "渠道类型",
          desc: "线上/线下/代理等渠道类型，维表与明细表共用。", owner: "谭嘉颖", status: "启用", updatedAt: "2026-08-18 16:40",
          items: [
            { code: "online", name: "线上渠道", sort: 1, enabled: true },
            { code: "offline", name: "线下渠道", sort: 2, enabled: true },
            { code: "agent", name: "代理渠道", sort: 3, enabled: true }
          ]
        },
        {
          dictId: "DICT003", code: "biz_line", name: "业务线",
          desc: "权益、号卡、存量等业务线编码。", owner: "李雨航", status: "启用", updatedAt: "2026-08-16 09:12",
          items: [
            { code: "equity", name: "权益", sort: 1, enabled: true },
            { code: "haoka", name: "号卡", sort: 2, enabled: true },
            { code: "stock", name: "存量", sort: 3, enabled: true },
            { code: "insure", name: "保险", sort: 4, enabled: true }
          ]
        },
        {
          dictId: "DICT004", code: "row_status", name: "启用状态",
          desc: "维表行是否启用的通用状态字典。", owner: "林金维", status: "启用", updatedAt: "2026-08-12 14:05",
          items: [
            { code: "1", name: "启用", sort: 1, enabled: true },
            { code: "0", name: "停用", sort: 2, enabled: true }
          ]
        }
      ];

      dataAssets.forEach((asset, assetIndex) => {
        asset.assetId = asset.assetId || String(assetIndex + 1).padStart(3, "0");
        asset.externalName = asset.externalName || `open_${asset.table}`;
        asset.source = asset.source === "StarRocks-拉端" || asset.source === "StarRocks-存量"
          ? asset.source
          : asset.database === "prod_callup" ? "StarRocks-拉端" : "StarRocks-存量";
        asset.dimension = !!asset.dimension;
        asset.maintainMode = asset.maintainMode || "sync";
        asset.rows = Array.isArray(asset.rows) ? asset.rows : [];
        asset.lastMaintained = asset.lastMaintained || "";
        asset.maintainer = asset.maintainer || "";
        asset.fields.forEach(field => { if (!field.dictId) field.dictId = ""; });
      });

      const adPlanAsset = dataAssets.find(asset => asset.table === "dm_ad_plan_daily_media_account_product_performance_detail");
      const mediaField = adPlanAsset?.fields.find(field => field.name === "media_source");
      if (mediaField) mediaField.dictId = "DICT001";
      if (adPlanAsset) {
        adPlanAsset.dimension = true;
        adPlanAsset.maintainMode = "sync";
      }

      const accountAsset = dataAssets.find(asset => asset.table === "dwd_ad_account_daily");
      if (accountAsset) {
        accountAsset.dimension = true;
        accountAsset.lastMaintained = "2026-08-21 15:10";
        accountAsset.maintainer = "黄佩贤";
        accountAsset.fields = [
          { name: "account_id", type: "VARCHAR", comment: "账户 ID", remark: "投放账户主键", dictId: "" },
          { name: "account_name", type: "VARCHAR", comment: "账户名称", remark: "", dictId: "" },
          { name: "media_source", type: "VARCHAR", comment: "媒体来源", remark: "关联媒体来源字典", dictId: "DICT001" },
          { name: "biz_line", type: "VARCHAR", comment: "业务线", remark: "", dictId: "DICT003" },
          { name: "owner_name", type: "VARCHAR", comment: "负责人", remark: "", dictId: "" },
          { name: "row_status", type: "VARCHAR", comment: "状态", remark: "", dictId: "DICT004" }
        ];
        accountAsset.rows = [
          { account_id: "ACC1001", account_name: "巨量-权益投放户", media_source: "ocean", biz_line: "equity", owner_name: "黄佩贤", row_status: "1" },
          { account_id: "ACC1002", account_name: "广点通-号卡投放户", media_source: "gdt", biz_line: "haoka", owner_name: "谭嘉颖", row_status: "1" },
          { account_id: "ACC1003", account_name: "快手-存量复投户", media_source: "kuaishou", biz_line: "stock", owner_name: "林金维", row_status: "0" }
        ];
      }

      dataAssets.push({
        assetId: "T101", source: "门户维护", database: "portal_dim", table: "dim_channel",
        externalName: "open_dim_channel", cnName: "渠道维表", bizLine: "权益",
        desc: "业务渠道主数据，支持在线增删改查，渠道类型引用共用字典。",
        serviceStatus: "启用", status: "同步成功", lastSync: "2026-08-22 10:18", lastSuccessSync: "2026-08-22 10:18",
        nextSync: "按维护写入", owner: "谭嘉颖", dimension: true, maintainMode: "portal",
        lastMaintained: "2026-08-22 10:18", maintainer: "谭嘉颖",
        fields: [
          { name: "channel_id", type: "VARCHAR", comment: "渠道 ID", remark: "主键", dictId: "" },
          { name: "channel_name", type: "VARCHAR", comment: "渠道名称", remark: "", dictId: "" },
          { name: "channel_type", type: "VARCHAR", comment: "渠道类型", remark: "关联渠道类型字典", dictId: "DICT002" },
          { name: "biz_line", type: "VARCHAR", comment: "业务线", remark: "", dictId: "DICT003" },
          { name: "owner_name", type: "VARCHAR", comment: "负责人", remark: "", dictId: "" },
          { name: "row_status", type: "VARCHAR", comment: "状态", remark: "", dictId: "DICT004" }
        ],
        rows: [
          { channel_id: "CH001", channel_name: "信息流-巨量", channel_type: "online", biz_line: "equity", owner_name: "黄佩贤", row_status: "1" },
          { channel_id: "CH002", channel_name: "应用商店-OPPO", channel_type: "online", biz_line: "haoka", owner_name: "李雨航", row_status: "1" },
          { channel_id: "CH003", channel_name: "线下门店-华南", channel_type: "offline", biz_line: "stock", owner_name: "林金维", row_status: "1" },
          { channel_id: "CH004", channel_name: "代理-保险专项", channel_type: "agent", biz_line: "insure", owner_name: "谭嘉颖", row_status: "0" }
        ]
      });
      dataAssets.push({
        assetId: "T102", source: "门户维护", database: "portal_dim", table: "dim_product",
        externalName: "open_dim_product", cnName: "产品维表", bizLine: "号卡",
        desc: "可投放产品清单，由运营在门户维护。",
        serviceStatus: "启用", status: "同步成功", lastSync: "2026-08-19 18:40", lastSuccessSync: "2026-08-19 18:40",
        nextSync: "按维护写入", owner: "李雨航", dimension: true, maintainMode: "portal",
        lastMaintained: "2026-08-19 18:40", maintainer: "李雨航",
        fields: [
          { name: "product_id", type: "VARCHAR", comment: "产品 ID", remark: "", dictId: "" },
          { name: "product_name", type: "VARCHAR", comment: "产品名称", remark: "", dictId: "" },
          { name: "biz_line", type: "VARCHAR", comment: "业务线", remark: "", dictId: "DICT003" },
          { name: "row_status", type: "VARCHAR", comment: "状态", remark: "", dictId: "DICT004" }
        ],
        rows: [
          { product_id: "P001", product_name: "权益会员包", biz_line: "equity", row_status: "1" },
          { product_id: "P002", product_name: "电竞流量包", biz_line: "haoka", row_status: "1" },
          { product_id: "P003", product_name: "存量通话包", biz_line: "stock", row_status: "1" }
        ]
      });

      const apiConfigs = [
        {
          name: "广告投放日报接口",
          assetTable: "dm_ad_plan_daily_media_account_product_performance_detail",
          database: "prod_callup",
          fieldNames: ["stat_date", "media_source", "plan_id", "cost", "activate_cnt", "cpa"],
          assets: [
            { database: "prod_callup", table: "dm_ad_plan_daily_media_account_product_performance_detail", fieldNames: ["stat_date", "media_source", "plan_id", "cost", "activate_cnt", "cpa"] },
            { database: "prod_cloud", table: "dwd_user_profile_tag", fieldNames: ["user_id", "tag_code", "tag_value"] }
          ],
          usage: "投放系统每日拉取计划消耗与转化数据。",
          rateLimit: "每分钟 120 次",
          tokenStatus: "启用",
          creator: "黄佩贤",
          createdAt: "2026-06-26 11:05",
          lastCall: "2026-06-26 13:21",
          callCount: 36,
          token: "bjgw_live_9f2a****7c31"
        },
        {
          name: "用户标签查询接口",
          assetTable: "dwd_user_profile_tag",
          database: "prod_cloud",
          fieldNames: ["user_id", "tag_code", "tag_value"],
          usage: "客服系统查询用户基础标签，辅助用户分层判断。",
          rateLimit: "每分钟 60 次",
          tokenStatus: "启用",
          creator: "李雨航",
          createdAt: "2026-06-26 10:32",
          lastCall: "2026-06-26 12:40",
          callCount: 18,
          token: "bjgw_live_42d8****19aa"
        }
      ];

      [
        ["媒体账户效果查询", "媒体账户日常效果查询", "启用", 3],
        ["渠道归因明细接口", "增长系统查询渠道归因结果", "启用", 5],
        ["用户订单查询接口", "客服系统查询用户订单", "启用", 2],
        ["产品 ROI 查询接口", "经营分析查询产品 ROI", "启用", 4],
        ["账户健康度接口", "投放平台查询账户健康度", "启用", 1],
        ["历史消耗归档接口", "历史系统归档调用", "启用", 2],
        ["用户生命周期接口", "运营系统查询生命周期阶段", "启用", 3],
        ["设备关系查询接口", "风控系统查询设备关系", "停用", 1],
        ["广告组转化接口", "投放平台查询广告组转化", "启用", 2],
        ["媒体消耗汇总接口", "财务侧核对媒体消耗", "启用", 5]
      ].forEach(([name, usage, tokenStatus, tableCount], demoIndex) => {
        const assets = dataAssets.filter(asset => asset.status === "同步成功").slice(0, tableCount).map(asset => ({
          database: asset.database, table: asset.table, fieldNames: asset.fields.slice(0, 3).map(field => field.name)
        }));
        apiConfigs.push({
          name, assetTable: assets[0].table, database: assets[0].database, fieldNames: assets[0].fieldNames, assets, usage,
          rateLimit: `每分钟 ${60 + demoIndex * 20} 次`, tokenStatus, creator: demoIndex % 2 ? "李雨航" : "黄佩贤",
          createdAt: "2026-06-25 10:20", lastCall: tokenStatus === "启用" ? "2026-06-26 15:10" : "-",
          callCount: 6 + demoIndex * 3, token: `bjgw_live_demo_${demoIndex + 1}****`
        });
      });

      apiConfigs.forEach(api => {
        if (!Array.isArray(api.assets) || !api.assets.length) {
          api.assets = [{ database: api.database, table: api.assetTable, fieldNames: api.fieldNames || [] }];
        }
        const legacyRate = Number(String(api.rateLimit || "").match(/\d+/)?.[0]) || 60;
        api.assets = api.assets.map(item => ({ ...item, rateLimit: Number(item.rateLimit) || legacyRate }));
        api.callCount30d = api.callCount30d ?? api.callCount ?? 0;
      });

      let activeGroupIndex = 0;
      let groupDirty = false;
      let groupDetailTab = "menus";
      let openGroupActionIndex = null;

      const pageMeta = {
        "灵犀智析": ["灵犀智析", "通过对话或飞书机器人发起数据分析，仅可分析你有权限的数据表。", ""],
        "Skill 配置": ["Skill 配置", "管理可用于灵犀智析和飞书机器人的分析 skill：版本、提示词、灰度发布与试跑。", "上传 Skill"],
        "菜单管理": ["菜单管理", "维护门户侧边导航结构：层级、图标、排序、组件路径与权限标识。", "添加"],
        "模型配置": ["模型配置", "管理灵犀智析可用的模型：来自中转站的全部模型，可禁用历史或不可用模型。", ""],
        "数据看板": ["数据看板", "", "新增看板入口"],
        "看板管理": ["看板管理", "", "新增看板"],
        "表管理": ["表管理", "同步来自 StarRocks 的表和字段元数据，沉淀可对外服务的数据资产。", "新增表"],
        "维表管理": ["维表管理", "在线维护可编辑的业务维表数据，可由表管理标记或在此直接新建。", "新增维表"],
        "维表数据维护": ["维表数据维护", "按字段维护维表行数据，保存后写回门户维表。", ""],
        "字典管理": ["字典管理", "维护多表共用的编码字典和枚举值，供表字段关联后转成中文。", "新增字典"],
        "数据开放平台": ["数据开放平台", "选择数据资产和授权字段，生成 API 网关调用 token。", "新增 API"],
        "新增API": ["新增 API", "选择多张已启用数据表，配置返回字段与调用频次。", ""],
        "人群包管理": ["人群包管理", "", "新建人群包"],
        "新建人群包": ["新建人群包", "标签圈选或 SQL 模式定义人群，配置输出序列化与交付方式。", ""],
        "标签管理": ["标签管理", "可圈选的标签主体表与字段元数据，含枚举值与覆盖率。", ""],
        "人群包推送渠道": ["人群包推送渠道", "管理可复用的 OSS / SFTP 推送目标，供人群包定时推送引用。", "新增推送目标"],
        "用户管理": ["用户管理", "", "同步飞书用户"],
        "权限组": ["权限组", "", "新增权限组"],
        "配置权限": ["配置权限", "编辑用户可访问菜单和 Quick BI 看板范围，当前菜单仅包含数据看板、用户管理。", "保存权限"],
        "Quick BI 展示": ["Quick BI 展示", "展示已迁移的 Quick BI 看板内容。", "打开 Quick BI"]
      };

      let activePage = "灵犀智析";
      let activeCategory = "全部";
      let activeBoardManageCategory = "全部分类";
      let activeBoardManageOwner = "全部负责人";
      let activeBoardManageStatus = "已上线";
      let activeUserGroup = "全部权限组";
      let activeUserIndex = 0;
      let activeBoard = migratedBoards[0];
      const favoriteBoardIds = new Set(["QB_001"]);
      let favoritesExpanded = true;
      let boardSearchKeyword = "";
      let boardManagePage = 1;
      let boardManagePageSize = 10;
      let userManagePage = 1;
      let userManagePageSize = 10;
      let assetManagePage = 1;
      let assetManagePageSize = 10;
      let apiManagePage = 1;
      let apiManagePageSize = 10;
      let activeAssetServiceStatus = "启用";
      let activeApiStatus = "启用";
      const simpleTabs = [{ name: "灵犀智析", page: "灵犀智析", icon: "analysis", closable: false }];
      const nav = document.getElementById("nav");
      const pageTitle = document.getElementById("pageTitle");
      const pageSubtitle = document.getElementById("pageSubtitle");
      const tabsBar = document.getElementById("tabsBar");
      const primaryAction = document.getElementById("primaryAction");
      const toast = document.getElementById("toast");
      const drawer = document.getElementById("drawer");
      const drawerMask = document.getElementById("drawerMask");
      const drawerTitle = document.getElementById("drawerTitle");
      const drawerBody = document.getElementById("drawerBody");
      const dashboardView = document.getElementById("dashboardView");
      const dataBoardView = document.getElementById("dataBoardView");
      const userManagementView = document.getElementById("userManagementView");
      const formModal = document.getElementById("formModal");
      const formTitle = document.getElementById("formTitle");
      const formBody = document.getElementById("formBody");
      const confirmModal = document.getElementById("confirmModal");
      const confirmTitle = document.getElementById("confirmTitle");
      const confirmText = document.getElementById("confirmText");
      const confirmOk = document.getElementById("confirmOk");
      const confirmCancel = document.getElementById("confirmCancel");
      const noPermissionView = document.getElementById("noPermissionView");
      let pendingConfirm = null;
      let formModalOnClose = null;

      function safeText(value) {
        return String(value).replace(/[&<>"']/g, char => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "\"": "&quot;",
          "'": "&#39;"
        }[char]));
      }

      function openSimpleDrawer() {
        document.body.style.overflow = "hidden";
        drawer.classList.add("open");
        drawerMask.classList.add("open");
      }

      function closeSimpleDrawer() {
        drawer.classList.remove("open");
        drawerMask.classList.remove("open");
        document.body.style.overflow = "";
      }

      function showToast(text) {
        toast.textContent = text;
        toast.classList.add("show");
        clearTimeout(window.toastTimer);
        window.toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
      }

      function copyTokenValue(token) {
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(token).catch(() => {});
        } else {
          const textarea = document.createElement("textarea");
          textarea.value = token;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          textarea.remove();
        }
        showToast("Token 已复制");
      }

      function showFormModal(title, html, onClose = null) {
        formTitle.textContent = title;
        formBody.innerHTML = html;
        formModalOnClose = onClose;
        formModal.classList.add("open");
      }

      function closeFormModal() {
        formModal.classList.remove("open");
        formBody.innerHTML = "";
        const onClose = formModalOnClose;
        formModalOnClose = null;
        if (onClose) onClose();
      }

      function showGeneratedTokenModal(api) {
        const assetCount = getApiAssets(api).length;
        const fieldCount = getApiFieldCount(api);
        showFormModal("Token 生成成功", `
          <p>请妥善保存 Token，调用数据服务时需作为身份凭证。</p>
          <div class="token-result-summary">
            <div class="token-result-row"><span>API 名称</span><strong>${safeText(api.name)}</strong></div>
            <div class="token-result-row"><span>API 简介</span><strong>关联 ${assetCount} 张表，共授权 ${fieldCount} 个字段</strong></div>
            <div class="token-result-row"><span>使用场景</span><strong>${safeText(api.usage)}</strong></div>
          </div>
          <div class="token-result-box">
            <span class="token-result-label">调用 Token</span>
            <code class="token-result-code">${safeText(api.token)}</code>
          </div>
          <div class="modal-actions">
            <button class="btn ghost" data-finish-generated-token>完成</button>
            <button class="btn primary" data-copy-generated-token>复制 Token</button>
          </div>
        `, () => {
          setSimplePage("数据开放平台");
          renderApiConfigs(document.getElementById("apiSearch").value);
        });
        document.querySelector("[data-copy-generated-token]").onclick = () => copyTokenValue(api.token);
        document.querySelector("[data-finish-generated-token]").onclick = closeFormModal;
      }

      function showConfirm(title, text, onConfirm) {
        confirmTitle.textContent = title;
        confirmText.textContent = text;
        pendingConfirm = onConfirm;
        confirmModal.classList.add("open");
      }

      function closeConfirm() {
        confirmModal.classList.remove("open");
        pendingConfirm = null;
      }

      function countByCategory(category) {
        const onlineBoards = migratedBoards.filter(board => board.status === "已上线");
        if (category === "全部") return onlineBoards.length;
        return onlineBoards.filter(board => board.category === category).length;
      }

      function pageIcon(page) {
        if (page === "灵犀智析") return "analysis";
        if (page === "数据看板" || page === "Quick BI 展示") return "dashboard";
        if (page === "看板管理") return "asset";
        if (page === "表管理" || page === "维表管理" || page === "维表数据维护" || page === "字典管理") return "asset";
        if (page === "数据开放平台" || page === "新增API") return "gateway";
        if (page === "人群包管理" || page === "新建人群包") return "gateway";
        if (page === "标签管理") return "asset";
        if (page === "人群包推送渠道") return "push";
        if (page === "用户管理" || page === "权限组") return "permission";
        if (page === "菜单管理" || page === "模型配置" || page === "Skill 配置") return "system";
        return "asset";
      }

      function navIconPath(icon, active = false) {
        const icons = {
          push: { default: "assets/nav-push-default.svg", active: "assets/nav-push-active.svg" },
          dashboard: { default: "assets/nav-dashboard-default.png", active: "assets/nav-dashboard-active.png" },
          gateway: { default: "assets/nav-service-default.png", active: "assets/nav-service-active.png" },
          asset: { default: "assets/nav-asset-default.png", active: "assets/nav-asset-active.png" },
          permission: { default: "assets/nav-permission-default.png", active: "assets/nav-permission-active.png" },
          system: { default: "assets/nav-system-default.svg", active: "assets/nav-system-active.svg" },
          analysis: { default: "assets/nav-analysis-default.svg", active: "assets/nav-analysis-active.svg" }
        };
        return (icons[icon] || icons.asset)[active ? "active" : "default"];
      }

      function upsertTab(tab) {
        const existing = simpleTabs.find(item => item.name === tab.name);
        if (existing) Object.assign(existing, tab);
        else simpleTabs.push(tab);
      }

      function setGroupDirty(dirty) {
        groupDirty = dirty;
        const saveBtn = document.getElementById("saveGroupBtn");
        if (!saveBtn) return;
        saveBtn.disabled = !dirty;
        saveBtn.style.opacity = dirty ? "1" : ".45";
        saveBtn.style.cursor = dirty ? "pointer" : "not-allowed";
      }

      function validateRequiredFields(fieldIds) {
        let valid = true;
        fieldIds.forEach(id => {
          const field = document.getElementById(id);
          const wrap = document.querySelector(`[data-field-wrap="${id}"]`);
          const empty = !field || !field.value.trim();
          wrap?.classList.toggle("invalid", empty);
          if (empty && valid) field?.focus();
          if (empty) valid = false;
        });
        return valid;
      }

      function renderPagination(containerId, total, page, pageSize, prefix) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
        const end = Math.min(total, page * pageSize);
        container.innerHTML = `
          <span>共 ${total} 条，当前 ${start}-${end}</span>
          <div class="pagination-controls">
            <select class="toolbar-select pagination-page-size" data-page-size="${prefix}">
              ${[10, 20, 50].map(size => `<option value="${size}" ${size === pageSize ? "selected" : ""}>${size} 条/页</option>`).join("")}
            </select>
            <button class="pagination-btn" data-page-prev="${prefix}" ${page <= 1 ? "disabled" : ""}>‹</button>
            <span>${page} / ${totalPages}</span>
            <button class="pagination-btn" data-page-next="${prefix}" ${page >= totalPages ? "disabled" : ""}>›</button>
          </div>
        `;
      }
      window.renderPagination = renderPagination;

      function setHeader(page) {
        const meta = pageMeta[page] || pageMeta["数据看板"];
        pageTitle.textContent = meta[0];
        pageSubtitle.textContent = meta[1];
        primaryAction.textContent = meta[2];
        primaryAction.classList.toggle("hidden", !meta[2]);
        if (!["Quick BI 展示", "新增API", "新建人群包", "维表数据维护"].includes(page)) upsertTab({ name: meta[0], page, icon: pageIcon(page), closable: page !== "数据看板" });
        tabsBar.innerHTML = simpleTabs.map(tab => `
          <button class="tab ${tab.page === page && (!Object.prototype.hasOwnProperty.call(tab, "boardIndex") || activeBoard.name === tab.name) ? "active" : ""}" data-simple-tab="${safeText(tab.name)}">
            <img class="nav-icon ${tab.icon}" src="${navIconPath(tab.icon, tab.page === page)}" alt="" aria-hidden="true" /><span>${safeText(tab.name)}</span>
            ${tab.closable ? `<span class="tab-close" data-close-simple-tab="${safeText(tab.name)}">×</span>` : ""}
          </button>
        `).join("");
      }

      function navBadgeList(entry) {
        if (Array.isArray(entry?.badge)) return entry.badge;
        return entry?.badge ? [entry.badge] : [];
      }

      function navBadgeHtml(entry) {
        const badges = navBadgeList(entry);
        if (!badges.length) return "";
        return `<span class="nav-badge-group">${badges.map(badge => `<span class="nav-new-badge nav-ver-${String(badge).replace(".", "")}">${badge}</span>`).join("")}</span>`;
      }

      function renderSimpleNav() {
        nav.innerHTML = simpleNav.map(section => {
          const isActive = pageIcon(activePage) === section.icon;
          return `
          <div class="nav-group">
            <button class="nav-head ${isActive ? "active" : ""}" data-title="${safeText(section.group)}" ${section.items.length === 1 ? `data-simple-page="${section.items[0].name}"` : `data-simple-group="${section.group}"`}>
              <img class="nav-icon ${section.icon}" src="${navIconPath(section.icon, isActive)}" alt="" aria-hidden="true" />
              <span class="nav-title">${section.group}</span>
              ${navBadgeHtml(section)}
              ${section.items.length > 1 ? `<span class="nav-arrow">⌄</span>` : ""}
            </button>
            ${section.items.length > 1 ? `<div class="subnav" data-title="${section.group}">
              ${section.items.map(item => `
                <button class="${item.name === activePage ? "active" : ""}" data-simple-page="${item.name}">
                  <span>${item.name}</span>
                  ${navBadgeHtml(item)}
                </button>
              `).join("")}
            </div>` : ""}
          </div>
        `;
        }).join("");
      }

      // 数据看板：左侧分类树 + 右侧看板内容（点击左树直接看右侧看板）
      let activeBoardIndex = -1;
      const btExpanded = {};
      function boardSeed(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
      function miniBar(items) {
        const w = 440, h = 200, pad = 28, gap = 16, max = Math.max(...items.map(i => i[1]));
        const bw = (w - pad - gap * items.length) / items.length;
        const bars = items.map((it, i) => { const bh = it[1] / max * (h - 46); const x = pad + i * (bw + gap); const y = h - 24 - bh; return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="4" fill="var(--blue)" opacity="0.88"></rect><text x="${(x + bw / 2).toFixed(1)}" y="${h - 8}" font-size="10" fill="#98a2b3" text-anchor="middle">${safeText(it[0])}</text>`; }).join("");
        return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="200">${bars}</svg>`;
      }
      function miniLine(seed) {
        const w = 360, h = 200, pad = 28, pts = []; let v = seed % 50 + 30;
        for (let i = 0; i < 7; i++) { v = Math.max(12, v * 1.05 + ((seed >> i) % 40) - 18); pts.push(v); }
        const max = Math.max(...pts), stepX = (w - pad - 14) / 6;
        const P = pts.map((p, i) => [pad + i * stepX, h - 28 - (p / max) * (h - 56)]);
        const path = P.map((p, i) => (i ? "L" : "M") + p[0].toFixed(0) + " " + p[1].toFixed(0)).join(" ");
        const dots = P.map(p => `<circle cx="${p[0].toFixed(0)}" cy="${p[1].toFixed(0)}" r="3" fill="var(--blue)"></circle>`).join("");
        return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="200"><path d="${path}" fill="none" stroke="var(--blue)" stroke-width="2.4"></path>${dots}</svg>`;
      }
      function showSelectedBoard() {
        const pane = document.getElementById("boardPane"); if (!pane) return;
        const online = migratedBoards.filter(b => b.status === "已上线");
        if (activeBoardIndex < 0 || !migratedBoards[activeBoardIndex] || migratedBoards[activeBoardIndex].status !== "已上线") activeBoardIndex = online.length ? migratedBoards.indexOf(online[0]) : -1;
        const b = migratedBoards[activeBoardIndex];
        if (!b) { pane.innerHTML = '<div class="empty-state" style="margin:0"><div><h2>暂无可展示看板</h2></div></div>'; return; }
        const s = boardSeed(b.name);
        const cost = s % 900000 + 100000, conv = s % 40000 + 5000, roi = ((s % 300) / 100 + 0.8).toFixed(2), users = s % 800000 + 200000;
        const media = [["巨量", s % 90 + 20], ["广点通", s % 70 + 15], ["快手", s % 50 + 10], ["OPPO", s % 40 + 8], ["VIVO", s % 30 + 6]];
        pane.innerHTML = `
          <div class="bp-head">
            <div><span class="pill blue">${safeText(b.category)}</span><h2>${safeText(b.name)}</h2>
              <div class="bp-sub">Quick BI 嵌入 · 负责人 ${safeText(b.owner || "-")} · 已按登录身份加载（行级权限）</div></div>
            <button class="btn ghost" data-open-full="${activeBoardIndex}">全屏打开</button>
          </div>
          <div class="bp-board">
            <div class="bp-kpis">
              <div class="bp-kpi"><div class="t">消耗</div><div class="v">¥${(cost / 10000).toFixed(1)}万</div></div>
              <div class="bp-kpi"><div class="t">转化数</div><div class="v">${conv.toLocaleString()}</div></div>
              <div class="bp-kpi"><div class="t">ROI</div><div class="v">${roi}</div></div>
              <div class="bp-kpi"><div class="t">触达用户</div><div class="v">${(users / 10000).toFixed(1)}万</div></div>
            </div>
            <div class="bp-charts">
              <div class="bp-card"><h3>媒体渠道消耗</h3>${miniBar(media)}</div>
              <div class="bp-card"><h3>近 7 日趋势</h3>${miniLine(s)}</div>
            </div>
          </div>`;
      }
      function renderBoardTree() {
        const treeEl = document.getElementById("boardTree"); if (!treeEl) return;
        const kw = (document.getElementById("boardTreeSearch").value || "").trim().toLowerCase();
        const online = migratedBoards.filter(b => b.status === "已上线");
        document.getElementById("boardTreeCount").textContent = online.length;
        const cats = []; online.forEach(b => { if (!cats.includes(b.category)) cats.push(b.category); });
        if (!Object.keys(btExpanded).length && cats.length) btExpanded[cats[0]] = true;
        if (activeBoardIndex < 0 && online.length) activeBoardIndex = migratedBoards.indexOf(online[0]);
        const boardItem = board => {
          const index = migratedBoards.indexOf(board);
          const isFavorite = favoriteBoardIds.has(board.quickBiId);
          return `<div class="bt-item-row">
            <button class="bt-item ${index === activeBoardIndex ? "active" : ""}" data-bt-board="${index}">${safeText(board.name)}</button>
            <button class="bt-favorite-toggle ${isFavorite ? "is-favorite" : ""}" data-bt-favorite="${index}" aria-label="${isFavorite ? "取消收藏" : "收藏"}" aria-pressed="${isFavorite}">${isFavorite ? "&#9733;" : "&#9734;"}</button>
          </div>`;
        };
        const favoriteBoards = online.filter(board => favoriteBoardIds.has(board.quickBiId));
        const matchedFavorites = favoriteBoards.filter(board => !kw || board.name.toLowerCase().includes(kw));
        const favoritesMarkup = (!kw || matchedFavorites.length) ? `<div class="bt-group bt-favorites ${favoritesExpanded ? "open" : ""}">
          <button class="bt-group-head" data-bt-favorites><span class="bt-favorite-symbol">&#9733;</span><span class="bt-cat">我的收藏</span><span class="bt-caret">▸</span><span class="bt-count">${favoriteBoards.length}</span></button>
          <div class="bt-items">${matchedFavorites.map(boardItem).join("")}</div>
        </div>` : "";
        const categoryMarkup = cats.map(cat => {
          const boards = online.filter(b => b.category === cat && (!kw || b.name.toLowerCase().includes(kw)));
          if (kw && !boards.length) return "";
          const open = kw ? true : !!btExpanded[cat];
          return `<div class="bt-group ${open ? "open" : ""}">
            <button class="bt-group-head" data-bt-group="${safeText(cat)}"><span class="bt-caret">▸</span><span class="bt-cat">${safeText(cat)}</span><span class="bt-count">${online.filter(b => b.category === cat).length}</span></button>
            <div class="bt-items">${boards.map(boardItem).join("")}</div>
          </div>`;
        }).join("");
        treeEl.innerHTML = `${favoritesMarkup}${categoryMarkup}` || `<div style="color:#98a2b3;font-size:13px;padding:12px">未找到匹配看板</div>`;
        showSelectedBoard();
      }
      function renderBoardCategories() { renderBoardTree(); }
      function renderBoardDirectory() { renderBoardTree(); }
      (function bindBoardTree() {
        const dv = document.getElementById("dataBoardView"); if (!dv) return;
        dv.addEventListener("click", e => {
          const full = e.target.closest("[data-open-full]"); const b = e.target.closest("[data-bt-board]"); const g = e.target.closest("[data-bt-group]");
          const favoriteButton = e.target.closest("[data-bt-favorite]"); const favoriteGroup = e.target.closest("[data-bt-favorites]");
          if (full) { openQuickBi(Number(full.dataset.openFull)); return; }
          if (favoriteButton) {
            const board = migratedBoards[Number(favoriteButton.dataset.btFavorite)];
            if (favoriteBoardIds.has(board.quickBiId)) favoriteBoardIds.delete(board.quickBiId);
            else favoriteBoardIds.add(board.quickBiId);
            renderBoardTree();
            return;
          }
          if (favoriteGroup) { favoritesExpanded = !favoritesExpanded; renderBoardTree(); return; }
          if (b) { activeBoardIndex = Number(b.dataset.btBoard); renderBoardTree(); return; }
          if (g) { const c = g.dataset.btGroup; btExpanded[c] = !btExpanded[c]; renderBoardTree(); return; }
        });
        const s = document.getElementById("boardTreeSearch"); if (s) s.addEventListener("input", renderBoardTree);
      })();

      function renderBoardManageFilters() {
        const categorySelect = document.getElementById("boardManageCategory");
        if (!categorySelect) return;
        categorySelect.innerHTML = ["全部分类", ...boardCategories.filter(category => category !== "全部")].map(category => `
          <option ${category === activeBoardManageCategory ? "selected" : ""}>${safeText(category)}</option>
        `).join("");
        const ownerSelect = document.getElementById("boardManageOwner");
        const owners = [...new Set(migratedBoards.map(board => board.owner).filter(Boolean))];
        ownerSelect.innerHTML = ["全部负责人", ...owners].map(owner => `
          <option ${owner === activeBoardManageOwner ? "selected" : ""}>${safeText(owner)}</option>
        `).join("");
        document.querySelectorAll("[data-board-status-filter]").forEach(button => button.classList.toggle("active", button.dataset.boardStatusFilter === activeBoardManageStatus));
      }

      function renderBoardManagement(keyword = "") {
        renderBoardManageFilters();
        const normalized = keyword.trim().toLowerCase();
        const rows = migratedBoards.filter(board => {
          const matchKeyword = !normalized || [board.name, board.category, board.quickBiId].some(value => String(value).toLowerCase().includes(normalized));
          const matchCategory = activeBoardManageCategory === "全部分类" || board.category === activeBoardManageCategory;
          const matchOwner = activeBoardManageOwner === "全部负责人" || board.owner === activeBoardManageOwner;
          const matchStatus = board.status === activeBoardManageStatus;
          return matchKeyword && matchCategory && matchOwner && matchStatus;
        });
        const totalPages = Math.max(1, Math.ceil(rows.length / boardManagePageSize));
        boardManagePage = Math.min(boardManagePage, totalPages);
        const pagedRows = rows.slice((boardManagePage - 1) * boardManagePageSize, boardManagePage * boardManagePageSize);

        document.getElementById("boardManageBody").innerHTML = pagedRows.map(board => `
          <tr>
            <td><strong>${safeText(board.name)}</strong></td>
            <td><span class="pill blue">${safeText(board.category)}</span></td>
            <td>${safeText(board.quickBiId || "-")}</td>
            <td title="${safeText(board.desc || "")}">${safeText(board.desc || "-")}</td>
            <td>${(board.groups || []).map(group => `<span class="pill">${safeText(group)}</span>`).join(" ") || `<span class="pill orange">未授权</span>`}</td>
            <td>${safeText(board.owner || "-")}</td>
            <td><button class="cp-toggle-btn ${board.status === "已上线" ? "on" : ""}" data-toggle-board="${migratedBoards.indexOf(board)}" aria-label="${board.status === "已上线" ? "下线" : "上线"}${safeText(board.name)}"></button></td>
            <td>${safeText(board.updatedAt || "-")}</td>
            <td>
              <div style="display:flex;gap:10px;align-items:center">
                <button class="btn text" data-edit-board="${migratedBoards.indexOf(board)}">编辑</button>
              </div>
            </td>
          </tr>
        `).join("") || `<tr><td colspan="9" style="text-align:center;color:#8a94a4;height:88px">暂无匹配看板</td></tr>`;
        renderPagination("boardPagination", rows.length, boardManagePage, boardManagePageSize, "board");
      }

      function syncAssetFilters() {
        const fill = (id, label, values) => {
          const select = document.getElementById(id);
          const selected = select.value;
          select.innerHTML = `<option value="">全部${label}</option>${[...new Set(values.filter(Boolean))].sort().map(value => `<option value="${safeText(value)}">${safeText(value)}</option>`).join("")}`;
          if (values.includes(selected)) select.value = selected;
        };
        fill("assetSourceFilter", "数据源", dataAssets.map(asset => asset.source));
        fill("assetDatabaseFilter", "库名", dataAssets.map(asset => asset.database));
      }

      function renderDataAssets(keyword = "") {
        syncAssetFilters();
        const normalized = keyword.trim().toLowerCase();
        const source = document.getElementById("assetSourceFilter").value;
        const database = document.getElementById("assetDatabaseFilter").value;
        const rows = dataAssets.filter(asset => {
          const text = `${asset.assetId || ""} ${asset.table} ${asset.cnName || ""} ${asset.externalName || ""}`.toLowerCase();
          const matchKeyword = !normalized || text.includes(normalized);
          const matchStatus = (asset.serviceStatus || "启用") === activeAssetServiceStatus;
          return matchKeyword && matchStatus && (!source || asset.source === source) && (!database || asset.database === database);
        });
        document.querySelectorAll("[data-asset-service-filter]").forEach(button => button.classList.toggle("active", button.dataset.assetServiceFilter === activeAssetServiceStatus));
        const totalPages = Math.max(1, Math.ceil(rows.length / assetManagePageSize));
        assetManagePage = Math.min(assetManagePage, totalPages);
        const pagedRows = rows.slice((assetManagePage - 1) * assetManagePageSize, assetManagePage * assetManagePageSize);
        document.getElementById("assetTableBody").innerHTML = pagedRows.map(asset => `
          <tr>
            <td class="asset-id-col"><strong>${safeText(asset.assetId)}</strong></td>
            <td class="asset-external-name-col" data-asset-cell-tooltip="${safeText(asset.externalName || "-")}"><strong class="asset-external-name">${safeText(asset.externalName || "-")}</strong></td>
            <td data-asset-cell-tooltip="${safeText(asset.table)}"><span class="table-name-cell">${safeText(asset.table)}</span>${window.cpTag && window.cpTag.has(asset.table) ? ' <span class="pill blue" style="margin-left:4px">标签表</span>' : ""}</td>
            <td data-asset-cell-tooltip="${safeText(asset.source)}">${safeText(asset.source)}</td>
            <td data-asset-cell-tooltip="${safeText(asset.database)}">${safeText(asset.database)}</td>
            <td data-asset-cell-tooltip="${safeText(asset.cnName || "-")}">${safeText(asset.cnName || "-")}</td>
            <td data-asset-cell-tooltip="${safeText(asset.desc || "-")}">${safeText(asset.desc || "-")}</td>
            <td title="${asset.fields.length}">${asset.fields.length}</td>
            <td title="${safeText(asset.serviceStatus || "启用")}"><button class="cp-toggle-btn ${(asset.serviceStatus || "启用") === "启用" ? "on" : ""}" data-toggle-asset-service="${dataAssets.indexOf(asset)}" aria-label="${(asset.serviceStatus || "启用") === "启用" ? "停用" : "启用"}${safeText(asset.table)}"></button></td>
            <td data-asset-cell-tooltip="${safeText(asset.lastSuccessSync || "-")}">${safeText(asset.lastSuccessSync || "-")}</td>
            <td title="${apiConfigs.filter(api => apiMatchesAsset(api, asset)).reduce((sum, api) => sum + (api.callCount30d || 0), 0).toLocaleString()}">${apiConfigs.filter(api => apiMatchesAsset(api, asset)).reduce((sum, api) => sum + (api.callCount30d || 0), 0).toLocaleString()}</td>
            <td>
              <div style="display:flex;gap:10px;align-items:center">
                <button class="btn text" data-asset-detail="${dataAssets.indexOf(asset)}">详情</button>
              </div>
            </td>
          </tr>
        `).join("") || `<tr><td colspan="12" style="text-align:center;color:#8a94a4;height:88px">暂无匹配数据资产</td></tr>`;
        renderPagination("assetPagination", rows.length, assetManagePage, assetManagePageSize, "asset");
      }
      window.renderDataAssets = renderDataAssets;
      window.dataAssets = dataAssets;

      function getApiAssets(api) {
        if (Array.isArray(api.assets) && api.assets.length) return api.assets;
        return [{
          database: api.database,
          table: api.assetTable,
          fieldNames: api.fieldNames || [],
          rateLimit: Number(String(api.rateLimit || "").match(/\d+/)?.[0]) || 60
        }];
      }

      function getAssetExternalName(item) {
        return dataAssets.find(asset => asset.database === item.database && asset.table === item.table)?.externalName || item.table;
      }

      function getAssetChineseName(item) {
        return dataAssets.find(asset => asset.database === item.database && asset.table === item.table)?.cnName || "-";
      }

      function getApiAssetSummary(api) {
        const assets = getApiAssets(api);
        return `共 ${assets.length} 张表`;
      }

      function getApiAssetTitle(api) {
        return getApiAssets(api).map(asset => `${getAssetExternalName(asset)}（${getAssetChineseName(asset)}）`).join("\n");
      }

      function showApiAssetTooltip(anchor) {
        const tooltip = document.getElementById("apiAssetTooltip");
        tooltip.textContent = anchor.dataset.apiAssetTooltip || anchor.dataset.assetCellTooltip || "";
        tooltip.classList.add("visible");
        const anchorRect = anchor.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const left = Math.max(16, Math.min(anchorRect.left, window.innerWidth - tooltipRect.width - 16));
        const belowTop = anchorRect.bottom + 8;
        const top = belowTop + tooltipRect.height <= window.innerHeight - 16
          ? belowTop
          : Math.max(16, anchorRect.top - tooltipRect.height - 8);
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      }

      function hideApiAssetTooltip() {
        document.getElementById("apiAssetTooltip").classList.remove("visible");
      }

      function getApiFieldCount(api) {
        return getApiAssets(api).reduce((sum, asset) => sum + (asset.fieldNames || []).length, 0);
      }

      function apiMatchesAsset(api, asset) {
        return getApiAssets(api).some(item => item.database === asset.database && item.table === asset.table);
      }

      function renderApiConfigs(keyword = "") {
        const normalized = keyword.trim().toLowerCase();
        const rows = apiConfigs.filter(api => {
          const text = `${api.name} ${getApiAssets(api).map(asset => `${asset.table} ${getAssetExternalName(asset)}`).join(" ")}`.toLowerCase();
          const matchKeyword = !normalized || text.includes(normalized);
          const matchStatus = api.tokenStatus === activeApiStatus;
          return matchKeyword && matchStatus;
        });
        document.querySelectorAll("[data-api-status-filter]").forEach(button => button.classList.toggle("active", button.dataset.apiStatusFilter === activeApiStatus));
        const totalPages = Math.max(1, Math.ceil(rows.length / apiManagePageSize));
        apiManagePage = Math.min(apiManagePage, totalPages);
        const pagedRows = rows.slice((apiManagePage - 1) * apiManagePageSize, apiManagePage * apiManagePageSize);
        document.getElementById("apiTableBody").innerHTML = pagedRows.map(api => `
          <tr>
            <td><strong>${safeText(api.name)}</strong></td>
            <td><span class="api-asset-summary api-asset-tooltip" data-api-asset-tooltip="${safeText(getApiAssetTitle(api))}">${safeText(getApiAssetSummary(api))}</span></td>
            <td>${getApiFieldCount(api)} 个字段</td>
            <td title="${safeText(api.usage)}">${safeText(api.usage)}</td>
            <td>${Number(api.callCount30d || 0).toLocaleString()}</td>
            <td><button class="cp-toggle-btn ${api.tokenStatus === "启用" ? "on" : ""}" data-toggle-api="${apiConfigs.indexOf(api)}" aria-label="${api.tokenStatus === "启用" ? "停用" : "启用"}${safeText(api.name)}"></button></td>
            <td>${safeText(api.creator)}</td>
            <td>${safeText(api.lastCall)}</td>
            <td>
              <div style="display:flex;gap:10px;align-items:center">
                <button class="btn text" data-edit-api="${apiConfigs.indexOf(api)}">编辑</button>
                <button class="btn text" data-copy-token="${apiConfigs.indexOf(api)}">复制 token</button>
              </div>
            </td>
          </tr>
        `).join("") || `<tr><td colspan="9" style="text-align:center;color:#8a94a4;height:88px">暂无匹配 API</td></tr>`;
        renderPagination("apiPagination", rows.length, apiManagePage, apiManagePageSize, "api");
      }

      function openSyncTableModal() {
        showFormModal("新增 StarRocks 表", `
          <div class="detail-block">
            <h3>表信息</h3>
            <div class="form-field" style="margin-bottom:12px">
              <label>数据源</label>
              <select class="toolbar-select" id="syncSourceName" style="width:100%;height:40px">
                <option>StarRocks-拉端</option>
                <option>StarRocks-存量</option>
              </select>
            </div>
            <div class="form-field required" data-field-wrap="syncDatabaseName" style="margin-bottom:12px">
              <label>库名</label>
              <select class="toolbar-select" id="syncDatabaseName" style="width:100%;height:40px">
                <option>prod_callup</option>
                <option>prod_cloud</option>
              </select>
              <span class="field-error">请选择库名</span>
            </div>
            <div class="form-field required" data-field-wrap="syncTableName">
              <label>表名</label>
              <input class="toolbar-input" id="syncTableName" placeholder="例如 dm_ad_plan_daily" />
              <span class="field-error">表名只能使用小写英文和下划线，例如 dm_ad_plan_daily</span>
            </div>
            <div class="form-field required" data-field-wrap="syncExternalName" style="margin-top:12px">
              <label>对外表名</label>
              <input class="toolbar-input" id="syncExternalName" placeholder="例如 open_ad_plan_daily" />
              <span class="field-error">只能使用小写英文和下划线，例如 open_ad_plan_daily</span>
            </div>
            <div class="form-field" style="margin-top:12px">
              <label>表描述</label>
              <textarea class="toolbar-input" id="syncTableDesc" style="height:80px;padding-top:10px;resize:none" placeholder="补充表用途、业务口径或接口使用说明"></textarea>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn ghost" id="cancelSyncTable">取消</button>
            <button class="btn primary" id="confirmSyncTable">新增并同步</button>
          </div>
        `);
        document.getElementById("cancelSyncTable").addEventListener("click", closeFormModal);
        document.getElementById("confirmSyncTable").addEventListener("click", () => {
          if (!validateRequiredFields(["syncDatabaseName", "syncTableName", "syncExternalName"])) {
            showToast("请补全必填字段");
            return;
          }
          const source = document.getElementById("syncSourceName").value;
          const database = document.getElementById("syncDatabaseName").value.trim();
          const table = document.getElementById("syncTableName").value.trim();
          const externalName = document.getElementById("syncExternalName").value.trim();
          const validTableName = /^[a-z]+(?:_[a-z]+)*$/.test(table);
          const validExternalName = /^[a-z]+(?:_[a-z]+)*$/.test(externalName);
          document.querySelector('[data-field-wrap="syncTableName"]')?.classList.toggle("invalid", !validTableName);
          document.querySelector('[data-field-wrap="syncExternalName"]')?.classList.toggle("invalid", !validExternalName);
          if (!validTableName || !validExternalName) {
            showToast("表名格式不正确");
            return;
          }
          const cnName = table.replace(/^dm_|^dwd_|^ads_/, "").split("_").map(part => ({ ad: "广告", plan: "计划", daily: "日报", user: "用户", profile: "画像", tag: "标签", request: "请求", hour: "小时" }[part] || part)).join("");
          const desc = document.getElementById("syncTableDesc").value.trim();
          const existing = dataAssets.find(asset => asset.database === database && asset.table === table);
          if (existing) {
            existing.source = source;
            existing.externalName = externalName;
            existing.cnName = cnName;
            existing.desc = desc || existing.desc;
            existing.status = "同步成功";
            existing.serviceStatus = existing.serviceStatus || "启用";
            existing.lastSync = "2026-06-26 14:30";
            existing.lastSuccessSync = "2026-06-26 14:30";
          } else {
            dataAssets.unshift({
              source,
              assetId: String(dataAssets.length + 1).padStart(3, "0"),
              database,
              table,
              cnName,
              externalName,
              desc: desc || "同步自 StarRocks，待补充表描述。",
              serviceStatus: "启用",
              status: "同步成功",
              lastSync: "2026-06-26 14:30",
              lastSuccessSync: "2026-06-26 14:30",
              nextSync: "每日 02:30",
              owner: "黄佩贤",
              fields: [
                { name: "id", type: "VARCHAR", comment: "主键 ID", remark: "同步后可补充业务说明" },
                { name: "biz_date", type: "DATE", comment: "业务日期", remark: "建议作为接口查询时间字段" },
                { name: "update_time", type: "DATETIME", comment: "更新时间", remark: "用于判断数据新鲜度" }
              ]
            });
          }
          closeFormModal();
          renderDataAssets(document.getElementById("assetSearch").value);
          showToast("StarRocks 表已新增并同步");
        });
        document.getElementById("syncTableName").addEventListener("input", event => {
          event.target.value = event.target.value.replace(/\s/g, "");
          document.querySelector('[data-field-wrap="syncTableName"]')?.classList.remove("invalid");
        });
      }

      function openApiConfigPage(index = -1) {
        const editingApi = index >= 0 ? apiConfigs[index] : null;
        const editingAssets = editingApi ? getApiAssets(editingApi) : [];
        const availableAssets = dataAssets.filter(asset =>
          asset.status === "同步成功" && ((asset.serviceStatus || "启用") === "启用" || editingAssets.some(item => item.database === asset.database && item.table === asset.table))
        );
        setSimplePage("新增API");
        pageTitle.innerHTML = `<button class="btn ghost" data-api-back style="vertical-align:middle;margin-right:12px">返回</button>${editingApi ? "编辑 API" : "新增 API"}`;
        pageSubtitle.textContent = editingApi ? "调整关联表、授权字段、调用频次与使用场景。" : "选择多张已启用数据表，配置返回字段与调用频次。";
        document.getElementById("confirmCreateApi").textContent = editingApi ? "保存配置" : "生成 Token";
        document.getElementById("newApiName").value = editingApi?.name || "";
        document.getElementById("newApiUsage").value = editingApi?.usage || "";
        document.getElementById("newApiTableSearch").value = "";

        const selectedAssetIndexes = new Set();
        const selectedFields = new Map();
        const selectedRates = new Map();
        editingAssets.forEach(item => {
          const assetIndex = availableAssets.findIndex(asset => asset.database === item.database && asset.table === item.table);
          if (assetIndex >= 0) {
            selectedAssetIndexes.add(assetIndex);
            selectedFields.set(assetIndex, new Set(item.fieldNames || []));
            selectedRates.set(assetIndex, Number(item.rateLimit) || 60);
          }
        });
        if (!editingApi && availableAssets.length) {
          selectedAssetIndexes.add(0);
          selectedFields.set(0, new Set(availableAssets[0].fields.map(field => field.name)));
          selectedRates.set(0, 60);
        }

        const renderTableOptions = () => {
          const keyword = document.getElementById("newApiTableSearch").value.trim().toLowerCase();
          const rows = availableAssets.filter(asset => !keyword || `${asset.database} ${asset.table} ${asset.externalName} ${asset.cnName} ${asset.desc}`.toLowerCase().includes(keyword));
          document.getElementById("newApiTableList").innerHTML = rows.map(asset => {
            const assetIndex = availableAssets.indexOf(asset);
            return `<label class="api-table-option" title="${safeText(asset.externalName || asset.table)}（${safeText(asset.cnName || "-")}）">
              <input type="checkbox" name="newApiAsset" value="${assetIndex}" ${selectedAssetIndexes.has(assetIndex) ? "checked" : ""} />
              <span><strong>${safeText(asset.externalName || asset.table)}</strong><span>${safeText(asset.cnName || "-")} · ${asset.fields.length} 字段</span></span>
            </label>`;
          }).join("") || `<div style="color:#8a94a4;padding:12px">暂无匹配数据表</div>`;
          document.getElementById("selectedApiTableCount").textContent = `${selectedAssetIndexes.size} 张`;
        };

        const renderFieldChecks = () => {
          const selectedAssets = [...selectedAssetIndexes].map(assetIndex => availableAssets[assetIndex]).filter(Boolean);
          document.getElementById("selectedApiTableCount").textContent = `${selectedAssets.length} 张`;
          document.querySelector('[data-field-wrap="newApiAsset"]')?.classList.toggle("invalid", !selectedAssets.length);
          document.getElementById("newApiFieldList").innerHTML = selectedAssets.map(asset => {
            const assetIndex = availableAssets.indexOf(asset);
            const allSelected = asset.fields.length > 0 && asset.fields.every(field => selectedFields.get(assetIndex)?.has(field.name));
            return `<div class="api-selected-table" data-api-field-section="${assetIndex}">
              <div class="api-selected-table-title">
                <span><strong title="${safeText(asset.externalName || asset.table)}">${safeText(asset.externalName || asset.table)}</strong><span>${safeText(asset.cnName || "-")} · ${asset.fields.length} 字段</span></span>
                <div class="api-selected-table-actions">
                  <label class="api-table-rate">调用频次 <input class="toolbar-input" type="number" min="1" step="1" data-api-rate-limit="${assetIndex}" value="${selectedRates.get(assetIndex) || 60}" /> 次/分钟</label>
                  <button class="btn text" data-select-all-fields="${assetIndex}" data-select-mode="${allSelected ? "clear" : "all"}">${allSelected ? "取消全选" : "全选字段"}</button>
                  <button class="btn text" data-remove-api-asset="${assetIndex}">移除</button>
                </div>
              </div>
              <div class="api-field-grid">${(asset.fields || []).map(field => `
                <label class="check-row">
                  <input type="checkbox" name="newApiField" data-api-asset-index="${assetIndex}" value="${safeText(field.name)}" ${selectedFields.get(assetIndex)?.has(field.name) ? "checked" : ""} />
                  <span>${safeText(field.name)} / ${safeText(field.comment || field.type)}</span>
                </label>`).join("") || `<span style="color:#8a94a4">该表暂无字段</span>`}</div>
            </div>`;
          }).join("") || `<div style="color:#8a94a4;padding:12px">请先在左侧选择数据表</div>`;
        };

        function focusApiAssetFields(assetIndex) {
          const scroller = document.querySelector("#apiCreateView .api-config-body");
          const target = document.querySelector(`[data-api-field-section="${assetIndex}"]`);
          if (!scroller || !target) return;
          const targetTop = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
          scroller.scrollTo({ top: Math.max(0, targetTop - 12), behavior: "smooth" });
        }

        renderTableOptions();
        renderFieldChecks();
        document.getElementById("newApiTableSearch").oninput = renderTableOptions;
        document.getElementById("newApiTableList").onchange = event => {
          const input = event.target.closest("input[name='newApiAsset']");
          if (!input) return;
          const assetIndex = Number(input.value);
          if (input.checked) {
            selectedAssetIndexes.add(assetIndex);
            if (!selectedFields.has(assetIndex)) selectedFields.set(assetIndex, new Set(availableAssets[assetIndex].fields.map(field => field.name)));
            if (!selectedRates.has(assetIndex)) selectedRates.set(assetIndex, 60);
          } else selectedAssetIndexes.delete(assetIndex);
          renderTableOptions();
          renderFieldChecks();
          if (input.checked) requestAnimationFrame(() => focusApiAssetFields(assetIndex));
        };
        document.getElementById("newApiFieldList").onclick = event => {
          const removeButton = event.target.closest("[data-remove-api-asset]");
          const selectAllButton = event.target.closest("[data-select-all-fields]");
          if (removeButton) {
            selectedAssetIndexes.delete(Number(removeButton.dataset.removeApiAsset));
            renderTableOptions();
            renderFieldChecks();
            return;
          }
          if (selectAllButton) {
            const assetIndex = Number(selectAllButton.dataset.selectAllFields);
            const asset = availableAssets[assetIndex];
            selectedFields.set(assetIndex, selectAllButton.dataset.selectMode === "clear" ? new Set() : new Set(asset.fields.map(field => field.name)));
            renderFieldChecks();
            requestAnimationFrame(() => focusApiAssetFields(assetIndex));
          }
        };
        document.getElementById("newApiFieldList").onchange = event => {
          const rateInput = event.target.closest("[data-api-rate-limit]");
          if (rateInput) {
            selectedRates.set(Number(rateInput.dataset.apiRateLimit), Number(rateInput.value));
            return;
          }
          const input = event.target.closest("input[name='newApiField']");
          if (!input) return;
          const assetIndex = Number(input.dataset.apiAssetIndex);
          if (!selectedFields.has(assetIndex)) selectedFields.set(assetIndex, new Set());
          if (input.checked) selectedFields.get(assetIndex).add(input.value);
          else selectedFields.get(assetIndex).delete(input.value);
          renderFieldChecks();
          requestAnimationFrame(() => focusApiAssetFields(assetIndex));
        };
        document.getElementById("newApiFieldList").oninput = event => {
          const rateInput = event.target.closest("[data-api-rate-limit]");
          if (rateInput) selectedRates.set(Number(rateInput.dataset.apiRateLimit), Number(rateInput.value));
        };
        document.getElementById("cancelCreateApi").onclick = () => setSimplePage("数据开放平台");
        document.getElementById("confirmCreateApi").onclick = () => {
          if (!validateRequiredFields(["newApiName", "newApiUsage"])) {
            showToast("请补全必填字段");
            return;
          }
          const selectedAssets = [...selectedAssetIndexes].map(assetIndex => availableAssets[assetIndex]).filter(Boolean);
          document.querySelector('[data-field-wrap="newApiAsset"]')?.classList.toggle("invalid", !selectedAssets.length);
          if (!selectedAssets.length) {
            showToast("至少选择 1 张数据表");
            return;
          }
          const invalidRate = selectedAssets.some(asset => {
            const rate = selectedRates.get(availableAssets.indexOf(asset));
            return !Number.isInteger(rate) || rate <= 0;
          });
          document.querySelectorAll("[data-api-rate-limit]").forEach(input => input.classList.toggle("invalid-input", !Number.isInteger(Number(input.value)) || Number(input.value) <= 0));
          if (invalidRate) {
            showToast("请填写每张表的调用频次");
            return;
          }
          const apiAssets = selectedAssets.map(asset => ({ database: asset.database, table: asset.table, fieldNames: [...(selectedFields.get(availableAssets.indexOf(asset)) || [])], rateLimit: selectedRates.get(availableAssets.indexOf(asset)) }));
          if (!apiAssets.some(asset => asset.fieldNames.length)) {
            showToast("至少选择 1 个返回字段");
            return;
          }
          const primaryAsset = selectedAssets[0];
          const payload = {
            name: document.getElementById("newApiName").value.trim(), assetTable: primaryAsset.table, database: primaryAsset.database,
            fieldNames: apiAssets[0].fieldNames, assets: apiAssets, usage: document.getElementById("newApiUsage").value.trim(),
            tokenStatus: editingApi?.tokenStatus || "启用", creator: editingApi?.creator || "黄佩贤",
            createdAt: editingApi?.createdAt || "2026-06-26 14:35", lastCall: editingApi?.lastCall || "-", callCount: editingApi?.callCount || 0,
            callCount30d: editingApi?.callCount30d || 0,
            token: editingApi?.token || `bjgw_live_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`
          };
          if (editingApi) {
            Object.assign(editingApi, payload);
            apiManagePage = 1;
            setSimplePage("数据开放平台");
            renderApiConfigs(document.getElementById("apiSearch").value);
            showToast("API 配置已保存");
            return;
          }
          apiConfigs.unshift(payload);
          apiManagePage = 1;
          renderApiConfigs(document.getElementById("apiSearch").value);
          showGeneratedTokenModal(payload);
        };
      }

      function openAssetDetail(index) {
        const asset = dataAssets[index];
        if (!asset) return;
        const relatedApis = apiConfigs.filter(api => apiMatchesAsset(api, asset));
        const callCount = relatedApis.reduce((sum, api) => sum + (api.callCount30d || 0), 0);
        const tagTable = window.cpTag?.get(asset.table);
        drawerTitle.textContent = `${asset.cnName || asset.table} · 表详情`;
        drawerBody.innerHTML = `
          <div class="drawer-scroll asset-detail">
            <section class="asset-hero">
              <div class="asset-info-grid">
                <div class="asset-info-item"><span>表编号</span><strong>${safeText(asset.assetId || "-")}</strong></div>
                <div class="asset-info-item"><span>对外表名</span><strong>${safeText(asset.externalName || "-")}</strong></div>
                <div class="asset-info-item"><span>数据源</span><strong>${safeText(asset.source || "-")}</strong></div>
                <div class="asset-info-item"><span>库名</span><strong>${safeText(asset.database)}</strong></div>
                <div class="asset-info-item"><span>表名</span><strong class="asset-info-code" title="${safeText(asset.table)}">${safeText(asset.table)}</strong></div>
                <div class="asset-info-item"><span>表负责人</span><strong>${safeText(asset.owner || "-")}</strong></div>
                <div class="asset-info-item"><span>最近同步时间</span><strong>${safeText(asset.lastSuccessSync || "-")}</strong></div>
                <div class="asset-info-item"><span>字段数量</span><strong>${asset.fields.length}</strong></div>
                <div class="asset-info-item"><span>近30日调用次数</span><strong>${callCount.toLocaleString()}</strong></div>
              </div>
            </section>
            <section class="asset-section asset-description-section">
              <div class="asset-section-head">
                <strong>表描述</strong>
              </div>
              <div class="asset-description-body">
                <textarea class="toolbar-input asset-description-input" id="assetDescEdit" rows="4">${safeText(asset.desc)}</textarea>
              </div>
            </section>
            <section class="asset-section">
              <div class="asset-section-head">
                <strong>标签表设置</strong>
                <label class="check-row"><input type="checkbox" id="toggleAssetTagTable" ${tagTable ? "checked" : ""} /><span>设为标签表</span></label>
              </div>
            </section>
            ${tagTable ? `<section class="asset-section">
              <div class="asset-section-head"><strong>人群包导出字段配置</strong></div>
              <div class="asset-export-fields">
                ${asset.fields.map(field => `<label class="check-row"><input type="checkbox" data-cp-export-field value="${safeText(field.name)}" ${tagTable.exportFields?.includes(field.name) ? "checked" : ""} /><span>${safeText(field.name)} / ${safeText(field.comment || field.type)}</span></label>`).join("") || `<span style="color:#8a94a4">该表暂无字段</span>`}
              </div>
            </section>` : ""}
            <section class="asset-section asset-field-section">
              <div class="asset-section-head">
                <strong>字段列表</strong>
              </div>
              <div class="data-table-wrap asset-field-table-wrap">
                <table class="data-table asset-field-table">
                  <thead><tr><th>字段名称</th><th>字段类型</th><th>字段中文名</th><th>字段备注</th></tr></thead>
                  <tbody>
                    ${asset.fields.map((field, fieldIndex) => `
                      <tr>
                        <td><strong>${safeText(field.name)}</strong></td>
                        <td>${safeText(field.type)}</td>
                        <td>${safeText(field.comment)}</td>
                        <td><input class="toolbar-input asset-field-remark-input" data-field-remark="${fieldIndex}" value="${safeText(field.remark || "")}" /></td>
                      </tr>
                    `).join("") || `<tr><td colspan="4" style="text-align:center;color:#8a94a4;height:72px">暂无字段</td></tr>`}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
          <div class="drawer-footer">
            <button class="btn ghost" id="closeAssetDetail">关闭</button>
            <button class="btn primary" id="saveAssetRemark">保存补充备注</button>
          </div>
        `;
        openSimpleDrawer();
        document.getElementById("closeAssetDetail").addEventListener("click", closeSimpleDrawer);
        document.getElementById("toggleAssetTagTable").addEventListener("change", () => {
          window.cpTag?.toggle(index);
          openAssetDetail(index);
        });
        document.getElementById("saveAssetRemark").addEventListener("click", () => {
          asset.desc = document.getElementById("assetDescEdit").value.trim();
          document.querySelectorAll("[data-field-remark]").forEach(input => {
            const field = asset.fields[Number(input.dataset.fieldRemark)];
            if (field) field.remark = input.value.trim();
          });
          if (window.cpTag?.has(asset.table)) {
            window.cpTag.setExportFields(asset.table, [...document.querySelectorAll("[data-cp-export-field]:checked")].map(input => input.value));
          }
          renderDataAssets(document.getElementById("assetSearch").value);
          closeSimpleDrawer();
          showToast("表详情配置已保存");
        });
      }

      function groupCheckboxes(selectedGroups = []) {
        return permissionGroups.map(group => `
          <label class="check-row">
            <input type="checkbox" name="boardVisibleGroup" value="${safeText(group.name)}" ${selectedGroups.includes(group.name) ? "checked" : ""} />
            <span>${safeText(group.name)}</span>
          </label>
        `).join("");
      }

      function openBoardAssetModal(index = -1) {
        const isEdit = index > -1;
        const board = isEdit ? migratedBoards[index] : { name: "", desc: "", category: boardCategories.find(category => category !== "全部") || "", quickBiId: "", owner: "曾祥竞", groups: [], status: "已上线" };
        const portalUserOptions = simpleUsers.map(user => `<option value="${safeText(user.name)}">${safeText(user.dept)} / ${safeText(user.role)}</option>`).join("");
        drawerTitle.textContent = isEdit ? "编辑看板" : "新增看板";
        drawerBody.innerHTML = `
          <div class="drawer-scroll">
            <div class="form-grid">
              <div class="form-field required" data-field-wrap="boardAssetName">
                <label>看板名称</label>
                <input class="toolbar-input" id="boardAssetName" placeholder="请输入看板名称" value="${safeText(board.name)}" />
                <span class="field-error">请输入看板名称</span>
              </div>
              <div class="form-field">
                <label>看板说明</label>
                <textarea class="toolbar-input" id="boardAssetDesc" style="height:88px;padding-top:10px;resize:none" placeholder="可选，展示在看板详情页标题下方">${safeText(board.desc || "")}</textarea>
              </div>
              <div class="form-field required" data-field-wrap="boardAssetCategory">
                <label>看板分组</label>
                <select class="toolbar-select" id="boardAssetCategory" style="width:100%;height:40px">
                  ${boardCategories.filter(category => category !== "全部").map(category => `<option ${category === board.category ? "selected" : ""}>${safeText(category)}</option>`).join("")}
                </select>
                <span class="field-error">请选择看板分组</span>
              </div>
              <div class="form-field required" data-field-wrap="boardAssetQuickBiId">
                <label>Quick BI 看板 ID</label>
                <input class="toolbar-input" id="boardAssetQuickBiId" placeholder="请输入 Quick BI 看板 ID" value="${safeText(board.quickBiId || "")}" />
                <span class="field-error">请输入 Quick BI 看板 ID</span>
              </div>
              <div class="form-field">
                <label>可查看权限组</label>
                <div class="multi-check-grid">${groupCheckboxes(board.groups || [])}</div>
              </div>
              <div class="form-field">
                <label>看板负责人</label>
                <input class="toolbar-input" id="boardAssetOwner" list="portalUserOptions" placeholder="搜索或输入平台用户" value="${safeText(board.owner || "")}" />
                <datalist id="portalUserOptions">${portalUserOptions}</datalist>
              </div>
            </div>
          </div>
          <div class="drawer-footer">
            <button class="btn ghost" id="cancelBoardAsset">取消</button>
            <button class="btn primary" id="saveBoardAsset">确认</button>
          </div>
        `;
        openSimpleDrawer();
        document.getElementById("cancelBoardAsset").addEventListener("click", closeSimpleDrawer);
        ["boardAssetName", "boardAssetCategory", "boardAssetQuickBiId"].forEach(id => {
          document.getElementById(id).addEventListener("input", () => {
            document.querySelector(`[data-field-wrap="${id}"]`)?.classList.remove("invalid");
          });
          document.getElementById(id).addEventListener("change", () => {
            document.querySelector(`[data-field-wrap="${id}"]`)?.classList.remove("invalid");
          });
        });
        document.getElementById("saveBoardAsset").addEventListener("click", () => {
          if (!validateRequiredFields(["boardAssetName", "boardAssetCategory", "boardAssetQuickBiId"])) {
            showToast("请补全必填字段");
            return;
          }
          const name = document.getElementById("boardAssetName").value.trim();
          const desc = document.getElementById("boardAssetDesc").value.trim();
          const category = document.getElementById("boardAssetCategory").value;
          const quickBiId = document.getElementById("boardAssetQuickBiId").value.trim();
          const owner = document.getElementById("boardAssetOwner").value.trim();
          const groups = [...document.querySelectorAll("input[name='boardVisibleGroup']:checked")].map(input => input.value);
          const payload = { name, desc, category, quickBiId, owner, groups, status: board.status || "已上线", updatedAt: "2026-06-16 17:30" };
          if (isEdit) Object.assign(migratedBoards[index], payload);
          else migratedBoards.unshift(payload);
          closeSimpleDrawer();
          renderBoardCategories();
          renderBoardDirectory();
          renderBoardManagement(document.getElementById("boardManageSearch").value);
          renderPermissionGroups();
          showToast(isEdit ? "看板配置已保存" : "看板已新增");
        });
      }

      function openCategoryManager() {
        showFormModal("管理看板分类", `
          <button class="close-btn modal-close" id="closeCategoryManager" type="button">×</button>
          <div class="detail-block">
            <h3>新增分类</h3>
            <div class="category-add-row">
              <input class="toolbar-input" id="newBoardCategory" placeholder="分类名称" />
              <button class="btn primary" id="addBoardCategory">新增</button>
            </div>
          </div>
          <div class="detail-block">
            <h3>已有分类</h3>
            <div class="category-manage-list" id="categoryManageList"></div>
          </div>
        `);

        const renderList = () => {
          const editableCategories = boardCategories.filter(category => category !== "全部");
          document.getElementById("categoryManageList").innerHTML = editableCategories.map((category, index) => {
            const used = migratedBoards.some(board => board.category === category);
            const boardCount = migratedBoards.filter(board => board.category === category).length;
            return `
              <div class="category-manage-row" draggable="true" data-category-row="${safeText(category)}">
                <button class="drag-handle" type="button" title="拖动整行排序">≡</button>
                <span class="category-count">${index + 1}</span>
                <input class="toolbar-input" value="${safeText(category)}" data-category-name="${safeText(category)}" />
                <span class="category-usage">${boardCount} 个看板</span>
                <div class="category-actions">
                  <button class="btn text" data-delete-category="${safeText(category)}" ${used ? "disabled style='opacity:.45;cursor:not-allowed'" : ""}>删除</button>
                </div>
              </div>
            `;
          }).join("");
        };
        renderList();
        document.getElementById("closeCategoryManager").addEventListener("click", closeFormModal);
        let draggingCategory = "";
        document.getElementById("categoryManageList").addEventListener("dragstart", event => {
          if (event.target.matches("input, button:not(.drag-handle)")) {
            event.preventDefault();
            return;
          }
          const row = event.target.closest("[data-category-row]");
          if (!row) return;
          draggingCategory = row.dataset.categoryRow;
          row.classList.add("dragging");
          event.dataTransfer.setData("text/plain", draggingCategory);
          event.dataTransfer.effectAllowed = "move";
        });
        document.getElementById("categoryManageList").addEventListener("dragend", event => {
          event.target.closest("[data-category-row]")?.classList.remove("dragging");
          draggingCategory = "";
        });
        document.getElementById("categoryManageList").addEventListener("dragover", event => {
          if (!draggingCategory) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const targetRow = event.target.closest("[data-category-row]");
          if (!targetRow || !draggingCategory || targetRow.dataset.categoryRow === draggingCategory) return;
          const from = boardCategories.indexOf(draggingCategory);
          const to = boardCategories.indexOf(targetRow.dataset.categoryRow);
          if (from <= 0 || to <= 0) return;
          const [item] = boardCategories.splice(from, 1);
          boardCategories.splice(to, 0, item);
          renderList();
          const movedRow = document.querySelector(`[data-category-row="${CSS.escape(draggingCategory)}"]`);
          movedRow?.classList.add("dragging");
          renderBoardCategories();
          renderBoardDirectory();
          renderBoardManageFilters();
        });
        document.getElementById("categoryManageList").addEventListener("drop", event => {
          event.preventDefault();
          if (draggingCategory) showToast("分类排序已更新");
        });
        document.getElementById("addBoardCategory").addEventListener("click", () => {
          const name = document.getElementById("newBoardCategory").value.trim();
          if (!name) {
            showToast("请输入分类名称");
            return;
          }
          if (boardCategories.includes(name)) {
            showToast("分类已存在");
            return;
          }
          boardCategories.push(name);
          document.getElementById("newBoardCategory").value = "";
          renderList();
          renderBoardCategories();
          renderBoardManageFilters();
          showToast("分类已新增");
        });
        const autoSaveCategoryName = input => {
          const oldName = input.dataset.categoryName;
          const newName = input.value.trim();
          if (newName === oldName) return;
          if (!newName) {
            input.value = oldName;
            showToast("分类名称不能为空");
            return;
          }
          if (boardCategories.includes(newName)) {
            input.value = oldName;
            showToast("分类已存在");
            return;
          }
          const idx = boardCategories.indexOf(oldName);
          if (idx > -1) boardCategories[idx] = newName;
          migratedBoards.forEach(board => {
            if (board.category === oldName) board.category = newName;
          });
          if (activeCategory === oldName) activeCategory = newName;
          if (activeBoardManageCategory === oldName) activeBoardManageCategory = newName;
          renderList();
          renderBoardCategories();
          renderBoardDirectory();
          renderBoardManagement(document.getElementById("boardManageSearch").value);
          showToast("分类名称已保存");
        };
        document.getElementById("categoryManageList").addEventListener("focusout", event => {
          const input = event.target.closest("[data-category-name]");
          if (input) autoSaveCategoryName(input);
        });
        document.getElementById("categoryManageList").addEventListener("keydown", event => {
          const input = event.target.closest("[data-category-name]");
          if (input && event.key === "Enter") {
            event.preventDefault();
            input.blur();
          }
        });
        document.getElementById("categoryManageList").addEventListener("click", event => {
          const del = event.target.closest("[data-delete-category]");
          if (del) {
            const name = del.dataset.deleteCategory;
            const used = migratedBoards.some(board => board.category === name);
            if (used) {
              showToast("该分类下仍有看板，不能删除");
              return;
            }
            const idx = boardCategories.indexOf(name);
            if (idx > -1) boardCategories.splice(idx, 1);
            if (activeBoardManageCategory === name) activeBoardManageCategory = "全部分类";
            if (activeCategory === name) activeCategory = "全部";
            renderList();
            renderBoardCategories();
            renderBoardDirectory();
            renderBoardManageFilters();
            showToast("分类已删除");
          }
        });
      }

      function renderSearchResults(keyword) {
        boardSearchKeyword = keyword;
        document.getElementById("clearBoardSearch").classList.toggle("hidden", !keyword.trim());
        renderBoardDirectory();
      }

      function renderSimpleUsers(keyword = "") {
        const normalized = keyword.trim().toLowerCase();
        const statusValue = document.getElementById("userStatusFilter")?.value || "全部状态";
        const groupOptions = ["全部权限组", "未分配", ...permissionGroups.map(group => group.name)];
        document.getElementById("userGroupList").innerHTML = groupOptions.map(group => {
          const count = group === "全部权限组" ? simpleUsers.length : simpleUsers.filter(user => user.group === group).length;
          return `
            <button class="category-item ${group === activeUserGroup ? "active" : ""}" data-user-group-filter="${safeText(group)}">
              <span>${safeText(group)}</span>
              <span class="category-count">${count}</span>
            </button>
          `;
        }).join("");
        const rows = simpleUsers.filter(user => {
          const accountStatus = user.status === "已停用" ? "已停用" : "启用中";
          const matchKeyword = !normalized || [user.name, user.dept, user.role, user.email, user.group].some(value => value.toLowerCase().includes(normalized));
          const matchGroup = activeUserGroup === "全部权限组" || user.group === activeUserGroup;
          const matchStatus = statusValue === "全部状态" || accountStatus === statusValue;
          return matchKeyword && matchGroup && matchStatus;
        });
        const totalPages = Math.max(1, Math.ceil(rows.length / userManagePageSize));
        userManagePage = Math.min(userManagePage, totalPages);
        const pagedRows = rows.slice((userManagePage - 1) * userManagePageSize, userManagePage * userManagePageSize);

        document.getElementById("userTableBody").innerHTML = pagedRows.map(user => `
          <tr>
            <td>
              <div class="user-cell">
                <div class="user-avatar">${safeText(user.name.slice(0, 1))}</div>
                <div class="user-name"><strong>${safeText(user.name)}</strong></div>
              </div>
            </td>
            <td>${safeText(user.dept)}</td>
            <td>${safeText(user.role)}</td>
            <td>${safeText(user.email)}</td>
            <td><span class="pill ${user.group === "未分配" ? "orange" : "blue"}">${safeText(user.group)}</span></td>
            <td><span class="status-dot ${user.status === "已停用" ? "off" : ""}"></span>${safeText(user.status === "已停用" ? "已停用" : "启用中")}</td>
            <td>${safeText(user.login)}</td>
            <td>
              <div style="display:flex;gap:10px;align-items:center">
                <button class="btn text" data-assign-group="${simpleUsers.indexOf(user)}">设置权限组</button>
              </div>
            </td>
          </tr>
        `).join("") || `<tr><td colspan="8" style="text-align:center;color:#8a94a4;height:88px">暂无匹配用户</td></tr>`;
        renderPagination("userPagination", rows.length, userManagePage, userManagePageSize, "user");
      }

      function getMenuPermissionTree() {
        return [
          { name: "数据看板", children: [] },
          { name: "数据服务", children: ["人群包管理", "数据开放平台"] },
          { name: "数据资产", children: ["看板管理", "表管理", "标签管理", "维表管理", "字典管理"] },
          { name: "数据推送", children: ["人群包推送渠道"] },
          { name: "权限管理", children: ["用户管理", "权限组"] }
        ];
      }

      function getGroupMenus(groupName) {
        return (permissionGroups.find(group => group.name === groupName) || {}).menus || [];
      }

      function renderPermissionGroups() {
        const activeGroup = permissionGroups[activeGroupIndex] || permissionGroups[0];
        const menuTree = getMenuPermissionTree();
        const activeUserCount = simpleUsers.filter(user => user.group === activeGroup.name).length;
        const boardGroups = boardCategories
          .filter(category => category !== "全部")
          .map(category => ({ category, boards: migratedBoards.filter(board => board.category === category && board.status === "已上线") }))
          .filter(group => group.boards.length > 0);
        document.getElementById("permissionGroupList").innerHTML = permissionGroups.map((group, index) => `
          <article class="group-card ${index === activeGroupIndex ? "active" : ""}" data-permission-group="${index}">
            <div class="group-card-head">
              <h3>${safeText(group.name)}</h3>
              <div class="group-card-meta">
                <span>${simpleUsers.filter(user => user.group === group.name).length} 人</span>
                <button class="group-card-more" data-group-menu="${index}" aria-label="${safeText(group.name)} 更多操作">...</button>
              </div>
            </div>
            <p>${safeText(group.desc)}</p>
            <div class="group-card-meta"><span>${group.boards.includes("全部看板") ? "全部看板" : `${group.boards.length} 个看板`}</span></div>
            ${openGroupActionIndex === index ? `<div class="group-card-menu">
              <button data-edit-group="${index}">编辑</button>
              <button class="danger" data-delete-group="${index}">删除</button>
            </div>` : ""}
          </article>
        `).join("");

        document.getElementById("groupDetailTitle").textContent = activeGroup.name;
        document.getElementById("permissionGroupDetail").innerHTML = `
        <div class="group-detail-tabs" role="tablist" aria-label="权限类型">
          <button class="group-detail-tab ${groupDetailTab === "menus" ? "active" : ""}" data-permission-tab="menus" role="tab" aria-selected="${groupDetailTab === "menus"}">菜单权限</button>
          <button class="group-detail-tab ${groupDetailTab === "boards" ? "active" : ""}" data-permission-tab="boards" role="tab" aria-selected="${groupDetailTab === "boards"}">看板查看范围</button>
        </div>
        <section class="permission-tab-panel ${groupDetailTab === "menus" ? "" : "hidden"}" data-permission-panel="menus">
          <div class="permission-board-group">
            <strong>菜单权限</strong>
            <div class="multi-check-grid menu-permission-grid">
            ${menuTree.map(item => {
              const parentChecked = activeGroup.menus.includes(item.name) || item.children.some(child => activeGroup.menus.includes(child));
              return `
                <div class="permission-board-group">
                  <label class="check-row">
                    <input type="checkbox" name="groupMenu" value="${safeText(item.name)}" data-group-config ${parentChecked ? "checked" : ""} />
                    <span>${safeText(item.name)}</span>
                  </label>
                  <div style="display:grid;gap:8px;margin-left:26px">
                    ${item.children.map(child => `
                      <label class="check-row" style="min-height:30px">
                        <input type="checkbox" name="groupMenu" value="${safeText(child)}" data-group-config ${activeGroup.menus.includes(child) ? "checked" : ""} />
                        <span>${safeText(child)}</span>
                      </label>
                    `).join("")}
                  </div>
                </div>
              `;
            }).join("")}
            </div>
          </div>
        </section>
        <section class="permission-tab-panel ${groupDetailTab === "boards" ? "" : "hidden"}" data-permission-panel="boards">
          <div class="permission-board-group">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
              <strong>看板查看范围</strong>
              <label class="check-row">
                <input type="checkbox" name="allBoards" data-all-boards data-group-config ${activeGroup.boards.includes("全部看板") ? "checked" : ""} />
                <span>全部看板</span>
              </label>
            </div>
            <div class="permission-board-grid">
              ${boardGroups.map(group => `
                <div class="permission-board-group">
                  <strong>${safeText(group.category)}</strong>
                  ${group.boards.map(board => `
                    <label class="check-row">
                      <input type="checkbox" name="groupBoard" value="${safeText(board.name)}" data-group-config ${activeGroup.boards.includes("全部看板") || activeGroup.boards.includes(group.category) || activeGroup.boards.includes(board.name) ? "checked" : ""} />
                      <span>${safeText(board.name)}</span>
                    </label>
                  `).join("")}
                </div>
              `).join("")}
            </div>
          </div>
        </section>
        `;
        setGroupDirty(false);
      }

      function setGroupDetailTab(tab) {
        groupDetailTab = tab;
        document.querySelectorAll("[data-permission-tab]").forEach(button => {
          const active = button.dataset.permissionTab === tab;
          button.classList.toggle("active", active);
          button.setAttribute("aria-selected", String(active));
        });
        document.querySelectorAll("[data-permission-panel]").forEach(panel => {
          panel.classList.toggle("hidden", panel.dataset.permissionPanel !== tab);
        });
      }

      function openEditGroupModal(index) {
        const group = permissionGroups[index];
        if (!group) return;
        showFormModal(`编辑权限组 · ${group.name}`, `
          <div class="form-field required" data-field-wrap="editGroupName" style="margin-bottom:12px">
            <label>权限组名称</label>
            <input class="toolbar-input" id="editGroupName" value="${safeText(group.name)}" />
            <span class="field-error">请输入权限组名称</span>
          </div>
          <div class="form-field">
            <label>描述</label>
            <textarea class="toolbar-input" id="editGroupDesc" style="height:96px;padding-top:10px;resize:none">${safeText(group.desc)}</textarea>
          </div>
          <div class="modal-actions">
            <button class="btn ghost" id="cancelEditGroup">取消</button>
            <button class="btn primary" id="confirmEditGroup">保存</button>
          </div>
        `);
        document.getElementById("cancelEditGroup").addEventListener("click", closeFormModal);
        document.getElementById("confirmEditGroup").addEventListener("click", () => {
          if (!validateRequiredFields(["editGroupName"])) {
            showToast("请补全必填字段");
            return;
          }
          const name = document.getElementById("editGroupName").value.trim();
          if (permissionGroups.some((item, itemIndex) => itemIndex !== index && item.name === name)) {
            document.querySelector('[data-field-wrap="editGroupName"]')?.classList.add("invalid");
            showToast("权限组名称已存在");
            return;
          }
          const oldName = group.name;
          group.name = name;
          group.desc = document.getElementById("editGroupDesc").value.trim() || "自定义权限组。";
          simpleUsers.forEach(user => { if (user.group === oldName) user.group = name; });
          openGroupActionIndex = null;
          closeFormModal();
          renderPermissionGroups();
          renderSimpleUsers(document.getElementById("userSearch").value);
          showToast("权限组已保存");
        });
      }

      function deletePermissionGroup(index) {
        const group = permissionGroups[index];
        if (!group) return;
        const userCount = simpleUsers.filter(user => user.group === group.name).length;
        if (userCount > 0) {
          showToast("该权限组下仍有用户，不能删除");
          return;
        }
        showConfirm("删除权限组", `确认删除「${group.name}」？`, () => {
          permissionGroups.splice(index, 1);
          if (index < activeGroupIndex) activeGroupIndex -= 1;
          activeGroupIndex = Math.max(0, Math.min(activeGroupIndex, permissionGroups.length - 1));
          openGroupActionIndex = null;
          renderPermissionGroups();
          renderSimpleUsers(document.getElementById("userSearch").value);
          showToast("权限组已删除");
        });
      }

      function renderPermissionPage() {
        const user = simpleUsers[activeUserIndex] || simpleUsers[0];
        const menuTree = getMenuPermissionTree();
        const allowedMenus = getGroupMenus(user.group);
        document.getElementById("permissionUserCard").innerHTML = `
          <div style="display:flex;align-items:center;gap:12px">
            <div class="user-avatar">${safeText(user.name.slice(0, 1))}</div>
            <div class="user-name"><strong>${safeText(user.name)}</strong><small>${safeText(user.dept)}</small></div>
          </div>
          <div class="detail-row"><span>岗位角色</span><strong>${safeText(user.role)}</strong></div>
          <div class="detail-row"><span>当前权限</span><strong>${safeText(user.group)}</strong></div>
          <div class="detail-row"><span>账号状态</span><strong>${safeText(user.status)}</strong></div>
          <button class="btn ghost" id="backToUsersBtn" style="justify-content:center">返回用户管理</button>
        `;

        document.getElementById("menuPermissionList").innerHTML = menuTree.map(item => `
          <div class="permission-board-group">
            <label class="check-row">
              <input type="checkbox" ${allowedMenus.includes(item.name) ? "checked" : ""} />
              <span>${safeText(item.name)}</span>
            </label>
            <div style="display:grid;gap:8px;margin-left:26px">
              ${item.children.map(child => `
                <label class="check-row" style="min-height:30px">
                  <input type="checkbox" ${allowedMenus.includes(child) ? "checked" : ""} />
                  <span>${safeText(child)}</span>
                </label>
              `).join("")}
            </div>
          </div>
        `).join("");

        const grouped = boardCategories
          .filter(category => category !== "全部")
          .map(category => ({ category, boards: migratedBoards.filter(board => board.category === category && board.status === "已上线") }))
          .filter(group => group.boards.length > 0);
        document.getElementById("boardPermissionList").classList.add("permission-board-grid");
        document.getElementById("boardPermissionList").innerHTML = grouped.map(group => `
          <div class="permission-board-group">
            <strong>${safeText(group.category)}</strong>
            ${group.boards.map((board, index) => `
              <label class="check-row">
                <input type="checkbox" ${user.group !== "未分配" && (index < 3 || user.group === "门户管理员") ? "checked" : ""} />
                <span>${safeText(board.name)}</span>
              </label>
            `).join("")}
          </div>
        `).join("");
      }

      function openQuickBi(index) {
        activeBoard = migratedBoards[index] || migratedBoards[0];
        setSimplePage("Quick BI 展示");
        if (!window.portalVueModuleApi) {
          pageTitle.innerHTML = `<button class="btn ghost" id="backInTitle" style="vertical-align:middle;margin-right:12px">返回</button>${safeText(activeBoard.name)}`;
          pageSubtitle.textContent = activeBoard.desc || "";
          document.getElementById("quickBiTitle").textContent = activeBoard.name;
        }
      }

      function setSimplePage(page) {
        document.getElementById("portalApp").classList.remove("no-permission-mode");
        document.getElementById("sidebar").classList.remove("hidden");
        activePage = page;
        setHeader(page);
        document.getElementById("boardTitleSearch")?.classList.add("hidden");
        renderSimpleNav();
        dashboardView.classList.add("hidden");
        document.getElementById("analysisWorkbenchView")?.classList.toggle("hidden", page !== "灵犀智析");
        document.getElementById("skillManagementView")?.classList.toggle("hidden", page !== "Skill 配置");
        document.getElementById("menuManagementView")?.classList.toggle("hidden", page !== "菜单管理");
        document.getElementById("modelConfigView")?.classList.toggle("hidden", page !== "模型配置");
        dataBoardView.classList.toggle("hidden", page !== "数据看板");
        document.getElementById("boardManagementView").classList.toggle("hidden", page !== "看板管理");
        document.getElementById("dataAssetView").classList.toggle("hidden", page !== "表管理");
        document.getElementById("dimensionView")?.classList.toggle("hidden", page !== "维表管理");
        document.getElementById("dimensionDataView")?.classList.toggle("hidden", page !== "维表数据维护");
        document.getElementById("dictionaryView")?.classList.toggle("hidden", page !== "字典管理");
        document.getElementById("apiConfigView").classList.toggle("hidden", page !== "数据开放平台");
        document.getElementById("apiCreateView").classList.toggle("hidden", page !== "新增API");
        userManagementView.classList.toggle("hidden", page !== "用户管理");
        document.getElementById("permissionGroupView").classList.toggle("hidden", page !== "权限组");
        document.getElementById("permissionConfigView").classList.toggle("hidden", page !== "配置权限");
        document.getElementById("quickBiView").classList.toggle("hidden", page !== "Quick BI 展示");
        document.getElementById("cpListView").classList.toggle("hidden", page !== "人群包管理");
        document.getElementById("cpCreateView").classList.toggle("hidden", page !== "新建人群包");
        document.getElementById("tagCatalogView").classList.toggle("hidden", page !== "标签管理");
        document.getElementById("pushTargetView").classList.toggle("hidden", page !== "人群包推送渠道");
        noPermissionView.classList.add("hidden");
        if (page === "数据看板" && !window.portalVueModuleApi) {
          renderBoardCategories();
          renderBoardDirectory();
        }
        if (page === "看板管理" && !window.portalVueModuleApi) renderBoardManagement(document.getElementById("boardManageSearch").value);
        if (page === "表管理" && !window.portalVueModuleApi) renderDataAssets(document.getElementById("assetSearch").value);
        if (page === "数据开放平台" && !window.portalVueModuleApi) renderApiConfigs(document.getElementById("apiSearch").value);
        if (page === "用户管理" && !window.portalVueModuleApi) renderSimpleUsers(document.getElementById("userSearch").value);
        if (page === "权限组" && !window.portalVueModuleApi) renderPermissionGroups();
        if (page === "配置权限" && !window.portalVueModuleApi) renderPermissionPage();
        if (page === "人群包管理" && window.cpRenderList) window.cpRenderList();
        if (page === "新建人群包" && window.cpRenderCreate) window.cpRenderCreate();
        if (page === "标签管理" && window.cpRenderTagCatalog && !window.portalVueModuleApi) window.cpRenderTagCatalog();
        if (page === "人群包推送渠道" && window.cpRenderTargets && !window.portalVueModuleApi) window.cpRenderTargets();
        window.portalVueModuleApi?.refresh(page);
        window.dispatchEvent(new CustomEvent("portal:page-change", { detail: { page } }));
      }
      window.setSimplePage = setSimplePage;

      function showNoPermissionPage() {
        activePage = "无权限";
        document.getElementById("portalApp").classList.add("no-permission-mode");
        pageTitle.textContent = "暂无访问权限";
        pageSubtitle.textContent = "";
        primaryAction.textContent = "";
        tabsBar.innerHTML = "";
        document.getElementById("sidebar").classList.add("hidden");
        dashboardView.classList.add("hidden");
        document.getElementById("analysisWorkbenchView")?.classList.add("hidden");
        document.getElementById("skillManagementView")?.classList.add("hidden");
        document.getElementById("menuManagementView")?.classList.add("hidden");
        document.getElementById("modelConfigView")?.classList.add("hidden");
        dataBoardView.classList.add("hidden");
        document.getElementById("boardManagementView").classList.add("hidden");
        document.getElementById("dataAssetView").classList.add("hidden");
        document.getElementById("dimensionView")?.classList.add("hidden");
        document.getElementById("dimensionDataView")?.classList.add("hidden");
        document.getElementById("dictionaryView")?.classList.add("hidden");
        document.getElementById("apiConfigView").classList.add("hidden");
        document.getElementById("apiCreateView").classList.add("hidden");
        userManagementView.classList.add("hidden");
        document.getElementById("permissionGroupView").classList.add("hidden");
        document.getElementById("permissionConfigView").classList.add("hidden");
        document.getElementById("quickBiView").classList.add("hidden");
        document.getElementById("cpListView").classList.add("hidden");
        document.getElementById("cpCreateView").classList.add("hidden");
        document.getElementById("tagCatalogView").classList.add("hidden");
        document.getElementById("pushTargetView").classList.add("hidden");
        noPermissionView.classList.remove("hidden");
      }

      nav.addEventListener("click", event => {
        const pageButton = event.target.closest("[data-simple-page]");
        const groupButton = event.target.closest("[data-simple-group]");
        if (pageButton) {
          setSimplePage(pageButton.dataset.simplePage);
          return;
        }
        if (groupButton && !document.getElementById("sidebar").classList.contains("collapsed")) {
          groupButton.closest(".nav-group")?.classList.toggle("folded");
        }
      });

      tabsBar.addEventListener("click", event => {
        const closeTab = event.target.closest("[data-close-simple-tab]");
        if (closeTab) {
          event.stopPropagation();
          const name = closeTab.dataset.closeSimpleTab;
          const index = simpleTabs.findIndex(tab => tab.name === name);
          const wasActive = simpleTabs[index]?.page === activePage && simpleTabs[index]?.name === (activePage === "Quick BI 展示" ? activeBoard.name : pageTitle.textContent);
          if (index > -1) simpleTabs.splice(index, 1);
          if (wasActive) {
            const nextTab = simpleTabs[Math.max(0, index - 1)] || simpleTabs[0];
            if (nextTab.boardIndex !== undefined) openQuickBi(nextTab.boardIndex);
            else setSimplePage(nextTab.page);
          } else {
            setHeader(activePage);
          }
          return;
        }
        const tab = event.target.closest("[data-simple-tab]");
        if (tab) {
          const target = simpleTabs.find(item => item.name === tab.dataset.simpleTab);
          if (target?.boardIndex !== undefined) openQuickBi(target.boardIndex);
          else if (target) setSimplePage(target.page);
        }
      });

      document.body.addEventListener("click", event => {
        if (event.target.closest("#backInTitle")) {
          setSimplePage("数据看板");
          return;
        }
        if (event.target.closest("[data-api-back]")) {
          setSimplePage("数据开放平台");
          return;
        }
        if (event.target.closest("[data-cp-back]")) {
          if (window.cpCancelEdit) window.cpCancelEdit();
          setSimplePage("人群包管理");
          return;
        }
        const categoryButton = event.target.closest("[data-category-filter]");
        const userGroupButton = event.target.closest("[data-user-group-filter]");
        const boardButton = event.target.closest("[data-open-board]");
        const permissionButton = event.target.closest("[data-config-permission]");
        const assignGroupButton = event.target.closest("[data-assign-group]");
        const groupCard = event.target.closest("[data-permission-group]");
        const groupMenuButton = event.target.closest("[data-group-menu]");
        const editGroupButton = event.target.closest("[data-edit-group]");
        const deleteGroupButton = event.target.closest("[data-delete-group]");
        const permissionTab = event.target.closest("[data-permission-tab]");
        const groupConfig = event.target.closest("[data-group-config]");
        const editBoardButton = event.target.closest("[data-edit-board]");
        const toggleBoardButton = event.target.closest("[data-toggle-board]");
        const assetDetailButton = event.target.closest("[data-asset-detail]");
        const toggleAssetServiceButton = event.target.closest("[data-toggle-asset-service]");
        const editApiButton = event.target.closest("[data-edit-api]");
        const copyTokenButton = event.target.closest("[data-copy-token]");
        const toggleApiButton = event.target.closest("[data-toggle-api]");

        if (categoryButton) {
          activeCategory = categoryButton.dataset.categoryFilter;
          renderBoardCategories();
          renderBoardDirectory();
        }

        if (userGroupButton) {
          activeUserGroup = userGroupButton.dataset.userGroupFilter;
          userManagePage = 1;
          renderSimpleUsers(document.getElementById("userSearch").value);
        }

        if (boardButton) {
          event.stopPropagation();
          openQuickBi(Number(boardButton.dataset.openBoard));
        }

        if (editBoardButton) {
          event.stopPropagation();
          openBoardAssetModal(Number(editBoardButton.dataset.editBoard));
        }

        if (toggleBoardButton) {
          event.stopPropagation();
          const board = migratedBoards[Number(toggleBoardButton.dataset.toggleBoard)];
          const nextStatus = board.status === "已上线" ? "已下线" : "已上线";
          showConfirm(`${nextStatus === "已上线" ? "上线" : "下线"}看板`, `确认${nextStatus === "已上线" ? "上线" : "下线"}「${board.name}」？`, () => {
            board.status = nextStatus;
            board.updatedAt = "2026-06-16 17:30";
            renderBoardCategories();
            renderBoardDirectory();
            renderBoardManagement(document.getElementById("boardManageSearch").value);
            renderPermissionGroups();
            showToast(`看板已${nextStatus === "已上线" ? "上线" : "下线"}`);
          });
        }

        if (assetDetailButton) {
          event.stopPropagation();
          openAssetDetail(Number(assetDetailButton.dataset.assetDetail));
        }

        if (toggleAssetServiceButton) {
          event.stopPropagation();
          const asset = dataAssets[Number(toggleAssetServiceButton.dataset.toggleAssetService)];
          const nextStatus = (asset.serviceStatus || "启用") === "启用" ? "停用" : "启用";
          if (nextStatus === "启用" && asset.status !== "同步成功") {
            showToast("同步成功后才能启用该表");
            return;
          }
          const relatedEnabledApis = apiConfigs.filter(api => api.tokenStatus === "启用" && apiMatchesAsset(api, asset)).length;
          showConfirm(
            `${nextStatus}数据表`,
            `确认${nextStatus}「${asset.table}」？${nextStatus === "停用" && relatedEnabledApis ? `当前有 ${relatedEnabledApis} 个启用中的 API 关联该表，停用后相关调用将不可用。` : ""}`,
            () => {
              asset.serviceStatus = nextStatus;
              renderDataAssets(document.getElementById("assetSearch").value);
              showToast(`${asset.table} 已${nextStatus}`);
            }
          );
        }

        if (editApiButton) {
          event.stopPropagation();
          openApiConfigPage(Number(editApiButton.dataset.editApi));
        }

        if (copyTokenButton) {
          event.stopPropagation();
          const api = apiConfigs[Number(copyTokenButton.dataset.copyToken)];
          copyTokenValue(api.token);
        }

        if (toggleApiButton) {
          event.stopPropagation();
          const api = apiConfigs[Number(toggleApiButton.dataset.toggleApi)];
          const nextStatus = api.tokenStatus === "启用" ? "停用" : "启用";
          showConfirm(
            `${nextStatus} API`,
            `确认要${nextStatus}「${api.name}」吗？${nextStatus === "停用" ? "停用后该 token 将无法继续调用网关。" : "启用后该 token 将恢复网关调用权限。"}`,
            () => {
              api.tokenStatus = nextStatus;
              renderApiConfigs(document.getElementById("apiSearch").value);
              showToast(`${api.name} 已${api.tokenStatus}`);
            }
          );
        }

        if (permissionButton) {
          event.stopPropagation();
          closeSimpleDrawer();
          activeUserIndex = Number(permissionButton.dataset.configPermission);
          setSimplePage("配置权限");
        }

        if (assignGroupButton) {
          event.stopPropagation();
          const user = simpleUsers[Number(assignGroupButton.dataset.assignGroup)];
          showFormModal(`${user.name} · 设置权限组`, `
            <div class="detail-block">
              <h3>当前信息</h3>
              <div class="detail-row"><span>当前权限组</span><strong>${safeText(user.group)}</strong></div>
              <div class="detail-row"><span>部门组织</span><strong>${safeText(user.dept)}</strong></div>
              <div class="detail-row"><span>岗位角色</span><strong>${safeText(user.role)}</strong></div>
            </div>
            <div class="detail-block">
              <h3>选择权限组</h3>
              <select class="toolbar-select" id="assignGroupSelect" style="width:100%;height:40px">
                ${permissionGroups.map(group => `<option ${group.name === user.group ? "selected" : ""}>${safeText(group.name)}</option>`).join("")}
              </select>
            </div>
            <div class="modal-actions">
              <button class="btn ghost" id="cancelAssignedGroup">取消</button>
              <button class="btn primary" id="saveAssignedGroup">保存权限组</button>
            </div>
          `);
          document.getElementById("cancelAssignedGroup").addEventListener("click", closeFormModal);
          document.getElementById("saveAssignedGroup").addEventListener("click", () => {
            user.group = document.getElementById("assignGroupSelect").value;
            renderSimpleUsers(document.getElementById("userSearch").value);
            closeFormModal();
            showToast(`${user.name} 已分配到「${user.group}」`);
          });
        }

        if (permissionTab) {
          event.stopPropagation();
          setGroupDetailTab(permissionTab.dataset.permissionTab);
          return;
        }

        if (groupMenuButton) {
          event.stopPropagation();
          const index = Number(groupMenuButton.dataset.groupMenu);
          openGroupActionIndex = openGroupActionIndex === index ? null : index;
          renderPermissionGroups();
          return;
        }

        if (editGroupButton) {
          event.stopPropagation();
          openEditGroupModal(Number(editGroupButton.dataset.editGroup));
          return;
        }

        if (deleteGroupButton) {
          event.stopPropagation();
          deletePermissionGroup(Number(deleteGroupButton.dataset.deleteGroup));
          return;
        }

        if (groupCard) {
          event.stopPropagation();
          activeGroupIndex = Number(groupCard.dataset.permissionGroup);
          groupDetailTab = "menus";
          openGroupActionIndex = null;
          renderPermissionGroups();
        }

        if (groupConfig) {
          const allBoards = event.target.closest("[data-all-boards]");
          if (allBoards) {
            document.querySelectorAll("input[name='groupBoard']").forEach(input => {
              input.checked = allBoards.checked;
            });
          } else if (event.target.name === "groupBoard" && !event.target.checked) {
            const allBoardsInput = document.querySelector("input[data-all-boards]");
            if (allBoardsInput) allBoardsInput.checked = false;
          }
          setGroupDirty(true);
        }

      });

      document.getElementById("feishuLoginBtn").addEventListener("click", () => {
        document.getElementById("loginView").classList.add("hidden");
        document.getElementById("portalApp").classList.remove("hidden");
        document.getElementById("sidebar").classList.remove("hidden");
        setSimplePage("灵犀智析");
      });
      const sidebar = document.getElementById("sidebar");
      const collapseBtn = document.getElementById("collapseBtn");
      const userMenuTrigger = document.getElementById("userMenuTrigger");
      const userMenu = document.getElementById("userMenu");
      collapseBtn.addEventListener("click", () => {
        const collapsed = sidebar.classList.toggle("collapsed");
        collapseBtn.textContent = collapsed ? "›" : "‹";
        collapseBtn.title = collapsed ? "展开侧边栏" : "收起侧边栏";
      });
      userMenuTrigger.addEventListener("click", event => {
        event.stopPropagation();
        userMenu.classList.toggle("open");
      });
      document.getElementById("logoutBtn").addEventListener("click", () => {
        userMenu.classList.remove("open");
        closeSimpleDrawer();
        closeFormModal();
        document.getElementById("portalApp").classList.add("hidden");
        document.getElementById("loginView").classList.remove("hidden");
        showToast("已退出系统");
      });
      document.addEventListener("click", event => {
        if (!event.target.closest(".user-menu-wrap")) userMenu.classList.remove("open");
      });
      document.getElementById("noPermissionLoginBtn").addEventListener("click", () => {
        document.getElementById("loginView").classList.add("hidden");
        document.getElementById("portalApp").classList.remove("hidden");
        showNoPermissionPage();
      });
      document.getElementById("backToLoginFromNoPermission").addEventListener("click", () => {
        document.getElementById("portalApp").classList.remove("no-permission-mode");
        document.getElementById("portalApp").classList.add("hidden");
        document.getElementById("loginView").classList.remove("hidden");
        showToast("已退出系统");
      });
      document.getElementById("savePermissionBtn").addEventListener("click", () => showToast("权限配置已保存"));
      document.getElementById("saveGroupBtn").addEventListener("click", () => {
        if (!groupDirty) return;
        const group = permissionGroups[activeGroupIndex];
        group.menus = [...document.querySelectorAll("input[name='groupMenu']:checked")].map(input => input.value);
        const allBoardsChecked = document.querySelector("input[data-all-boards]")?.checked;
        group.boards = allBoardsChecked
          ? ["全部看板"]
          : [...document.querySelectorAll("input[name='groupBoard']:checked")].map(input => input.value);
        setGroupDirty(false);
        renderPermissionGroups();
        showToast("权限组配置已保存");
      });
      document.getElementById("createGroupBtn").addEventListener("click", () => {
        showFormModal("新增权限组", `
          <div class="detail-block">
            <h3>权限组信息</h3>
            <div class="form-field required" data-field-wrap="newGroupName" style="margin-bottom:12px">
              <label>权限组名称</label>
              <input class="toolbar-input" id="newGroupName" placeholder="请输入权限组名称" />
              <span class="field-error">请输入权限组名称</span>
            </div>
            <div class="form-field">
              <label>描述</label>
              <textarea class="toolbar-input" id="newGroupDesc" style="height:96px;padding-top:10px;resize:none" placeholder="描述"></textarea>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn ghost" id="cancelCreateGroup">取消</button>
            <button class="btn primary" id="confirmCreateGroup">确定</button>
          </div>
        `);
        document.getElementById("cancelCreateGroup").addEventListener("click", closeFormModal);
        document.getElementById("newGroupName").addEventListener("input", () => {
          document.querySelector('[data-field-wrap="newGroupName"]')?.classList.remove("invalid");
        });
        document.getElementById("confirmCreateGroup").addEventListener("click", () => {
          if (!validateRequiredFields(["newGroupName"])) {
            showToast("请补全必填字段");
            return;
          }
          const name = document.getElementById("newGroupName").value.trim();
          const desc = document.getElementById("newGroupDesc").value.trim();
          permissionGroups.push({ name, desc: desc || "自定义权限组。", menus: ["数据看板"], boards: [], status: "启用" });
          activeGroupIndex = permissionGroups.length - 1;
          closeFormModal();
          renderPermissionGroups();
          renderSimpleUsers(document.getElementById("userSearch").value);
          showToast("权限组已新增");
        });
      });
      document.getElementById("cancelPermissionBtn").addEventListener("click", () => setSimplePage("用户管理"));
      document.getElementById("permissionBackBtn").addEventListener("click", () => setSimplePage("用户管理"));
      document.getElementById("permissionConfigView").addEventListener("click", event => {
        if (event.target.closest("#backToUsersBtn")) setSimplePage("用户管理");
      });
      document.getElementById("userSearch").addEventListener("input", event => {
        userManagePage = 1;
        renderSimpleUsers(event.target.value);
      });
      document.getElementById("userStatusFilter").addEventListener("change", () => {
        userManagePage = 1;
        renderSimpleUsers(document.getElementById("userSearch").value);
      });
      document.getElementById("boardManageSearch").addEventListener("input", event => {
        boardManagePage = 1;
        renderBoardManagement(event.target.value);
      });
      document.getElementById("boardManageCategory").addEventListener("change", event => {
        activeBoardManageCategory = event.target.value;
        boardManagePage = 1;
        renderBoardManagement(document.getElementById("boardManageSearch").value);
      });
      document.getElementById("boardManageOwner").addEventListener("change", event => {
        activeBoardManageOwner = event.target.value;
        boardManagePage = 1;
        renderBoardManagement(document.getElementById("boardManageSearch").value);
      });
      document.getElementById("boardStatusTabs").addEventListener("click", event => {
        const button = event.target.closest("[data-board-status-filter]");
        if (!button) return;
        activeBoardManageStatus = button.dataset.boardStatusFilter;
        boardManagePage = 1;
        renderBoardManagement(document.getElementById("boardManageSearch").value);
      });
      document.getElementById("assetSearch").addEventListener("input", event => {
        assetManagePage = 1;
        renderDataAssets(event.target.value);
      });
      ["assetSourceFilter", "assetDatabaseFilter"].forEach(id => document.getElementById(id).addEventListener("change", () => {
        assetManagePage = 1;
        renderDataAssets(document.getElementById("assetSearch").value);
      }));
      document.getElementById("apiSearch").addEventListener("input", event => {
        apiManagePage = 1;
        renderApiConfigs(event.target.value);
      });
      document.getElementById("assetStatusTabs").addEventListener("click", event => {
        const button = event.target.closest("[data-asset-service-filter]");
        if (!button) return;
        activeAssetServiceStatus = button.dataset.assetServiceFilter;
        assetManagePage = 1;
        renderDataAssets(document.getElementById("assetSearch").value);
      });
      document.getElementById("apiStatusTabs").addEventListener("click", event => {
        const button = event.target.closest("[data-api-status-filter]");
        if (!button) return;
        activeApiStatus = button.dataset.apiStatusFilter;
        apiManagePage = 1;
        renderApiConfigs(document.getElementById("apiSearch").value);
      });
      document.body.addEventListener("mouseover", event => {
        const anchor = event.target.closest("[data-api-asset-tooltip], [data-asset-cell-tooltip]");
        if (anchor) showApiAssetTooltip(anchor);
      });
      document.body.addEventListener("mouseout", event => {
        const anchor = event.target.closest("[data-api-asset-tooltip], [data-asset-cell-tooltip]");
        if (anchor && !anchor.contains(event.relatedTarget)) hideApiAssetTooltip();
      });
      document.body.addEventListener("click", event => {
        const prev = event.target.closest("[data-page-prev]");
        const next = event.target.closest("[data-page-next]");
        if (prev?.dataset.pagePrev === "board" && boardManagePage > 1) {
          boardManagePage -= 1;
          renderBoardManagement(document.getElementById("boardManageSearch").value);
        }
        if (next?.dataset.pageNext === "board") {
          boardManagePage += 1;
          renderBoardManagement(document.getElementById("boardManageSearch").value);
        }
        if (prev?.dataset.pagePrev === "user" && userManagePage > 1) {
          userManagePage -= 1;
          renderSimpleUsers(document.getElementById("userSearch").value);
        }
        if (next?.dataset.pageNext === "user") {
          userManagePage += 1;
          renderSimpleUsers(document.getElementById("userSearch").value);
        }
        if (prev?.dataset.pagePrev === "asset" && assetManagePage > 1) {
          assetManagePage -= 1;
          renderDataAssets(document.getElementById("assetSearch").value);
        }
        if (next?.dataset.pageNext === "asset") {
          assetManagePage += 1;
          renderDataAssets(document.getElementById("assetSearch").value);
        }
        if (prev?.dataset.pagePrev === "api" && apiManagePage > 1) {
          apiManagePage -= 1;
          renderApiConfigs(document.getElementById("apiSearch").value);
        }
        if (next?.dataset.pageNext === "api") {
          apiManagePage += 1;
          renderApiConfigs(document.getElementById("apiSearch").value);
        }
      });
      document.body.addEventListener("change", event => {
        const sizeSelect = event.target.closest("[data-page-size]");
        if (!sizeSelect) return;
        if (sizeSelect.dataset.pageSize === "board") {
          boardManagePageSize = Number(sizeSelect.value);
          boardManagePage = 1;
          renderBoardManagement(document.getElementById("boardManageSearch").value);
        }
        if (sizeSelect.dataset.pageSize === "user") {
          userManagePageSize = Number(sizeSelect.value);
          userManagePage = 1;
          renderSimpleUsers(document.getElementById("userSearch").value);
        }
        if (sizeSelect.dataset.pageSize === "asset") {
          assetManagePageSize = Number(sizeSelect.value);
          assetManagePage = 1;
          renderDataAssets(document.getElementById("assetSearch").value);
        }
        if (sizeSelect.dataset.pageSize === "api") {
          apiManagePageSize = Number(sizeSelect.value);
          apiManagePage = 1;
          renderApiConfigs(document.getElementById("apiSearch").value);
        }
      });
      document.getElementById("createBoardAssetBtn").addEventListener("click", () => openBoardAssetModal());
      document.getElementById("syncTableBtn").addEventListener("click", openSyncTableModal);
      document.getElementById("createApiBtn").addEventListener("click", () => openApiConfigPage());
      document.getElementById("manageCategoryBtn").addEventListener("click", openCategoryManager);
      document.getElementById("drawerClose").addEventListener("click", closeSimpleDrawer);
      drawerMask.addEventListener("click", closeSimpleDrawer);
      drawerMask.addEventListener("wheel", event => event.preventDefault(), { passive: false });
      drawer.addEventListener("wheel", event => event.stopPropagation(), { passive: true });
      confirmOk.addEventListener("click", () => {
        if (pendingConfirm) pendingConfirm();
        closeConfirm();
      });
      confirmCancel.addEventListener("click", closeConfirm);
      confirmModal.addEventListener("click", event => {
        if (event.target === confirmModal) closeConfirm();
      });
      formModal.addEventListener("click", event => {
        if (event.target === formModal) closeFormModal();
      });
      document.getElementById("globalSearch").addEventListener("input", event => renderSearchResults(event.target.value));
      document.getElementById("clearBoardSearch").addEventListener("click", () => {
        document.getElementById("globalSearch").value = "";
        renderSearchResults("");
      });
      primaryAction.addEventListener("click", () => {
        if (activePage === "配置权限") showToast("权限配置已保存");
        else if (activePage === "权限组") document.getElementById("createGroupBtn").click();
        else if (activePage === "看板管理") openBoardAssetModal();
        else if (activePage === "表管理") openSyncTableModal();
        else if (activePage === "数据开放平台") openApiConfigPage();
        else if (activePage === "用户管理") showToast("已发起飞书用户同步");
        else if (activePage === "人群包管理") { if (window.cpCancelEdit) window.cpCancelEdit(); setSimplePage("新建人群包"); }
        else if (activePage === "人群包推送渠道") { if (window.cpOpenTargetModal) window.cpOpenTargetModal(); }
        else setSimplePage("看板管理");
      });

      window.portalVueBridge = {
        nav: simpleNav,
        pageMeta,
        tabs: simpleTabs,
        boards: migratedBoards,
        boardCategories,
        favorites: favoriteBoardIds,
        assets: dataAssets,
        dictionaries: dataDictionaries,
        apis: apiConfigs,
        users: simpleUsers,
        groups: permissionGroups,
        menuTree: getMenuPermissionTree,
        pageIcon,
        navIconPath,
        setPage: setSimplePage,
        getPage: () => activePage,
        openQuickBi,
        getActiveBoard: () => activeBoard,
        getActiveUserIndex: () => activeUserIndex,
        setActiveUserIndex: value => { activeUserIndex = value; },
        showNoPermissionPage,
        toast: showToast,
        copyToken: copyTokenValue,
        notifyDataChange: () => window.dispatchEvent(new CustomEvent("portal:data-change")),
        getDimensionAssetId: () => window.portalDimensionAssetId || "",
        setDimensionAssetId: value => { window.portalDimensionAssetId = value; }
      };

      renderSimpleUsers();
      renderBoardManagement();
      renderDataAssets();
      renderApiConfigs();
      setSimplePage("灵犀智析");
    })();
  
