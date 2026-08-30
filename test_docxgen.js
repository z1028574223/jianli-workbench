// 端到端测试：Node 环境直接调用 docxgen.build 生成四份样例
const fs = require('fs');
const DocxGen = require('./docxgen.js').DocxGen;

const samples = {
  notice: {
    project_name: '北星小学教学楼工程',
    supervisor_name: 'ZGX 项目监理机构',
    construction_party: '某建筑工程有限公司',
    engineer_name: '张总监',
    notice_number: '监字2026-018',
    date: '2026-08-29',
    subject: '三层梁板钢筋绑扎间距超标',
    body: '经巡视检查发现：三层梁板部分钢筋间距偏大，超出规范允许偏差。\n请立即组织整改。',
    requirement: '1、立即按设计图纸调整钢筋间距；\n2、限期2天内整改完成，自检合格后报监理部验收。',
    photos: []
  },
  contact: {
    project_name: '北星小学教学楼工程',
    no: '联字2026-007',
    toUnit: '某建筑工程有限公司项目部',
    subject: '关于提供二层砌体材料合格证的联系',
    body: '贵部施工的二层砌体工程所用材料，请于三日内提供出厂合格证及检测报告，报监理部审查。\n逾期未报审的部位将暂停验收。',
    signer: '李监理',
    date: '2026-08-29'
  },
  monthly: {
    project_name: '北星小学教学楼工程',
    supervisor_name: 'ZGX 项目监理机构',
    build_party: '北星小学',
    construct_party: '某建筑工程有限公司',
    design_party: '某设计院',
    issue: '3',
    progress_actual: '主体结构完成至五层',
    progress_reason: '8月连续降雨影响工期约3天',
    visa: {
      meeting: { count: '2', brief: '监理例会2次' },
      visa: { count: '1', brief: '基坑土方签证' },
      notice: { count: '3', brief: '监理通知单3份' },
      report: { count: '5', brief: '施工单位报审5项' }
    },
    impl_text: '本月主体结构施工进展顺利。',
    work_text: '共发出监理通知单3份，旁站16次。',
    issue_text: '部分钢筋间距超标，已发通知单整改。',
    next_text: '督促六层结构施工，组织中间验收。',
    attachment: '有关统计表、图片等',
    period_start: '2026-08-01',
    period_end: '2026-08-31'
  }
};

for (const [type, data] of Object.entries(samples)) {
  const bytes = DocxGen.build(type, data);
  const out = `E:/软件开发/监理app/test_${type}.docx`;
  fs.writeFileSync(out, Buffer.from(bytes));
  console.log('OK', type, bytes.length, 'bytes ->', out);
}
