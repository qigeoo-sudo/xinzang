'use client';

/**
 * 注册 / 档案编辑共享分步向导
 *
 * - mode="register"（/register-v2）：手机验证 → 状态与教育 → 方向与地点，
 *   走 /api/auth/register，可携带访客暂存的 RIASEC 结果，成功后自动登录
 * - mode="edit"（/dashboard/profile/edit）：基本信息与状态 → 方向与地点，
 *   回填已有档案，走 PUT /api/user/profile，成功后返回档案页
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { CustomSelect } from '@/components/custom-select';
import { SchoolSearch } from '@/components/school-search';
import { AssessmentSummary } from '@/components/assessment/assessment-summary';
import { HomeFooter } from '@/components/home/home-footer';
import {
  MAJOR_OPTIONS,
  CAREER_OPTIONS,
  WORK_GOAL_WORKING,
  WORK_GOAL_JOBLESS,
  WORK_EXP_DURATION_OPTIONS,
  HELP_PRIORITY_OPTIONS,
  HELP_OTHER_VALUE,
  MENTOR_PREFERENCE_OPTIONS,
  PROVINCE_OPTIONS,
  PROVINCE_CITIES,
  OVERSEAS_COUNTRY_OPTIONS,
} from '@/lib/register-options';
import {
  getPendingAssessment,
  clearPendingAssessment,
} from '@/lib/riasec/storage';
import type { AssessmentPayload } from '@/lib/register-v2';

type Identity = '' | 'student' | 'working' | 'jobless';
type MonthFieldKey = 'birth' | 'enroll' | 'expected' | 'grad';

// 选省后市栏自动置灰的地区：四个直辖市 + 港澳
// （"海外"不在此列：选中后市栏改为国家/地区下拉，见 OVERSEAS_COUNTRY_OPTIONS）
const SINGLE_CITY_PROVINCES = ['北京市', '天津市', '上海市', '重庆市', '香港特别行政区', '澳门特别行政区'];
// 非单市级地区，市列表末尾追加项（希望工作地点 / 目前所在地 文案不同）
const ANY_CITY = { value: '__any__', label: '均可考虑' };
const OTHER_CITY = { value: '__other__', label: '其他' };

// 各年月字段的可选年份范围
const CURRENT_YEAR = new Date().getFullYear();
const MONTH_FIELDS: Record<MonthFieldKey, { title: string; minY: number; maxY: number }> = {
  // 出生年份选择器从 2014 开始递减（chips 按 maxY→minY 渲染，maxY 即首选项）
  birth: { title: '出生年月', minY: 1950, maxY: 2014 },
  enroll: { title: '入学年月', minY: 2000, maxY: CURRENT_YEAR },
  expected: { title: '毕业日期', minY: CURRENT_YEAR, maxY: 2040 },
  grad: { title: '毕业日期', minY: 1960, maxY: CURRENT_YEAR },
};

// 新版首页视觉变量（来自 home-sample-2 设计稿 computed style）
const C = {
  bg: '#F2E6D8',
  heroFrom: '#FDF5EC',
  ink: '#2C3E5C',
  body: '#5A6B7E',
  orange: '#F5A623',
  orangeDark: '#D4881A',
  yellow: '#F8C741',
  sage: '#7D9471',
  inputBg: '#FCF2F0',
  inputBorder: '#E8B5B5',
  cardLine: 'rgba(209,213,219,0.4)',
  danger: '#C0654A',
};

const inputCls =
  'w-full bg-[#FCF2F0] border-2 border-[#E8B5B5] rounded-[10px] px-4 py-3 text-[15px] text-[#2C3E5C] placeholder:text-[#B6A89C] focus:outline-none focus:border-[#F5A623] focus:ring-2 focus:ring-[#F5A623]/20 transition-all';

function monthNow(offsetYears = 0): string {
  const d = new Date();
  const y = d.getFullYear() + offsetYears;
  return `${y}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 昵称字节上限（与后端 zod / profile 路由一致：24 字节 ≈ 中文 8 字 / 英文 24 字母）
const NICKNAME_MAX_BYTES = 24;
const nicknameEncoder = new TextEncoder();
function truncateByBytes(text: string, maxBytes: number): string {
  if (!text) return '';
  const bytes = nicknameEncoder.encode(text);
  if (bytes.length <= maxBytes) return text;
  // 按 UTF-8 边界截断，不破坏多字节字符
  let truncated = '';
  for (const ch of text) {
    if (nicknameEncoder.encode(truncated + ch).length > maxBytes) break;
    truncated += ch;
  }
  return truncated;
}

function fmtMonth(v: string): string {
  if (!v) return '未填写';
  const [y, m] = v.split('-');
  return `${y} 年 ${Number(m)} 月`;
}

// 档案编辑模式的回填值（由档案页把 UserProfile 映射过来）
export interface WizardInitialValues {
  nickname?: string;
  birthMonth?: string;
  identity?: Identity;
  enrollMonth?: string;
  school?: string;
  major?: string;
  expectedGrad?: string;
  gradMonth?: string;
  workGoal?: string;
  fullTimeExp?: string;
  partTimeExp?: string;
  workProvince?: string;
  workCity?: string; // 已还原为下拉值，'均可考虑' → '__any__'
  curProvince?: string;
  curCity?: string; // '其他' → '__other__'
  careers?: string[];
  // 让导师分身更懂你（选填；helpPriority 单选数组 0/1 项，mentorPreference 多选）
  careerAnxiety?: string;
  helpPriority?: string[];
  mentorPreference?: string[];
  contactEmail?: string; // 选填联系邮箱（独立于登录邮箱）
}

export function RegisterWizard({
  mode,
  initial,
  phone: phoneProp,
}: {
  mode: 'register' | 'edit';
  initial?: WizardInitialValues;
  phone?: string;
}) {
  const isEdit = mode === 'edit';
  const router = useRouter();

  // 两种模式各自的步骤序列
  const SECTIONS: Array<'account' | 'identity' | 'locations'> = isEdit
    ? ['identity', 'locations']
    : ['account', 'identity', 'locations'];
  const STEP_META = isEdit
    ? [{ title: '基本信息', sub: '' }, { title: '方向与地点', sub: '' }]
    : [{ title: '手机验证', sub: '' }, { title: '你的状态', sub: '' }, { title: '方向与地点', sub: '' }];
  const [stepIdx, setStepIdx] = useState(0);
  const section = SECTIONS[stepIdx];
  const [done, setDone] = useState(false);

  // 切换步骤时滚动到顶部
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [stepIdx]);

  // 第一步（账号）
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [pwdErr, setPwdErr] = useState('');
  const [confirmErr, setConfirmErr] = useState('');
  const [code, setCode] = useState('');
  const [sentCode, setSentCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [nickname, setNickname] = useState(initial?.nickname ?? '');
  // 昵称不文明用语本地预检（迷你词库独立 chunk，挂载后预加载；blocked 即不允许提交）
  const [nicknameBlocked, setNicknameBlocked] = useState(false);
  const sensitiveModRef = useRef<{ containsProfanity: (t: string) => boolean } | null>(null);
  const nicknameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anxietyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const helpOtherTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mentorPrefOtherTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [birthMonth, setBirthMonth] = useState(initial?.birthMonth ?? '');

  // 年月选择弹层（自定义，替代原生 month 控件）
  const [monthSheet, setMonthSheet] = useState<MonthFieldKey | null>(null);
  const [draftYear, setDraftYear] = useState<number | null>(null);
  const [draftMonth, setDraftMonth] = useState<number | null>(null);
  const draftYearRef = useRef<HTMLButtonElement>(null);

  // 第二步（状态与教育）
  const [identity, setIdentity] = useState<Identity>(initial?.identity ?? '');
  const [enrollMonth, setEnrollMonth] = useState(initial?.enrollMonth ?? '');
  const [school, setSchool] = useState(initial?.school ?? '');
  const [major, setMajor] = useState(initial?.major ?? '');
  const [expectedGrad, setExpectedGrad] = useState(initial?.expectedGrad ?? '');
  const [workGoal, setWorkGoal] = useState(initial?.workGoal ?? '');
  const [gradMonth, setGradMonth] = useState(initial?.gradMonth ?? '');
  const [workExp, setWorkExp] = useState(initial?.fullTimeExp ?? '');
  const [partTimeExp, setPartTimeExp] = useState(initial?.partTimeExp ?? '');

  // 第三步（地点与方向）
  // 旧档案"海外"省市栏曾自动填"海外"，现在第二栏是国家下拉，旧值映射到"其他"
  const legacyCity = (province: string | undefined, city: string | undefined) =>
    province === '海外' && city === '海外' ? '其他' : city ?? '';
  const [workProvince, setWorkProvince] = useState(initial?.workProvince ?? '');
  const [workCity, setWorkCity] = useState(() => legacyCity(initial?.workProvince, initial?.workCity));
  const [currentProvince, setCurrentProvince] = useState(initial?.curProvince ?? '');
  const [currentCity, setCurrentCity] = useState(() => legacyCity(initial?.curProvince, initial?.curCity));
  const [careers, setCareers] = useState<string[]>(initial?.careers ?? []);

  // 让导师分身更懂你（选填，默认收起；已有内容时默认展开）
  const [careerAnxiety, setCareerAnxiety] = useState(initial?.careerAnxiety ?? '');
  const [anxietyBlocked, setAnxietyBlocked] = useState(false);
  // 帮助方面为单选：helpChoice 取固定 value 或 HELP_OTHER_VALUE；helpOther 为“其他”原文
  const initialHelp = initial?.helpPriority?.[0] ?? '';
  const [helpChoice, setHelpChoice] = useState(
    initialHelp && HELP_PRIORITY_OPTIONS.some((o) => o.value === initialHelp)
      ? initialHelp
      : initialHelp
        ? HELP_OTHER_VALUE
        : ''
  );
  const [helpOther, setHelpOther] = useState(
    initialHelp && !HELP_PRIORITY_OPTIONS.some((o) => o.value === initialHelp)
      ? initialHelp.slice(0, 20)
      : ''
  );
  const [helpOtherBlocked, setHelpOtherBlocked] = useState(false);
  // 想深聊的人：多选，仅回填新名单内的值（旧名单废弃值不迁移）
  const [mentorPreference, setMentorPreference] = useState<string[]>(
    (initial?.mentorPreference ?? []).filter((v) =>
      MENTOR_PREFERENCE_OPTIONS.some((o) => o.value === v)
    )
  );
  // "想深聊的人"选了"其他"时的补充文本
  const initialMentorPrefOther = (initial?.mentorPreference ?? []).find(
    (v) => v && v !== '' && !MENTOR_PREFERENCE_OPTIONS.some((o) => o.value === v)
  );
  const [mentorPrefOther, setMentorPrefOther] = useState(initialMentorPrefOther?.slice(0, 20) ?? '');
  const [mentorPrefOtherBlocked, setMentorPrefOtherBlocked] = useState(false);
  // 选填联系邮箱（线下活动通知用）
  const [contactEmail, setContactEmail] = useState(initial?.contactEmail ?? '');
  const [emailErr, setEmailErr] = useState('');
  const [showMentorHints, setShowMentorHints] = useState(
    Boolean(
      (initial?.careerAnxiety && initial.careerAnxiety.trim()) ||
        initial?.helpPriority?.length ||
        initial?.mentorPreference?.some((v) => MENTOR_PREFERENCE_OPTIONS.some((o) => o.value === v))
    )
  );
  // 选填联系邮箱卡片折叠（已有内容时默认展开）
  const [showContactEmail, setShowContactEmail] = useState(Boolean(initial?.contactEmail && initial.contactEmail.trim()));

  // 年月字段值 / 写回方法映射
  const MONTH_VALUES: Record<MonthFieldKey, string> = {
    birth: birthMonth,
    enroll: enrollMonth,
    expected: expectedGrad,
    grad: gradMonth,
  };
  const MONTH_SETTERS: Record<MonthFieldKey, (v: string) => void> = {
    birth: setBirthMonth,
    enroll: setEnrollMonth,
    expected: setExpectedGrad,
    grad: setGradMonth,
  };

  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [aiChecking, setAiChecking] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // 请求态：发送验证码 / 提交
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // 访客在测评页暂存的 RIASEC 结果（仅注册模式：进页面时读取，注册成功随档案落库）
  const [pendingAssessment, setPendingAssessment] = useState<AssessmentPayload | null>(null);
  const [savedAssessment, setSavedAssessment] = useState<AssessmentPayload | null>(null);
  // 注册成功但自动登录失败（极少见），成功页提示手动登录
  const [autoLoginFailed, setAutoLoginFailed] = useState(false);

  useEffect(() => {
    if (!isEdit) setPendingAssessment(getPendingAssessment());
  }, [isEdit]);

  // 轻提示：浮在页面顶部、不占布局，2.5 秒后自动消失（验证码 Mock 等用完即走的信息）
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  };

  // 报错信息吸顶可见：出现错误时自动滚动到错误条
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // 打开年月弹层时，草稿初始化为当前值
  useEffect(() => {
    if (!monthSheet) return;
    const v = MONTH_VALUES[monthSheet];
    if (v) {
      const [y, m] = v.split('-');
      setDraftYear(Number(y));
      setDraftMonth(Number(m));
    } else {
      setDraftYear(null);
      setDraftMonth(null);
    }
    // 年份 chips 渲染后滚到选中年
    setTimeout(() => draftYearRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' }), 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthSheet]);

  const cityOptions = useMemo(() => {
    if (!workProvince) return [];
    if (workProvince === '海外') return OVERSEAS_COUNTRY_OPTIONS;
    if (SINGLE_CITY_PROVINCES.includes(workProvince)) return [{ value: workProvince, label: workProvince }];
    return [...PROVINCE_CITIES[workProvince].map((c) => ({ value: c, label: c })), ANY_CITY];
  }, [workProvince]);

  const currentCityOptions = useMemo(() => {
    if (!currentProvince) return [];
    if (currentProvince === '海外') return OVERSEAS_COUNTRY_OPTIONS;
    if (SINGLE_CITY_PROVINCES.includes(currentProvince)) return [{ value: currentProvince, label: currentProvince }];
    return [...PROVINCE_CITIES[currentProvince].map((c) => ({ value: c, label: c })), OTHER_CITY];
  }, [currentProvince]);

  const workCityDisabled = workProvince ? SINGLE_CITY_PROVINCES.includes(workProvince) : true;
  const currentCityDisabled = currentProvince ? SINGLE_CITY_PROVINCES.includes(currentProvince) : true;
  const cityLabel = (v: string) => (v === '__any__' ? '均可考虑' : v === '__other__' ? '其他' : v);

  // 「最近打算」选项随身份变化：在职 / 待业各一套
  const workGoalOptions = useMemo(() => {
    if (identity === 'jobless') return WORK_GOAL_JOBLESS;
    return WORK_GOAL_WORKING;
  }, [identity]);

  const isValidPhone = (v: string) => /^1[3-9]\d{9}$/.test(v);

  /**
   * 手机号输入归一化：
   * 手机自动填充常带国际区号（如 +86 139xxxx 或 +1 862 xxx）。
   * 去掉所有非数字后，若以 86 开头且总长 13 位（中国区号 + 11 位手机号），
   * 去掉 86，保留 11 位；其余情况保留纯数字，交由校验拦截。
   */
  const normalizePhone = (raw: string): string => {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('86') && digits.length >= 13) {
      return digits.slice(2, 13);
    }
    return digits.slice(0, 11);
  };

  // 挂载后预加载不文明用语检查 chunk（失败静默，后端仍有硬校验兜底）
  useEffect(() => {
    let cancelled = false;
    import('@/lib/profanity')
      .then((m) => {
        if (cancelled) return;
        sensitiveModRef.current = m;
        // 编辑模式回填的选填区文本也补检一次
        if (initial?.careerAnxiety?.trim()) setAnxietyBlocked(m.containsProfanity(initial.careerAnxiety.trim()));
        if (helpOther.trim()) setHelpOtherBlocked(m.containsProfanity(helpOther.trim()));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (nicknameTimerRef.current) clearTimeout(nicknameTimerRef.current);
      if (anxietyTimerRef.current) clearTimeout(anxietyTimerRef.current);
      if (helpOtherTimerRef.current) clearTimeout(helpOtherTimerRef.current);
    };
    // 仅挂载时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runNicknameCheck = (value: string) => {
    const v = value.trim();
    if (!v) { setNicknameBlocked(false); return; }
    const mod = sensitiveModRef.current;
    if (mod) {
      setNicknameBlocked(mod.containsProfanity(v));
    } else {
      // 模块还没加载完：加载后再判一次
      import('@/lib/profanity')
        .then((m) => { sensitiveModRef.current = m; setNicknameBlocked(m.containsProfanity(v)); })
        .catch(() => {});
    }
  };

  const onNicknameChange = (value: string) => {
    // 按字节截断，避免用户输入到一半被卡死
    const safe = truncateByBytes(value, NICKNAME_MAX_BYTES);
    setNickname(safe);
    setNicknameBlocked(false); // 打字过程先清除，停顿后再判
    if (nicknameTimerRef.current) clearTimeout(nicknameTimerRef.current);
    nicknameTimerRef.current = setTimeout(() => runNicknameCheck(safe), 300);
  };

  // 选填区文本框的不文明用语检查（与昵称同一套词库）
  const runHintCheck = (value: string, setBlocked: (b: boolean) => void) => {
    const v = value.trim();
    if (!v) { setBlocked(false); return; }
    const mod = sensitiveModRef.current;
    if (mod) {
      setBlocked(mod.containsProfanity(v));
    } else {
      import('@/lib/profanity')
        .then((m) => { sensitiveModRef.current = m; setBlocked(m.containsProfanity(v)); })
        .catch(() => {});
    }
  };

  const onAnxietyChange = (value: string) => {
    const safe = value.slice(0, 100);
    setCareerAnxiety(safe);
    setAnxietyBlocked(false);
    if (anxietyTimerRef.current) clearTimeout(anxietyTimerRef.current);
    anxietyTimerRef.current = setTimeout(() => runHintCheck(safe, setAnxietyBlocked), 300);
  };

  const onHelpOtherChange = (value: string) => {
    const safe = value.slice(0, 20);
    setHelpOther(safe);
    setHelpOtherBlocked(false);
    if (helpOtherTimerRef.current) clearTimeout(helpOtherTimerRef.current);
    helpOtherTimerRef.current = setTimeout(() => runHintCheck(safe, setHelpOtherBlocked), 300);
  };

  const onMentorPrefOtherChange = (value: string) => {
    const safe = value.slice(0, 20);
    setMentorPrefOther(safe);
    setMentorPrefOtherBlocked(false);
    if (mentorPrefOtherTimerRef.current) clearTimeout(mentorPrefOtherTimerRef.current);
    mentorPrefOtherTimerRef.current = setTimeout(() => runHintCheck(safe, setMentorPrefOtherBlocked), 300);
  };

  // 帮助方面单选：点已选中项可取消；选固定项时清掉“其他”文本
  const toggleHelpChoice = (v: string) => {
    setError('');
    if (helpChoice === v) {
      setHelpChoice('');
    } else {
      setHelpChoice(v);
      if (v !== HELP_OTHER_VALUE) setHelpOther('');
    }
  };

  const passwordHint = (v: string) => {
    if (!v) return '';
    if (v.length < 8) return '密码至少需要 8 位字符';
    if (!/[a-zA-Z]/.test(v) || !/[0-9]/.test(v)) return '密码必须包含字母和数字';
    return '';
  };

  // 离开输入框即时校验，不用等点下一步
  const checkPwd = (v: string) => setPwdErr(v ? passwordHint(v) : '');
  const checkConfirm = (v: string, pwd = password) => {
    if (!v) { setConfirmErr(''); return; }
    setConfirmErr(v === pwd ? '' : '两次输入的密码不一致');
  };

  // 发送验证码：走 /api/auth/send-code（Mock 模式会在响应里直接返回 code）
  const handleSendCode = async () => {
    setError('');
    if (sending || countdown > 0) return;
    if (!isValidPhone(phone)) {
      setError('请输入有效的 11 位手机号');
      return;
    }
    if (passwordHint(password)) {
      setError(passwordHint(password));
      return;
    }
    if (password !== confirmPwd) {
      setError('两次输入的密码不一致');
      return;
    }
    setSending(true);
    // 用 AbortController 做超时兜底：网络异常导致 fetch 永不返回时，
    // 10 秒后主动 abort，避免按钮永远卡在「发送中…」。
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'phone', target: phone }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '验证码发送失败，请稍后再试');
        return;
      }
      // Mock 环境接口直接回传验证码，仅用于本地/演示；生产环境该字段不存在
      if (data.code) {
        setSentCode(data.code);
        setCode(data.code); // Mock 模式自动填入验证码输入框
        showToast(`演示环境验证码：${data.code}，已自动填入`);
      } else {
        setSentCode('__sent__');
        setCode('');
        showToast('验证码已发送，请注意查收短信');
      }
      setCountdown(60);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('请求超时，请检查网络后重试');
      } else {
        setError('网络不太通，验证码没发出去，请稍后再试');
      }
    } finally {
      clearTimeout(timeoutId);
      setSending(false);
    }
  };

  const validateAccount = () => {
    if (!isValidPhone(phone)) return '请输入有效的 11 位手机号';
    const hint = passwordHint(password);
    if (hint) return hint;
    if (password !== confirmPwd) return '两次输入的密码不一致';
    if (!sentCode) return '请先获取短信验证码';
    if (!/^\d{6}$/.test(code)) return '请填写 6 位短信验证码';
    // Mock 模式前端知道验证码，可提前拦错；生产环境以服务端校验为准
    if (sentCode !== '__sent__' && code !== sentCode) return '验证码不正确';
    if (!nickname.trim()) return '请填写姓名或昵称';
    if (nicknameBlocked) return '昵称含不文明用语，请换一个';
    if (!birthMonth) return '请选择出生年月';
    if (birthMonth > monthNow(-15)) return '年龄需满 15 岁';
    return '';
  };

  const validateIdentity = () => {
    // 编辑模式：姓名 / 出生年月在本步
    if (isEdit) {
      if (!nickname.trim()) return '请填写姓名或昵称';
      if (nicknameBlocked) return '昵称含不文明用语，请换一个';
      if (!birthMonth) return '请选择出生年月';
      if (birthMonth > monthNow(-15)) return '年龄需满 15 岁';
    }
    if (!identity) return '请选择你目前的状态';
    const now = monthNow(0);
    // 在校：入学年月、学校名称、专业分类、毕业日期（原预计）必填；毕业日期需 ≥ 当前年月且晚于入学
    if (identity === 'student') {
      if (!enrollMonth) return '请选择入学年月';
      if (!school.trim()) return '请填写学校名称';
      if (!major) return '请选择专业分类';
      if (!expectedGrad) return '请选择毕业日期';
      if (expectedGrad < now) return '毕业日期不能早于当前月份';
      if (expectedGrad <= enrollMonth) return '毕业日期需要晚于入学年月';
    } else {
      // 在职 / 待业：最近打算、入学年月、学校名称、专业分类、毕业日期必填；毕业日期需 ≤ 当前年月
      if (!workGoal) return '请选择你最近的打算';
      if (!enrollMonth) return '请选择入学年月';
      if (!school.trim()) return '请填写学校名称';
      if (!major) return '请选择专业分类';
      if (!gradMonth) return '请选择毕业日期';
      if (gradMonth > now) return '毕业日期不能晚于当前月份';
      if (gradMonth <= enrollMonth) return '毕业日期需要晚于入学年月';
    }
    return '';
  };

  const validateLocations = () => {
    if (!workProvince || !workCity) return '请选择希望工作地点（省 / 市）';
    if (!currentProvince || !currentCity) return '请选择目前所在地（省 / 市）';
    if (careers.length === 0) return '请至少选择一个感兴趣的职业方向';
    // 选填区：填了就必须合规
    if (anxietyBlocked) return '职业焦虑描述含不文明用语，请修改后再保存';
    if (helpChoice === HELP_OTHER_VALUE) {
      if (!helpOther.trim()) return '请填写“其他”方面的内容';
      if (helpOtherBlocked) return '“其他”内容含不文明用语，请修改后再保存';
    }
    if (mentorPreference.includes('其他')) {
      if (!mentorPrefOther.trim()) return '请填写想深聊的“其他”人选';
      if (mentorPrefOtherBlocked) return '“其他”内容含不文明用语，请修改后再保存';
    }
    return '';
  };

  // 收集当前页文本字段供 AI 审核
  const collectTextFields = (): Record<string, string> => {
    const fields: Record<string, string> = {};
    if (section === 'identity') {
      if (nickname.trim()) fields.nickname = nickname.trim();
    }
    if (section === 'locations') {
      if (school.trim()) fields.school = school.trim();
      if (careerAnxiety.trim()) fields.careerAnxiety = careerAnxiety.trim();
      if (helpChoice === HELP_OTHER_VALUE && helpOther.trim()) fields.helpPriorityOther = helpOther.trim();
      if (mentorPreference.includes('其他') && mentorPrefOther.trim()) fields.mentorPrefOther = mentorPrefOther.trim();
    }
    return fields;
  };

  // 翻页/提交前调用 DeepSeek 审核；通过返回 true
  const checkFieldsWithAI = async (): Promise<boolean> => {
    const fields = collectTextFields();
    if (Object.keys(fields).length === 0) return true;
    setAiChecking(true);
    try {
      const resp = await fetch('/api/profile/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
      const data = await resp.json();
      setAiChecking(false);
      if (data.pass === false) {
        // 高亮对应字段
        const f = data.field;
        if (f === 'nickname') setNicknameBlocked(true);
        else if (f === 'careerAnxiety') setAnxietyBlocked(true);
        else if (f === 'helpPriorityOther') setHelpOtherBlocked(true);
        else if (f === 'mentorPrefOther') setMentorPrefOtherBlocked(true);
        setError('你发送的内容可能含不合规信息，请重新组织一下句子再发吧');
        errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
      }
    } catch {
      setAiChecking(false);
      // 网络故障时不阻断
    }
    return true;
  };

  const goNext = async () => {
    setError('');
    const msg =
      section === 'account' ? validateAccount() : section === 'identity' ? validateIdentity() : validateLocations();
    if (msg) {
      setError(msg);
      return;
    }
    // 翻页前 AI 审核
    const passed = await checkFieldsWithAI();
    if (!passed) return;
    if (stepIdx < SECTIONS.length - 1) setStepIdx(stepIdx + 1);
  };

  const goBack = () => {
    setError('');
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
  };

  // 组装 v2 档案字段（注册 / 编辑共用同一份口径）
  // 编辑模式下空值显式发 null：这样「主动清空」（清掉兼职经验、切换身份后旧分支毕业日期）
  // 才能真正落库；注册模式空值发 undefined（新档案本来就是空）
  const buildProfilePayload = () => {
    const val = (v: string) => (v.trim() ? v.trim() : isEdit ? null : undefined);
    return {
      nickname: nickname.trim() || undefined,
      birthMonth: val(birthMonth),
      identity: identity || (isEdit ? null : undefined),
      enrollMonth: val(enrollMonth),
      school: val(school),
      major: val(major),
      expectedGrad: val(expectedGrad),
      gradMonth: val(gradMonth),
      workGoal: val(workGoal),
      fullTimeExp: val(workExp),
      partTimeExp: val(partTimeExp),
      workProvince: val(workProvince),
      workCity: workCity === '__any__' ? '均可考虑' : val(workCity),
      curProvince: val(currentProvince),
      curCity: currentCity === '__other__' ? '其他' : val(currentCity),
      careers: careers.length ? careers : isEdit ? null : undefined,
      // 让导师分身更懂你（选填；编辑模式删空时显式置 null）
      careerAnxiety: careerAnxiety.trim()
        ? careerAnxiety.trim()
        : isEdit
          ? null
          : undefined,
      // 帮助方面单选 → 单元素数组；“其他”存用户原文
      helpPriority:
        helpChoice === HELP_OTHER_VALUE
          ? helpOther.trim()
            ? [helpOther.trim()]
            : isEdit
              ? null
              : undefined
          : helpChoice
            ? [helpChoice]
            : isEdit
              ? null
              : undefined,
      mentorPreference: mentorPreference.length
        ? mentorPreference.map((v) => v === '其他' ? (mentorPrefOther.trim() || '其他') : v)
        : isEdit ? null : undefined,
      // 选填联系邮箱（独立于登录邮箱；编辑模式清空置 null）
      contactEmail: contactEmail.trim()
        ? contactEmail.trim().toLowerCase()
        : isEdit
          ? null
          : undefined,
    };
  };

  const handleRegister = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'phone',
          target: phone,
          password,
          code,
          profile: buildProfilePayload(),
          assessment: pendingAssessment ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '注册失败，请稍后再试');
        return;
      }

      // 注册成功：测评结果已在同一请求里落库，清掉本地暂存
      const assessmentJustSaved = pendingAssessment;
      clearPendingAssessment();
      setPendingAssessment(null);
      setSavedAssessment(assessmentJustSaved);

      // 建立登录会话（手机号注册后自动登录）
      const result = await signIn('credentials', {
        phone,
        password,
        redirect: false,
      });
      setAutoLoginFailed(!!result?.error);
      setDone(true);
    } catch {
      setError('网络不太通，注册没完成，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSave = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildProfilePayload()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '保存失败，请稍后再试');
        return;
      }
      router.refresh();
      setDone(true);
    } catch {
      setError('网络不太通，保存没完成，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    setError('');
    const msg = validateLocations();
    if (msg) {
      setError(msg);
      return;
    }
    // 邮箱格式校验
    if (contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      setError('联系邮箱格式不正确');
      return;
    }
    // 提交前 AI 审核所有文本字段
    const passed = await checkFieldsWithAI();
    if (!passed) return;
    if (isEdit) void handleEditSave();
    else void handleRegister();
  };

  const toggleCareer = (v: string) => {
    setCareers((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  const majorLabel = MAJOR_OPTIONS.find((o) => o.value === major)?.label;
  const workGoalLabel = workGoalOptions.find((o) => o.value === workGoal)?.label;
  const workExpLabel = WORK_EXP_DURATION_OPTIONS.find((o) => o.value === workExp)?.label;
  const partTimeExpLabel = WORK_EXP_DURATION_OPTIONS.find((o) => o.value === partTimeExp)?.label;
  const identityLabel = identity === 'student' ? '在校' : identity === 'working' ? '在职' : identity === 'jobless' ? '待业' : '';

  // 年月弹层操作
  const confirmMonth = () => {
    if (!monthSheet || !draftYear || !draftMonth) return;
    const v = `${draftYear}-${String(draftMonth).padStart(2, '0')}`;
    MONTH_SETTERS[monthSheet](v);
    setMonthSheet(null);
  };
  const clearMonth = () => {
    if (!monthSheet) return;
    MONTH_SETTERS[monthSheet]('');
    setMonthSheet(null);
  };

  // 成功页各分组
  const accountRows: [string, string][] = isEdit
    ? [
        ['手机号', phoneProp || ''],
        ['姓名 / 昵称', nickname.trim()],
        ['出生年月', fmtMonth(birthMonth)],
      ]
    : [
        ['手机号', phone],
        ['姓名 / 昵称', nickname.trim()],
        ['出生年月', fmtMonth(birthMonth)],
      ];

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: `linear-gradient(180deg, ${C.heroFrom} 0%, ${C.bg} 360px)` }}
    >
      {/* 顶栏：对齐新首页 banner；编辑模式左侧带返回入口 */}
      <header className="sticky top-0 z-40 bg-white/75 backdrop-blur-md border-b border-white/60">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          {isEdit ? (
            <>
              <button
                type="button"
                onClick={() => router.push('/dashboard/profile')}
                aria-label="返回我的档案"
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(245,166,35,0.12)', color: C.orangeDark }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <div className="leading-tight">
                <p className="text-sm font-semibold" style={{ color: C.ink }}>
                  返回我的档案
                </p>
              </div>
            </>
          ) : (
            <>
              <Image
                src="/icons/icon-1024.png"
                alt="榨职机 Career Companion"
                width={40}
                height={40}
                priority
                className="w-10 h-10 rounded-xl shadow-sm"
              />
              <div className="leading-tight">
                <p className="text-sm font-semibold" style={{ color: '#A67B5B' }}>
                  Career Companion
                </p>
                <p className="text-xs" style={{ color: C.body }}>
                  榨职机
                </p>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-8 pb-16">
        {!done ? (
          <>
            {/* 标题 */}
            <div className="mb-6">
              <h1
                className="text-[30px] leading-snug font-black mb-2"
                style={{ color: C.ink, fontFamily: '"Noto Serif SC", Georgia, serif' }}
              >
                {isEdit ? (
                  <>修改你的<span style={{ color: C.orange }}>档案</span></>
                ) : (
                  <>创建你的<span style={{ color: C.orange }}>账号</span></>
                )}
              </h1>
              <p className="text-sm" style={{ color: C.body }}>
                {isEdit ? '两步改完，导师看到的资料会同步更新' : '三步完成注册，开始和导师聊职业'}
              </p>
            </div>

            {/* 圆点步骤条 */}
            <div className="flex items-start mb-6 px-2">
              {SECTIONS.map((s, idx) => {
                const n = idx + 1;
                const reached = stepIdx >= idx;
                const passed = stepIdx > idx;
                return (
                  <div key={s} className="contents">
                    <div className="flex flex-col items-center" style={{ width: 56 }}>
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all"
                        style={{
                          background: passed ? C.orange : reached ? '#fff' : 'rgba(255,255,255,0.7)',
                          border: `2px solid ${reached ? C.orange : '#E0D3BF'}`,
                          color: passed ? '#fff' : reached ? C.orange : '#A99E8C',
                        }}
                      >
                        {passed ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M20 6L9 17l-5-5"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : (
                          n
                        )}
                      </div>
                      <span
                        className="text-[11px] mt-1.5 whitespace-nowrap"
                        style={{ color: reached ? C.ink : '#A99E8C', fontWeight: reached ? 600 : 400 }}
                      >
                        {STEP_META[idx].title}
                      </span>
                    </div>
                    {idx < SECTIONS.length - 1 && (
                      <div
                        className="flex-1 h-[2px] mt-4 rounded-full"
                        style={{ background: stepIdx > idx ? C.orange : '#E0D3BF' }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* 表单卡片 */}
            <div
              key={stepIdx}
              className="animate-fade-in rounded-[20px] p-5"
              style={{ background: 'rgba(255,255,255,0.85)', border: `1px solid ${C.cardLine}` }}
            >
              {pendingAssessment && (
                <div
                  className="flex items-center gap-2 text-[12px] rounded-[10px] px-3 py-2 mb-4"
                  style={{ background: 'rgba(122,158,110,0.12)', color: '#4E6B44' }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  你的职业兴趣测试结果已暂存，注册成功后自动存进档案
                </div>
              )}

              <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>
                第 {stepIdx + 1} 步：{STEP_META[stepIdx].title}
              </h2>
              {STEP_META[stepIdx].sub && (
                <p className="text-[13px] mb-5" style={{ color: C.body }}>
                  {STEP_META[stepIdx].sub}
                </p>
              )}

              {error && (
                <div
                  ref={errorRef}
                  className="sticky top-[72px] z-30 text-sm px-4 py-3 rounded-[10px] mb-4 shadow-sm"
                  style={{ background: '#FBEDE8', color: C.danger, border: '1px solid rgba(192,101,74,0.25)' }}
                >
                  {error}
                </div>
              )}
              {toast && section === 'account' && (
                <div
                  className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] text-sm px-4 py-2.5 rounded-[10px] shadow-lg max-w-[90vw] text-center"
                  style={{ background: 'rgba(44,62,92,0.92)', color: '#fff' }}
                >
                  {toast}
                </div>
              )}

              <div className="space-y-4">
                {section === 'account' && (
                  <>
                    <Field label="手机号" required>
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={13}
                        value={phone}
                        onChange={(e) => setPhone(normalizePhone(e.target.value))}
                        placeholder="请输入 11 位手机号"
                        autoComplete="tel"
                        className={inputCls}
                      />
                    </Field>

                    <Field label="密码" required hint="至少 8 位，必须包含字母和数字">
                      <div className="relative">
                        <input
                          type={showPwd ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => {
                            const v = e.target.value;
                            setPassword(v);
                            setPwdErr('');
                            if (confirmPwd) checkConfirm(confirmPwd, v);
                          }}
                          onBlur={(e) => checkPwd(e.target.value)}
                          maxLength={64}
                          autoComplete="new-password"
                          className={`${inputCls} pr-12`}
                          style={pwdErr ? { borderColor: C.danger } : undefined}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPwd(!showPwd)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                          style={{ color: C.body }}
                        >
                          {showPwd ? '隐藏' : '显示'}
                        </button>
                      </div>
                      {pwdErr && (
                        <p className="text-xs mt-1.5" style={{ color: C.danger }}>{pwdErr}</p>
                      )}
                    </Field>

                    <Field label="确认密码" required>
                      <div className="relative">
                        <input
                          type={showConfirmPwd ? 'text' : 'password'}
                          value={confirmPwd}
                          onChange={(e) => {
                            setConfirmPwd(e.target.value);
                            setConfirmErr('');
                          }}
                          onBlur={(e) => checkConfirm(e.target.value)}
                          maxLength={64}
                          autoComplete="new-password"
                          className={`${inputCls} pr-12`}
                          style={confirmErr ? { borderColor: C.danger } : undefined}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                          style={{ color: C.body }}
                        >
                          {showConfirmPwd ? '隐藏' : '显示'}
                        </button>
                      </div>
                      {confirmErr && (
                        <p className="text-xs mt-1.5" style={{ color: C.danger }}>{confirmErr}</p>
                      )}
                    </Field>

                    <Field label="短信验证码" required>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={code}
                          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="6 位验证码"
                          autoComplete="one-time-code"
                          autoCapitalize="none"
                          autoCorrect="off"
                          className={`${inputCls} flex-1 tracking-widest`}
                        />
                        <button
                          type="button"
                          onClick={handleSendCode}
                          disabled={countdown > 0 || sending}
                          className="shrink-0 px-4 rounded-[10px] text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap"
                          style={{ background: C.orange, minWidth: 104 }}
                        >
                          {sending
                            ? '发送中…'
                            : countdown > 0
                              ? `${countdown}s 后重发`
                              : sentCode
                                ? '重新发送'
                                : '发送验证码'}
                        </button>
                      </div>
                    </Field>

                    <Field label="姓名 / 昵称" required>
                      <input
                        type="text"
                        value={nickname}
                        onChange={(e) => onNicknameChange(e.target.value)}
                        placeholder="导师会这样称呼你"
                        className={inputCls}
                      />
                    </Field>

                    <Field label="出生年月" required>
                      <MonthTrigger
                        value={birthMonth}
                        placeholder="选择出生年月"
                        onClick={() => setMonthSheet('birth')}
                      />
                    </Field>
                  </>
                )}

                {section === 'identity' && (
                  <>
                    {/* 编辑模式：姓名 / 出生年月放在本步开头（注册模式它们在账号步） */}
                    {isEdit && (
                      <>
                        <Field label="姓名 / 昵称" required>
                          <input
                            type="text"
                            value={nickname}
                            onChange={(e) => onNicknameChange(e.target.value)}
                            onBlur={() => {
                              if (nicknameTimerRef.current) clearTimeout(nicknameTimerRef.current);
                              runNicknameCheck(nickname);
                            }}
                            placeholder="导师会这样称呼你"
                            className={inputCls}
                          />
                          {nicknameBlocked && (
                            <p className="mt-1.5 text-xs text-red-500">昵称含不文明用语，请换一个</p>
                          )}
                        </Field>
                        <Field label="出生年月" required>
                          <MonthTrigger
                            value={birthMonth}
                            placeholder="选择出生年月"
                            onClick={() => setMonthSheet('birth')}
                          />
                        </Field>
                      </>
                    )}

                    <Field label="目前状态" required>
                      <CustomSelect
                        value={identity}
                        onChange={(v) => {
                          const next = v as Identity;
                          setIdentity(next);
                          // 切换身份后，清空不属于新身份分支的毕业日期，避免留旧值
                          if (next === 'student') setGradMonth('');
                          else setExpectedGrad('');
                          // 切换身份后，清空不属于新身份候选集的「想法」
                          const goalOpts = next === 'jobless' ? WORK_GOAL_JOBLESS : WORK_GOAL_WORKING;
                          if (workGoal && !goalOpts.some((o) => o.value === workGoal)) setWorkGoal('');
                        }}
                        options={[
                          { value: 'student', label: '在校' },
                          { value: 'working', label: '在职' },
                          { value: 'jobless', label: '待业' },
                        ]}
                        placeholder="请选择在校 / 在职 / 待业"
                        className="!bg-[#FCF2F0] !border-[#E8B5B5] rounded-[10px]"
                      />
                    </Field>

                    {identity === 'student' && (
                      <div className="space-y-4 animate-fade-in">
                        <Field label="入学年月" required>
                          <MonthTrigger
                            value={enrollMonth}
                            placeholder="选择入学年月"
                            onClick={() => setMonthSheet('enroll')}
                          />
                        </Field>
                        <Field label="学校名称" required>
                          <SchoolSearch
                            value={school}
                            onChange={setSchool}
                            placeholder="请输入学校名称/简称"
                            inputClassName={inputCls}
                          />
                        </Field>
                        <Field label="专业分类" required>
                          <CustomSelect
                            value={major}
                            onChange={setMajor}
                            options={MAJOR_OPTIONS}
                            placeholder="请选择专业分类"
                            className="!bg-[#FCF2F0] !border-[#E8B5B5] rounded-[10px]"
                          />
                        </Field>
                        <Field label="毕业日期" required>
                          <MonthTrigger
                            value={expectedGrad}
                            placeholder="选择毕业日期"
                            onClick={() => setMonthSheet('expected')}
                          />
                        </Field>
                      </div>
                    )}

                    {(identity === 'working' || identity === 'jobless') && (
                      <div className="space-y-4 animate-fade-in">
                        <Field label="最近打算" required>
                          <CustomSelect
                            value={workGoal}
                            onChange={setWorkGoal}
                            options={workGoalOptions}
                            placeholder="请选择你最近的打算："
                            className="!bg-[#FCF2F0] !border-[#E8B5B5] rounded-[10px]"
                          />
                        </Field>
                        <Field label="入学年月" required>
                          <MonthTrigger
                            value={enrollMonth}
                            placeholder="选择入学年月"
                            onClick={() => setMonthSheet('enroll')}
                          />
                        </Field>
                        <Field label="学校名称" required>
                          <SchoolSearch
                            value={school}
                            onChange={setSchool}
                            placeholder="请输入学校名称/简称"
                            inputClassName={inputCls}
                          />
                        </Field>
                        <Field label="专业分类" required>
                          <CustomSelect
                            value={major}
                            onChange={setMajor}
                            options={MAJOR_OPTIONS}
                            placeholder="请选择专业分类"
                            className="!bg-[#FCF2F0] !border-[#E8B5B5] rounded-[10px]"
                          />
                        </Field>
                        <Field label="毕业日期" required>
                          <MonthTrigger
                            value={gradMonth}
                            placeholder="选择毕业日期"
                            onClick={() => setMonthSheet('grad')}
                          />
                        </Field>
                        <div>
                          <label className="block text-sm font-semibold mb-1.5" style={{ color: '#2C3E5C' }}>
                            工作经验
                          </label>
                          <div className="rounded-[10px] p-3 flex flex-col gap-3" style={{ border: '1px solid #E8B5B5', background: '#FCF2F0' }}>
                            <div className="flex items-center gap-3">
                              <span className="text-sm flex-shrink-0 w-9" style={{ color: '#2C3E5C' }}>全职</span>
                              <div className="flex-1 min-w-0">
                                <CustomSelect
                                  value={workExp}
                                  onChange={setWorkExp}
                                  options={WORK_EXP_DURATION_OPTIONS}
                                  placeholder="请选择工作时长"
                                  clearable
                                  className="!bg-white !border-[#E8B5B5] rounded-[10px]"
                                />
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm flex-shrink-0 w-9" style={{ color: '#2C3E5C' }}>兼职</span>
                              <div className="flex-1 min-w-0">
                                <CustomSelect
                                  value={partTimeExp}
                                  onChange={setPartTimeExp}
                                  options={WORK_EXP_DURATION_OPTIONS}
                                  placeholder="请选择工作时长"
                                  clearable
                                  className="!bg-white !border-[#E8B5B5] rounded-[10px]"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {section === 'locations' && (
                  <>
                    <Field label="希望工作地点（省 / 市）" required>
                      <div className="grid grid-cols-2 gap-3">
                        <CustomSelect
                          value={workProvince}
                          onChange={(v) => {
                            setWorkProvince(v);
                            // 单市级地区自动带上同名市并置灰；其他省清空等用户选
                            setWorkCity(SINGLE_CITY_PROVINCES.includes(v) ? v : '');
                          }}
                          options={PROVINCE_OPTIONS}
                          placeholder="选择省份"
                          className="!bg-[#FCF2F0] !border-[#E8B5B5] rounded-[10px]"
                        />
                        <CustomSelect
                          value={workCity}
                          onChange={setWorkCity}
                          options={cityOptions}
                          placeholder={workProvince ? '选择城市' : '请先选省份'}
                          disabled={workCityDisabled}
                          className="!bg-[#FCF2F0] !border-[#E8B5B5] rounded-[10px]"
                        />
                      </div>
                    </Field>

                    <Field label="目前所在地（省 / 市）" required>
                      <div className="grid grid-cols-2 gap-3">
                        <CustomSelect
                          value={currentProvince}
                          onChange={(v) => {
                            setCurrentProvince(v);
                            setCurrentCity(SINGLE_CITY_PROVINCES.includes(v) ? v : '');
                          }}
                          options={PROVINCE_OPTIONS}
                          placeholder="选择省份"
                          className="!bg-[#FCF2F0] !border-[#E8B5B5] rounded-[10px]"
                        />
                        <CustomSelect
                          value={currentCity}
                          onChange={setCurrentCity}
                          options={currentCityOptions}
                          placeholder={currentProvince ? '选择城市' : '请先选省份'}
                          disabled={currentCityDisabled}
                          className="!bg-[#FCF2F0] !border-[#E8B5B5] rounded-[10px]"
                        />
                      </div>
                    </Field>

                    <Field label="感兴趣的职业方向" required hint="可多选，至少选 1 个">
                      <div className="flex flex-wrap gap-2">
                        {CAREER_OPTIONS.map((o) => {
                          const active = careers.includes(o.value);
                          return (
                            <button
                              key={o.value}
                              type="button"
                              onClick={() => toggleCareer(o.value)}
                              className="px-3.5 py-2 rounded-full text-[13px] transition-all active:scale-95"
                              style={{
                                background: active ? C.orange : '#fff',
                                color: active ? '#fff' : C.ink,
                                border: `1.5px solid ${active ? C.orange : '#E8DCCB'}`,
                                fontWeight: active ? 600 : 400,
                              }}
                            >
                              {o.label}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs mt-2" style={{ color: '#B4780E' }}>
                        已选 {careers.length} 个
                      </p>
                    </Field>

                    {/* 让导师分身更懂你 — 选填折叠区，默认收起，不增加注册负担；边框加粗以突出 */}
                    <div
                      className="rounded-[14px] border-2 p-4"
                      style={{ borderColor: 'rgba(85,130,65,0.7)', background: 'rgba(240,245,237,0.55)' }}
                    >
                      <button
                        type="button"
                        onClick={() => setShowMentorHints((v) => !v)}
                        className="w-full flex items-center justify-between text-left"
                        aria-expanded={showMentorHints}
                      >
                        <span>
                          <span className="block text-[14px] font-semibold" style={{ color: '#435B3B' }}>
                            让导师分身更懂你（选填）
                          </span>
                          {!showMentorHints && (
                            <span className="block text-xs mt-0.5" style={{ color: '#7A9E6E' }}>
                              让它更快知道该怎么帮你，节约问答轮次
                            </span>
                          )}
                        </span>
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          className="shrink-0 transition-transform duration-200"
                          style={{ transform: showMentorHints ? 'rotate(180deg)' : 'none', color: '#7A9E6E' }}
                        >
                          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>

                      {showMentorHints && (
                        <div className="mt-4 space-y-4 animate-fade-in">
                          <div>
                            <p className="text-[13px] font-medium mb-1.5" style={{ color: C.ink }}>
                              在工作/找工作上，你目前碰到的最大焦虑是什么
                            </p>
                            <textarea
                              value={careerAnxiety}
                              onChange={(e) => onAnxietyChange(e.target.value)}
                              rows={3}
                              maxLength={100}
                              placeholder="比如：投简历没回音、不会谈薪资、入职适应困难……"
                              className={`${inputCls} resize-none text-[13px] leading-relaxed`}
                            />
                            {anxietyBlocked ? (
                              <p className="text-[11px] mt-1 text-red-500">内容含不文明用语，请修改后再保存</p>
                            ) : (
                              <p className="text-[11px] text-right mt-1" style={{ color: '#9C8E7C' }}>
                                {careerAnxiety.length}/100
                              </p>
                            )}
                          </div>

                          <div>
                            <p className="text-[13px] font-medium mb-1.5" style={{ color: C.ink }}>
                              你最希望在以下哪方面获得帮助（单选）
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {HELP_PRIORITY_OPTIONS.map((o) => {
                                const active = helpChoice === o.value;
                                return (
                                  <button
                                    key={o.value}
                                    type="button"
                                    onClick={() => toggleHelpChoice(o.value)}
                                    className="px-3 py-1.5 rounded-full text-[12.5px] transition-all active:scale-95"
                                    style={{
                                      background: active ? '#6B8E5E' : '#fff',
                                      color: active ? '#fff' : C.ink,
                                      border: `1.5px solid ${active ? '#6B8E5E' : 'rgba(123,155,94,0.4)'}`,
                                      fontWeight: active ? 600 : 400,
                                    }}
                                  >
                                    {o.label}
                                  </button>
                                );
                              })}
                              <button
                                type="button"
                                onClick={() => toggleHelpChoice(HELP_OTHER_VALUE)}
                                className="px-3 py-1.5 rounded-full text-[12.5px] transition-all active:scale-95"
                                style={{
                                  background: helpChoice === HELP_OTHER_VALUE ? '#6B8E5E' : '#fff',
                                  color: helpChoice === HELP_OTHER_VALUE ? '#fff' : C.ink,
                                  border: `1.5px solid ${helpChoice === HELP_OTHER_VALUE ? '#6B8E5E' : 'rgba(123,155,94,0.4)'}`,
                                  fontWeight: helpChoice === HELP_OTHER_VALUE ? 600 : 400,
                                }}
                              >
                                其他
                              </button>
                            </div>
                            {helpChoice === HELP_OTHER_VALUE && (
                              <div className="mt-2">
                                <input
                                  value={helpOther}
                                  onChange={(e) => onHelpOtherChange(e.target.value)}
                                  maxLength={20}
                                  placeholder="用一句话写下你希望获得的帮助（20 字以内）"
                                  className={`${inputCls} text-[13px]`}
                                />
                                {helpOtherBlocked ? (
                                  <p className="text-[11px] mt-1 text-red-500">内容含不文明用语，请修改后再保存</p>
                                ) : (
                                  <p className="text-[11px] text-right mt-1" style={{ color: '#9C8E7C' }}>
                                    {helpOther.length}/20
                                  </p>
                                )}
                              </div>
                            )}
                          </div>

                          <div>
                            <p className="text-[13px] font-medium mb-1.5" style={{ color: C.ink }}>
                              在现实生活中，如果有机会，你最想跟谁深聊工作/找工作上的事（多选）
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {MENTOR_PREFERENCE_OPTIONS.map((o) => {
                                const active = mentorPreference.includes(o.value);
                                return (
                                  <button
                                    key={o.value}
                                    type="button"
                                    onClick={() =>
                                      setMentorPreference((prev) =>
                                        prev.includes(o.value)
                                          ? prev.filter((x) => x !== o.value)
                                          : [...prev, o.value]
                                      )
                                    }
                                    className="px-3.5 py-1.5 rounded-full text-[12.5px] transition-all active:scale-95"
                                    style={{
                                      background: active ? '#6B8E5E' : '#fff',
                                      color: active ? '#fff' : C.ink,
                                      border: `1.5px solid ${active ? '#6B8E5E' : 'rgba(123,155,94,0.4)'}`,
                                      fontWeight: active ? 600 : 400,
                                    }}
                                  >
                                    {o.label}
                                  </button>
                                );
                              })}
                            </div>
                            {mentorPreference.includes('其他') && (
                              <div className="mt-2">
                                <input
                                  value={mentorPrefOther}
                                  onChange={(e) => onMentorPrefOtherChange(e.target.value)}
                                  maxLength={20}
                                  placeholder="用一句话写下你想深聊的人（20 字以内）"
                                  className={`${inputCls} text-[13px]`}
                                />
                                {mentorPrefOtherBlocked ? (
                                  <p className="text-[11px] mt-1 text-red-500">内容含不文明用语，请修改后再保存</p>
                                ) : (
                                  <p className="text-[11px] text-right mt-1" style={{ color: '#9C8E7C' }}>
                                    {mentorPrefOther.length}/20
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 选填：联系邮箱（折叠卡片，淡色样式以区别于上方重要卡片） */}
                    <div
                      className="rounded-[14px] border p-4 mt-3"
                      style={{ borderColor: 'rgba(123,155,94,0.35)', background: 'rgba(240,245,237,0.55)' }}
                    >
                      <button
                        type="button"
                        onClick={() => setShowContactEmail((v) => !v)}
                        className="w-full flex items-center justify-between text-left"
                        aria-expanded={showContactEmail}
                      >
                        <span>
                          <span className="block text-[14px] font-semibold" style={{ color: '#435B3B' }}>
                            你的 email 地址（选填）
                          </span>
                          {!showContactEmail && (
                            <span className="block text-xs mt-0.5" style={{ color: '#7A9E6E' }}>
                              如果我们有什么线下活动，我们可以发邮件联系到你
                            </span>
                          )}
                        </span>
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          className="shrink-0 transition-transform duration-200"
                          style={{ transform: showContactEmail ? 'rotate(180deg)' : 'none', color: '#7A9E6E' }}
                        >
                          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      {showContactEmail && (
                        <div className="mt-3">
                          <p className="text-xs mb-2" style={{ color: '#7A9E6E' }}>
                            如果我们有什么线下活动，我们可以发邮件联系到你
                          </p>
                          <input
                            type="email"
                            value={contactEmail}
                            onChange={(e) => {
                              const v = e.target.value;
                              setContactEmail(v);
                              if (!v.trim()) { setEmailErr(''); return; }
                              if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) setEmailErr('');
                              else setEmailErr('邮箱格式不正确');
                            }}
                            placeholder="you@example.com"
                            className={inputCls}
                          />
                          {emailErr && (
                            <p className="mt-1 text-xs text-red-500">{emailErr}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* 底部按钮 */}
              <div className="flex items-center gap-3 mt-7">
                {stepIdx > 0 ? (
                  <button
                    type="button"
                    onClick={goBack}
                    className="px-5 py-3 rounded-[10px] text-sm font-semibold transition-all active:scale-95"
                    style={{ color: C.body, background: 'rgba(90,107,126,0.08)' }}
                  >
                    上一步
                  </button>
                ) : isEdit ? (
                  <Link
                    href="/dashboard/profile"
                    className="px-5 py-3 rounded-[10px] text-sm font-semibold"
                    style={{ color: C.body }}
                  >
                    取消
                  </Link>
                ) : (
                  <Link
                    href="/login"
                    className="px-5 py-3 rounded-[10px] text-sm font-semibold"
                    style={{ color: C.body }}
                  >
                    去登录
                  </Link>
                )}
                {section !== 'locations' ? (
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={aiChecking}
                    className="flex-1 py-3 rounded-[10px] text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-60"
                    style={{ background: C.orange }}
                  >
                    {aiChecking ? '正在审核…' : '下一步'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting || aiChecking}
                    className="flex-1 py-3 rounded-[10px] text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-60"
                    style={{ background: C.orange }}
                  >
                    {aiChecking ? '正在审核…' : submitting ? (isEdit ? '保存中…' : '提交中…') : isEdit ? '保存修改' : '完成注册'}
                  </button>
                )}
              </div>
            </div>
          </>
        ) : isEdit ? (
          // ===== 编辑保存成功页 =====
          <div
            className="animate-fade-in rounded-[20px] p-6"
            style={{ background: 'rgba(255,255,255,0.9)', border: `1px solid ${C.cardLine}` }}
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
              style={{ background: 'rgba(245,166,35,0.14)' }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path
                  d="M20 6L9 17l-5-5"
                  stroke={C.orange}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2
              className="text-xl font-black mb-1"
              style={{ color: C.ink, fontFamily: '"Noto Serif SC", Georgia, serif' }}
            >
              保存成功
            </h2>
            <p className="text-sm mb-5" style={{ color: C.body }}>
              档案资料已经更新，和你聊职业的导师都会看到最新版本。
            </p>

            <Summary title="账号信息" rows={accountRows} />

            <Summary
              title={identity === 'student' ? '在校信息' : identity === 'jobless' ? '待业信息' : '在职信息'}
              rows={
                identity === 'student'
                  ? [
                      ['目前状态', '在校'],
                      ['入学年月', fmtMonth(enrollMonth)],
                      ['学校', school.trim()],
                      ['专业分类', majorLabel || ''],
                      ['毕业日期', fmtMonth(expectedGrad)],
                    ]
                  : [
                      ['目前状态', identityLabel],
                      ['最近打算', workGoalLabel || ''],
                      ['入学年月', fmtMonth(enrollMonth)],
                      ['学校', school.trim()],
                      ['专业分类', majorLabel || ''],
                      ['毕业日期', fmtMonth(gradMonth)],
                      ['全职', workExpLabel || '未选'],
                      ['兼职', partTimeExpLabel || '未选'],
                    ]
              }
            />

            <Summary title="方向与地点" rows={[
              ['希望工作地点', `${workProvince} · ${cityLabel(workCity)}`],
              ['目前所在地', `${currentProvince} · ${cityLabel(currentCity)}`],
              ['感兴趣的职业方向', careers.map((v) => CAREER_OPTIONS.find((o) => o.value === v)?.label).filter(Boolean).join('、')],
            ]} />

            {(() => {
              // “让导师分身更懂你”选填内容：三项全空则整块不显示
              const hintRows: [string, string][] = [];
              const anxietyText = careerAnxiety.trim();
              if (anxietyText) hintRows.push(['当前最大焦虑', anxietyText]);
              const helpText = helpChoice === HELP_OTHER_VALUE ? helpOther.trim() : (helpChoice || '');
              if (helpText) hintRows.push(['希望获得的帮助', helpText]);
              const mentorNames = mentorPreference
                .map((v) => v === '其他' ? (mentorPrefOther.trim() || '其他') : (MENTOR_PREFERENCE_OPTIONS.find((o) => o.value === v)?.label || v))
                .join('、');
              if (mentorNames) hintRows.push(['想深聊的人', mentorNames]);
              return hintRows.length > 0 ? <Summary title="让导师分身更懂你" rows={hintRows} /> : null;
            })()}

            {contactEmail.trim() && (
              <Summary title="联系邮箱" rows={[['Email', contactEmail.trim()]]} />
            )}

            <button
              type="button"
              onClick={() => router.push('/dashboard/profile')}
              className="w-full py-3 rounded-[10px] text-sm font-bold text-white mt-2"
              style={{ background: C.orange }}
            >
              返回我的档案
            </button>
          </div>
        ) : (
          // ===== 注册成功页：账号 + 档案 + 测评结果确认 =====
          <div
            className="animate-fade-in rounded-[20px] p-6"
            style={{ background: 'rgba(255,255,255,0.9)', border: `1px solid ${C.cardLine}` }}
          >
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
              style={{ background: 'rgba(245,166,35,0.14)' }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path
                  d="M20 6L9 17l-5-5"
                  stroke={C.orange}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2
              className="text-xl font-black mb-1"
              style={{ color: C.ink, fontFamily: '"Noto Serif SC", Georgia, serif' }}
            >
              注册完成
            </h2>
            <p className="text-sm mb-5" style={{ color: C.body }}>
              账号和个人档案都建好了{savedAssessment ? '，职业兴趣测试结果也一并存进了档案' : ''}。
            </p>

            {autoLoginFailed && (
              <div
                className="text-[13px] px-4 py-3 rounded-[10px] mb-4"
                style={{ background: '#FBEDE8', color: C.danger, border: '1px solid rgba(192,101,74,0.25)' }}
              >
                账号已建好，但自动登录没成功，请
                <Link href="/login" className="font-semibold underline">
                  前往登录
                </Link>
                。
              </div>
            )}

            {savedAssessment && <AssessmentSummary assessment={savedAssessment} />}

            <Summary title="账号信息" rows={accountRows} />

            <Summary
              title={identity === 'student' ? '在校信息' : identity === 'jobless' ? '待业信息' : '在职信息'}
              rows={
                identity === 'student'
                  ? [
                      ['目前状态', '在校'],
                      ['入学年月', fmtMonth(enrollMonth)],
                      ['学校', school.trim()],
                      ['专业分类', majorLabel || ''],
                      ['毕业日期', fmtMonth(expectedGrad)],
                    ]
                  : [
                      ['目前状态', identityLabel],
                      ['最近打算', workGoalLabel || ''],
                      ['入学年月', fmtMonth(enrollMonth)],
                      ['学校', school.trim()],
                      ['专业分类', majorLabel || ''],
                      ['毕业日期', fmtMonth(gradMonth)],
                      ['全职', workExpLabel || '未选'],
                      ['兼职', partTimeExpLabel || '未选'],
                    ]
              }
            />

            <Summary title="方向与地点" rows={[
              ['希望工作地点', `${workProvince} · ${cityLabel(workCity)}`],
              ['目前所在地', `${currentProvince} · ${cityLabel(currentCity)}`],
              ['感兴趣的职业方向', careers.map((v) => CAREER_OPTIONS.find((o) => o.value === v)?.label).filter(Boolean).join('、')],
            ]} />

            {contactEmail.trim() && (
              <Summary title="联系邮箱" rows={[['Email', contactEmail.trim()]]} />
            )}

            <div className="flex gap-3 mt-6">
              <Link
                href="/"
                className="flex-1 py-3 rounded-[10px] text-sm font-semibold text-center"
                style={{ color: C.body, background: 'rgba(90,107,126,0.08)' }}
              >
                先回首页
              </Link>
              <Link
                href="/dashboard/profile"
                className="flex-1 py-3 rounded-[10px] text-sm font-bold text-white text-center"
                style={{ background: C.orange }}
              >
                修改档案资料
              </Link>
            </div>
          </div>
        )}
      </main>

      {/* 编辑档案的三个页面（基本信息 / 方向与地点 / 保存成功）底部统一灰蓝页脚，与对话记录等页一致 */}
      {isEdit && <HomeFooter lang="zh" />}

      {/* 自定义年月选择弹层：清除 / 取消 / 确认 */}
      {monthSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in"
          onClick={() => setMonthSheet(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-2xl flex flex-col max-h-[72vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-4 py-3.5 border-b"
              style={{ borderColor: '#E8B5B5' }}
            >
              <span className="text-sm font-semibold" style={{ color: C.ink }}>
                {MONTH_FIELDS[monthSheet].title}
              </span>
              <button type="button" onClick={() => setMonthSheet(null)} className="text-sm" style={{ color: C.body }}>
                关闭
              </button>
            </div>

            <div className="overflow-y-auto px-4">
              {/* 年份横向选择 */}
              <div className="flex gap-2 overflow-x-auto py-3" style={{ scrollbarWidth: 'none' }}>
                {Array.from(
                  { length: MONTH_FIELDS[monthSheet].maxY - MONTH_FIELDS[monthSheet].minY + 1 },
                  (_, i) => MONTH_FIELDS[monthSheet].maxY - i
                ).map((y) => {
                  const active = draftYear === y;
                  return (
                    <button
                      key={y}
                      type="button"
                      ref={y === draftYear ? draftYearRef : undefined}
                      onClick={() => setDraftYear(y)}
                      className="shrink-0 px-3.5 py-1.5 rounded-full text-sm border transition-all"
                      style={{
                        background: active ? C.orange : '#fff',
                        color: active ? '#fff' : C.ink,
                        borderColor: active ? C.orange : '#E8DCCB',
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {y} 年
                    </button>
                  );
                })}
              </div>

              {/* 月份 4 × 3 */}
              <div className="grid grid-cols-4 gap-2 pb-4">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                  const active = draftMonth === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDraftMonth(m)}
                      className="py-2.5 rounded-[10px] text-sm border transition-all"
                      style={{
                        background: active ? C.orange : '#fff',
                        color: active ? '#fff' : C.ink,
                        borderColor: active ? C.orange : '#E8DCCB',
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {m} 月
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              className="flex items-center gap-3 px-4 py-3 border-t"
              style={{ borderColor: '#E8B5B5', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
            >
              <button
                type="button"
                onClick={clearMonth}
                className="px-4 py-3 rounded-[10px] text-sm font-semibold"
                style={{ color: C.danger, background: 'rgba(192,101,74,0.08)' }}
              >
                清除
              </button>
              <button
                type="button"
                onClick={() => setMonthSheet(null)}
                className="px-4 py-3 rounded-[10px] text-sm font-semibold"
                style={{ color: C.body, background: 'rgba(90,107,126,0.08)' }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmMonth}
                disabled={!draftYear || !draftMonth}
                className="flex-1 py-3 rounded-[10px] text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-40"
                style={{ background: C.orange }}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MonthTrigger({
  value,
  placeholder,
  disabled,
  onClick,
}: {
  value: string;
  placeholder: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left bg-[#FCF2F0] border-2 border-[#E8B5B5] rounded-[10px] px-4 py-3 text-[15px] flex items-center justify-between transition-all disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:border-[#F5A623] focus:ring-2 focus:ring-[#F5A623]/20"
      style={{ color: value ? '#2C3E5C' : '#B6A89C' }}
    >
      <span>{value ? fmtMonth(value) : placeholder}</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5A6B7E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 ml-2">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    </button>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-1.5" style={{ color: '#2C3E5C' }}>
        {label}
        {required && <span className="ml-0.5" style={{ color: '#C0654A' }}>*</span>}
        {hint && <span className="font-normal text-xs ml-1.5" style={{ color: '#9C8E7C' }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Summary({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="mb-5">
      <h3
        className="text-sm font-bold mb-2 pb-1.5 border-b"
        style={{ color: '#2C3E5C', borderColor: 'rgba(216,210,197,0.7)' }}
      >
        {title}
      </h3>
      <dl className="space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-4 text-[13px] leading-relaxed">
            <dt className="shrink-0 whitespace-nowrap" style={{ color: '#9C8E7C', width: 108 }}>
              {k}
            </dt>
            <dd className="flex-1" style={{ color: '#2C3E5C' }}>
              {v || '—'}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
