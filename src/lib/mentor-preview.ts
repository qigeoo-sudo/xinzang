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
    id: 'lydia',
    name: 'Lydia Chen',
    avatar: '/avatars/lydia-chen.svg',
    avatar3d: '/avatars/lydia-3d.png',
    avatar2d: '/avatars/lydia-2d.png',
    title: 'HRVP',
    company: '心擎医疗',
    years: '25',
    industry: '医疗',
    tags: ['HR视角', '职业路径'],
  },
  {
    id: 'winnie',
    name: 'Winnie Ni',
    avatar: '/avatars/winnie-ni.svg',
    avatar3d: '/avatars/winnie-3d.png',
    avatar2d: '/avatars/winnie-2d.png',
    title: 'HR从业者 / 心理咨询师',
    company: '心擎医疗',
    years: '15',
    industry: '人力资源',
    tags: ['HRBP', '求职面试'],
  },
  {
    id: 'tina',
    name: 'Tina Zhang',
    avatar: '/avatars/tina-zhang.svg',
    avatar3d: '/avatars/tina-3d.png',
    avatar2d: '/avatars/tina-2d.png',
    title: 'HR负责人',
    company: '精品战略咨询',
    years: '>25',
    industry: '战略咨询',
    tags: ['咨询行业', '招聘'],
  },
  {
    id: 'freya',
    name: 'Freya Gao',
    avatar: '/avatars/freya-gao.svg',
    avatar3d: '/avatars/freya-gao.svg',
    avatar2d: '/avatars/freya-gao.svg',
    title: '产业投资经理',
    company: '医疗器械产业基金',
    years: '7',
    industry: '医疗器械/投资',
    tags: ['医疗器械', '产业投资'],
  },
  {
    id: 'phyllis',
    name: 'Phyllis Chi',
    avatar: '/avatars/phyllis-chi.svg',
    avatar3d: '/avatars/phyllis-chi.svg',
    avatar2d: '/avatars/phyllis-chi.svg',
    title: '资深财务顾问',
    company: '多家企业（顾问）',
    years: '资深',
    industry: '财务',
    tags: ['企业财务', '财务BP'],
  },
  {
    id: 'ying',
    name: 'Ying Wang',
    avatar: '/avatars/ying-wang.svg',
    avatar3d: '/avatars/ying-wang.svg',
    avatar2d: '/avatars/ying-wang.svg',
    title: '生产负责人',
    company: '具身智能/人形机器人',
    years: 16,
    industry: '智能制造',
    tags: ['新能源制造', '具身智能'],
  },
];
