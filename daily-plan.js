// Only confirmed dates/times present in the original itinerary are listed here.
const dailyPlan = {
 '2026-09-06':[{time:'09:30',end:'11:40',title:'MU5334 深圳 → 上海虹桥',zone:'Asia/Shanghai',offset:'+08:00'},{time:'15:00',title:'上海苏宁宝丽嘉酒店入住',address:'上海市虹口区北苏州路188号',zone:'Asia/Shanghai',offset:'+08:00'},{time:'16:15',title:'计划抵达上海宝格丽酒店',note:'婚礼于17:18开始',zone:'Asia/Shanghai',offset:'+08:00'},{time:'17:18',title:'陈先生与程小姐婚礼',zone:'Asia/Shanghai',offset:'+08:00'},{time:'21:00',end:'22:00',title:'婚礼晚间派对',zone:'Asia/Shanghai',offset:'+08:00'}],
 '2026-09-07':[{period:'下午',title:'友邦人寿上海总部会面',note:'陈旻浩接待；晚间由陈总接待'}],
 '2026-09-08':[{title:'参访备腾教育集团',note:'潘总接待'}],
 '2026-09-09':[{title:'参访备腾教育集团',note:'潘总接待'}],
 '2026-09-10':[{title:'抓马文娱会面',note:'杭州人员赴沪，在索菲特酒店见面'}],
 '2026-09-11':[{time:'10:25',end:'11:00',title:'G676 上海虹桥 → 无锡东',note:'一等座；周致中自高铁站起接待',zone:'Asia/Shanghai',offset:'+08:00'},{title:'参访雅迪集团',note:'当晚宿无锡'}],
 '2026-09-12':[{period:'中午',title:'无锡 → 南京建邺区',note:'周总驾车陪同；项目考察及探望家人'}],
 '2026-09-16':[{title:'参访亦庄机器人大世界'}],
 '2026-09-17':[{title:'参访中关村发展集团'}],
 '2026-09-18':[{title:'参访小米汽车工厂'}],
 '2026-09-22':[{title:'参访腾讯公司',address:'深圳市南山区海天二路33号腾讯滨海大厦'}],
 '2026-10-12':[{title:'参访华盖南方投资集团',note:'赵妍昱接待',address:'深圳平安金融中心'}],
 '2026-10-24':[{time:'18:30',title:'洛吉耶／ロオジエ晚餐',zone:'Asia/Tokyo',offset:'+09:00'}],
 '2026-10-27':[{time:'18:00',title:'菊乃井本店晚餐',zone:'Asia/Tokyo',offset:'+09:00'}],
 '2026-11-03':[{title:'广州会面三一重工唐总'},{time:'19:25',title:'CZ311 广州白云出发',note:'前往多伦多',zone:'Asia/Shanghai',offset:'+08:00'},{time:'21:15',title:'CZ311 抵达多伦多',note:'多伦多当地时间',zone:'America/Toronto',offset:'-05:00'}]
};
const stageHotels = {'2026-09-06':'上海苏宁宝丽嘉酒店','2026-09-07':'上海北外滩金辉索菲特酒店','2026-09-12':'南京丽思卡尔顿酒店','2026-09-13':'上海北外滩金辉索菲特酒店','2026-10-17':'港岛（酒店待确认）','2026-10-23':'阿曼东京／アマン東京','2026-10-25':'箱根吟游／箱根吟遊','2026-10-27':'京都柏悦／パーク ハイアット 京都'};
