/**
 * 首页「本期导师」轻量公开数据
 * 只含可公开的陈列字段，不含人格 prompt / 知识库，避免撑大首页客户端包。
 * 字段与 src/lib/mentors.ts 保持一致，修改履历信息时两边同步。
 *
 * 头像约定（品牌 2.0）：
 * - avatar3d：与 logo 同款黏土 3D 头像，用于列表卡与导师介绍卡（素材就绪后启用）
 * - avatar2d：同款 2D 卡通分身，用于聊天对话（后续聊天页改造时启用）
 * - avatar：现有插画兜底
 */
export interface MentorPreview {
  id: string;
  name: string;
  avatar: string;
  avatar3d: string;
  avatar2d: string;
  title: string;
  company: string;
  years: number | string;
  industry: string;
  tags: string[];
}

export const mentorPreview: MentorPreview[] = [
  {
    id: 'lydiachen',
    name: 'Lydia Chen',
    avatar: '/avatars/lydiachen-chen.svg',
    avatar3d: '/avatars/lydiachen-3d.png',
    avatar2d: '/avatars/lydiachen-2d.png',
    title: 'HRVP',
    company: '心擎医疗',
    years: '25',
    industry: '医疗',
    tags: ['HR视角', '职业路径'],
  },
  {
    id: 'winnieni',
    name: 'Winnie Ni',
    avatar: '/avatars/winnieni-ni.svg',
    avatar3d: '/avatars/winnieni-3d.png',
    avatar2d: '/avatars/winnieni-2d.png',
    title: 'HR从业者 / 心理咨询师',
    company: '心擎医疗',
    years: '15',
    industry: '人力资源',
    tags: ['HRBP', '求职面试'],
  },
  {
    id: 'tinazhang',
    name: 'Tina Zhang',
    avatar: '/avatars/tinazhang-zhang.svg',
    avatar3d: '/avatars/tinazhang-3d.png',
    avatar2d: '/avatars/tinazhang-2d.png',
    title: 'HR负责人',
    company: '精品战略咨询',
    years: '>25',
    industry: '战略咨询',
    tags: ['咨询行业', '招聘'],
  },
  {
    id: 'freyagao',
    name: 'Freya Gao',
    avatar: '/avatars/freyagao-gao.svg',
    avatar3d: '/avatars/freyagao-gao.svg',
    avatar2d: '/avatars/freyagao-gao.svg',
    title: '产业投资经理',
    company: '医疗器械产业基金',
    years: '7',
    industry: '医疗器械/投资',
    tags: ['医疗器械', '产业投资'],
  },
  {
    id: 'phyllischi',
    name: 'Phyllis Chi',
    avatar: '/avatars/phyllischi-chi.svg',
    avatar3d: '/avatars/phyllischi-chi.svg',
    avatar2d: '/avatars/phyllischi-chi.svg',
    title: '资深财务顾问',
    company: '多家企业（顾问）',
    years: '资深',
    industry: '财务',
    tags: ['企业财务', '财务BP'],
  },
  {
    id: 'yingwang',
    name: 'Ying Wang',
    avatar: '/avatars/yingwang-wang.svg',
    avatar3d: '/avatars/yingwang-wang.svg',
    avatar2d: '/avatars/yingwang-wang.svg',
    title: '生产负责人',
    company: '具身智能/人形机器人',
    years: 16,
    industry: '智能制造',
    tags: ['新能源制造', '具身智能'],
  },
];
