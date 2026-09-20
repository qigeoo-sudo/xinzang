/**
 * RIASEC 职业映射表 — 由 D:\Code_job_mapping_repaired_20260920.csv 转换
 * 用于测评结果解释时，根据用户兴趣代码推荐匹配职业
 *
 * 字段说明：
 * - job_cn: 职业名称
 * - code: 该职业对应的 RIASEC 三字母代码（首位为主兴趣类型）
 * - industry: 所属行业
 * - entryPath: 入门路径提示
 *
 * 更新：CSV 变更后需重新生成此文件
 */

export interface JobMapping {
  jobCn: string;
  code: string;
  industry: string;
  entryPath: string;
}

export const JOB_MAPPINGS: JobMapping[] = [
  { jobCn: '机械工程师', code: 'RIC', industry: '制造', entryPath: '机械设计/工艺实习' },
  { jobCn: '电气工程师', code: 'RIC', industry: '制造/电力', entryPath: '供配电/PLC项目' },
  { jobCn: '数控技师', code: 'RCI', industry: '制造', entryPath: '数控机床操作' },
  { jobCn: '模具工程师', code: 'RIC', industry: '制造', entryPath: 'CAD/CAM' },
  { jobCn: '汽车维修技师', code: 'RCI', industry: '汽车', entryPath: '4S店/新能源三电' },
  { jobCn: '电工', code: 'RCI', industry: '建筑/制造', entryPath: '特种作业证' },
  { jobCn: '焊工', code: 'RCI', industry: '制造/船舶', entryPath: '焊接工艺证' },
  { jobCn: '建筑施工员', code: 'RCE', industry: '建筑', entryPath: '建造师方向' },
  { jobCn: '测绘工程师', code: 'RCI', industry: '建筑/国土', entryPath: 'GPS/无人机测绘' },
  { jobCn: '农机技术员', code: 'RCI', industry: '农业/制造', entryPath: '农机维修' },
  { jobCn: '飞机维修工程师', code: 'RIC', industry: '航空', entryPath: 'CAAC维修执照' },
  { jobCn: '电梯维保技师', code: 'RCI', industry: '建筑/物业', entryPath: '特种设备证' },
  { jobCn: '工业机器人调试员', code: 'RIC', industry: '制造/机器人', entryPath: 'ROS/PLC' },
  { jobCn: '无人机飞手/运维', code: 'RIC', industry: '低空经济', entryPath: '民航无人机证' },
  { jobCn: '半导体设备技师', code: 'RIC', industry: '芯片', entryPath: '洁净间工艺' },
  { jobCn: '光伏安装运维', code: 'RCI', industry: '新能源', entryPath: '电气基础' },
  { jobCn: '储能系统技术员', code: 'RIC', industry: '新能源/电力', entryPath: 'BMS/EMS' },
  { jobCn: '厨师', code: 'RSC', industry: '餐饮', entryPath: '后厨学徒' },
  { jobCn: '消防技术员/安全员', code: 'RCS', industry: '建筑/应急', entryPath: '消防设施操作员证' },
  { jobCn: '航海/船舶轮机员', code: 'RCI', industry: '航运', entryPath: '船员证' },
  { jobCn: '软件工程师', code: 'ICR', industry: '互联网', entryPath: '后端/前后端项目' },
  { jobCn: '算法工程师', code: 'ICR', industry: 'AI/互联网', entryPath: '机器学习/论文' },
  { jobCn: '数据分析师', code: 'ICR', industry: '互联网/全行业', entryPath: 'SQL/Python/BI' },
  { jobCn: '数据科学家', code: 'ICR', industry: 'AI/金融', entryPath: '统计/ML' },
  { jobCn: '科研研究员', code: 'ICS', industry: '高校/院所', entryPath: '课题/论文' },
  { jobCn: '生物医药研发', code: 'ICR', industry: '医药', entryPath: '分子/细胞/临床' },
  { jobCn: '化学分析师', code: 'ICR', industry: '化工/检测', entryPath: '色谱/质谱' },
  { jobCn: '环境工程师', code: 'ICR', industry: '环保', entryPath: '环评/治理' },
  { jobCn: '气象/地球科学员', code: 'ICR', industry: '科研/政府', entryPath: '数值模式' },
  { jobCn: '统计师', code: 'ICR', industry: '金融/政府', entryPath: '抽样/计量' },
  { jobCn: '心理咨询师', code: 'SIR', industry: '心理健康', entryPath: '咨询师考证+督导' },
  { jobCn: '用户研究员', code: 'SIR', industry: '互联网', entryPath: '定性定量用研' },
  { jobCn: '法医/司法鉴定', code: 'ICR', industry: '司法/公安', entryPath: '医学/法学双背景' },
  { jobCn: '药剂师', code: 'ICS', industry: '医疗/药店', entryPath: '执业药师' },
  { jobCn: '医学影像技师', code: 'ICR', industry: '医疗', entryPath: '放射/CT/MRI' },
  { jobCn: '实验室技术员', code: 'ICR', industry: '检测/医药', entryPath: '标准操作SOP' },
  { jobCn: '农业科学家/育种', code: 'IRC', industry: '农业', entryPath: '基因/田间' },
  { jobCn: '天文/物理研究员', code: 'ICR', industry: '高校/院所', entryPath: '理论/观测' },
  { jobCn: '量化研究/金融工程', code: 'ICE', industry: '金融/AI', entryPath: '统计+交易' },
  { jobCn: '专利审查/技术情报', code: 'ICR', industry: '知识产权', entryPath: '理工+法律' },
  { jobCn: 'UI设计师', code: 'ACI', industry: '互联网', entryPath: 'Figma/作品集' },
  { jobCn: '平面设计师', code: 'ACS', industry: '广告/全行业', entryPath: 'PS/AI/品牌' },
  { jobCn: '工业设计师', code: 'ARI', industry: '制造/消费电子', entryPath: 'CMF/建模' },
  { jobCn: '室内设计师', code: 'ARE', industry: '建筑/家装', entryPath: 'CAD/3D' },
  { jobCn: '插画师', code: 'ACI', industry: '文创/互联网', entryPath: '数位板/个人风格' },
  { jobCn: '原画/游戏美术', code: 'ARI', industry: '游戏', entryPath: '角色/场景' },
  { jobCn: '文案/品牌策划', code: 'AES', industry: '广告/新媒体', entryPath: '选题/品牌' },
  { jobCn: '编剧/影视策划', code: 'AES', industry: '影视/短视频', entryPath: '剧本/分镜' },
  { jobCn: '摄影师', code: 'ARE', industry: '婚庆/媒体', entryPath: '布光/后期' },
  { jobCn: '视频剪辑/后期', code: 'AER', industry: '短视频/影视', entryPath: 'Pr/达芬奇' },
  { jobCn: '音乐制作/音效', code: 'AEI', industry: '娱乐/游戏', entryPath: 'DAW/作曲' },
  { jobCn: '服装设计师', code: 'ARE', industry: '时尚/电商', entryPath: '打版/趋势' },
  { jobCn: '会展/空间设计师', code: 'ARE', industry: '会展/商业', entryPath: '3D/搭建' },
  { jobCn: '动画师', code: 'ARI', industry: '动画/游戏', entryPath: '绑定/动作' },
  { jobCn: '艺术教师', code: 'ASR', industry: '教育/培训', entryPath: '专业院校+教资' },
  { jobCn: '建筑表现/效果图', code: 'ARI', industry: '建筑', entryPath: '3DMax/SU' },
  { jobCn: '中小学教师', code: 'SIA', industry: '教育', entryPath: '学科+教资' },
  { jobCn: '高校辅导员', code: 'SIE', industry: '高校', entryPath: '思政/心理' },
  { jobCn: '幼儿教师', code: 'SAE', industry: '教育', entryPath: '幼教资格' },
  { jobCn: '特教教师', code: 'SIA', industry: '教育/残联', entryPath: '特教资格' },
  { jobCn: '护士', code: 'SIC', industry: '医疗', entryPath: '护资+科室' },
  { jobCn: '医生/临床', code: 'SIC', industry: '医疗', entryPath: '执医+规培' },
  { jobCn: '社工', code: 'SCA', industry: '民政/社区', entryPath: '社工证' },
  { jobCn: '职业规划师', code: 'SIE', industry: '就业/教育', entryPath: '测评+个案' },
  { jobCn: '人力资源/HR', code: 'SCE', industry: '全行业', entryPath: '招聘/薪酬/员工关系' },
  { jobCn: 'HRBP', code: 'SCE', industry: '互联网/制造', entryPath: '业务伙伴' },
  { jobCn: '培训师', code: 'SEA', industry: '企业/教育', entryPath: '课程开发' },
  { jobCn: '职业治疗师/康复师', code: 'SIC', industry: '医疗/养老', entryPath: '康复医学' },
  { jobCn: '言语治疗师', code: 'SIC', industry: '医疗/特教', entryPath: '病理+训练' },
  { jobCn: '养老护理员/智能照护', code: 'SRC', industry: '养老', entryPath: '护理证+AI监测' },
  { jobCn: '社工督导/社区治理', code: 'SCE', industry: '社区/政府', entryPath: '项目管理' },
  { jobCn: '公关/媒介', code: 'SAE', industry: '企业/PR', entryPath: '媒体关系' },
  { jobCn: '猎头/人才顾问', code: 'ESC', industry: '人力服务', entryPath: '行业mapping' },
  { jobCn: '公益项目官员', code: 'SAC', industry: '非营利', entryPath: '项目制' },
  { jobCn: '导游/研学导师', code: 'SRE', industry: '文旅', entryPath: '导游证/研学' },
  { jobCn: '调解/信访社工', code: 'SCE', industry: '司法/社区', entryPath: '法律基础' },
  { jobCn: '销售经理', code: 'ESC', industry: '全行业', entryPath: '行业产品知识' },
  { jobCn: '大客户销售', code: 'EIS', industry: 'IT/制造', entryPath: '解决方案销售' },
  { jobCn: '市场营销经理', code: 'EAS', industry: '全行业', entryPath: '品牌/投放/内容' },
  { jobCn: '品牌公关总监', code: 'EAS', industry: '集团/Agency', entryPath: '危机+品牌' },
  { jobCn: '创业者/EIR', code: 'ERI', industry: '多行业', entryPath: '小步验证' },
  { jobCn: '项目经理(PMP)', code: 'ECI', industry: 'IT/工程', entryPath: '范围/成本/进度' },
  { jobCn: '产品经理', code: 'EIA', industry: '互联网/硬件', entryPath: '需求/数据/原型' },
  { jobCn: '商业分析/战略', code: 'IEC', industry: '咨询/互联网', entryPath: '模型+行业' },
  { jobCn: '投资经理/VC', code: 'EIC', industry: '金融/创投', entryPath: '尽调+行业研究' },
  { jobCn: '银行对公/客户经理', code: 'ECS', industry: '金融', entryPath: '风控+客户' },
  { jobCn: '保险顾问/精算销售', code: 'ECI', industry: '保险', entryPath: '从业+CFP' },
  { jobCn: '律师', code: 'EIS', industry: '法律', entryPath: '法考+专长' },
  { jobCn: '合规/风控专员', code: 'ECI', industry: '金融/数据', entryPath: '法规+内控' },
  { jobCn: '政府采购/招投标', code: 'ECS', industry: '政府/工程', entryPath: '流程+资质' },
  { jobCn: '连锁门店店长', code: 'ECS', industry: '零售', entryPath: '营运+人货场' },
  { jobCn: '电商运营/店铺负责人', code: 'ECI', industry: '电商', entryPath: '平台规则+投放' },
  { jobCn: '直播运营/主播', code: 'EAS', industry: '短视频/电商', entryPath: '选品+场观' },
  { jobCn: '商务拓展BD', code: 'EIR', industry: '互联网/服务', entryPath: '合作谈判' },
  { jobCn: '房地产经纪', code: 'ESC', industry: '房产', entryPath: '片区+信任' },
  { jobCn: '供应链管理/采购', code: 'ECR', industry: '制造/零售', entryPath: 'ERP+议价' },
  { jobCn: '会计', code: 'CIE', industry: '全行业', entryPath: '初级+CPA' },
  { jobCn: '审计员', code: 'CIE', industry: '事务所/企业', entryPath: 'CPA' },
  { jobCn: '税务专员', code: 'CIE', industry: '企业/事务所', entryPath: '税法+申报' },
  { jobCn: '财务分析师', code: 'CIE', industry: '金融/企业', entryPath: '建模+报表' },
  { jobCn: '银行柜员', code: 'CSE', industry: '金融', entryPath: '业务+反欺诈' },
  { jobCn: '数据录入/档案管理员', code: 'CIS', industry: '全行业', entryPath: '熟练办公' },
  { jobCn: '行政助理', code: 'CSE', industry: '全行业', entryPath: '办公/会务/流程' },
  { jobCn: '人事专员/薪酬社保', code: 'CSE', industry: '全行业', entryPath: 'HRIS' },
  { jobCn: '质控/质检员', code: 'CIR', industry: '制造', entryPath: 'ISO/检验' },
  { jobCn: '统计分析员', code: 'CIR', industry: '政府/企业', entryPath: '报表+抽样' },
  { jobCn: '合规资料/体系工程师', code: 'CIE', industry: '医疗/制造', entryPath: 'ISO/注册' },
  { jobCn: '图书馆/知识管理', code: 'CIS', industry: '高校/政府', entryPath: '编目/数据库' },
  { jobCn: '法院书记员', code: 'CSI', industry: '司法', entryPath: '速录' },
  { jobCn: '报关/外贸单证', code: 'CEI', industry: '外贸', entryPath: '单证+关务' },
  { jobCn: '数据库管理员', code: 'CIE', industry: '互联网/金融', entryPath: '备份/性能' },
  { jobCn: '标准/专利流程', code: 'CIE', industry: 'IP/企业', entryPath: '官文/期限' },
  { jobCn: 'AI训练师/数据标注', code: 'ICR', industry: 'AI', entryPath: '标注规范/模型反馈' },
  { jobCn: '人工智能产品经理', code: 'EIA', industry: 'AI/互联网', entryPath: '算法理解+需求' },
  { jobCn: '网络安全工程师', code: 'ICE', industry: '安全/金融', entryPath: '攻防+合规' },
  { jobCn: '数字孪生/智能产线架构', code: 'RIC', industry: '制造', entryPath: '仿真+OT/IT' },
  { jobCn: '碳管理/ESG顾问', code: 'ICE', industry: '双碳/咨询', entryPath: '碳核算+报告' },
  { jobCn: '智慧农业工程师', code: 'IRC', industry: '农业/物联网', entryPath: '传感器+农艺' },
  { jobCn: '低空经济运营/无人机调度', code: 'RIE', industry: '低空/物流', entryPath: '空域+调度' },
  { jobCn: '具身机器人调试工程师', code: 'RIC', industry: '机器人', entryPath: '运动控制+场景' },
];

/**
 * 根据用户 RIASEC 代码匹配推荐职业（取1~3个）
 * 匹配策略：
 * 1. code 完全相同优先
 * 2. 其次取 code 前两位相同
 * 3. 再取首位相同
 * 按匹配度排序后去重，取前3个
 */
export function matchJobsByCode(userCode: string, limit = 3): JobMapping[] {
  if (!userCode) return [];
  const chars = userCode.split('');
  const first = chars[0];
  const firstTwo = chars.slice(0, 2).join('');

  const scored = JOB_MAPPINGS.map((j) => {
    let score = 0;
    if (j.code === userCode) score = 100;
    else if (j.code.startsWith(firstTwo)) score = 60;
    else if (j.code.startsWith(first)) score = 30;
    // 额外加分：用户代码的其他字母出现在职业 code 中
    for (const c of chars) {
      if (j.code.includes(c)) score += 5;
    }
    return { job: j, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  // 去重（同名职业），取前 limit
  const seen = new Set<string>();
  const result: JobMapping[] = [];
  for (const { job } of scored) {
    if (seen.has(job.jobCn)) continue;
    seen.add(job.jobCn);
    result.push(job);
    if (result.length >= limit) break;
  }
  return result;
}
