'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CAREER_OPTIONS } from '@/lib/register-options';

interface RecommendedMentorsProfile {
  status?: string | null;
  careers?: string | null;
  customCareerDirections?: string | null;
  careerAnxiety?: string | null;
  helpPriority?: string | null;
  mentorPreference?: string | null;
}

interface MentorHit {
  id: string;
  name: string;
  title: string;
  avatar: string;
  tagline: string;
}

function parseJsonArray(str: string | null | undefined): string[] {
  if (!str) return [];
  try {
    const arr = JSON.parse(str);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// 档案/注册向导里存的是英文 value，导师库 tags/头衔是中文，
// 搜索前必须把 value 映射成中文 label，否则关键词几乎匹配不到导师。
const CAREER_LABELS: Record<string, string> = Object.fromEntries(
  CAREER_OPTIONS.map((o) => [o.value, o.label])
);

// mentorPreference 里的纯社交关系对“职业方向匹配”没有区分度，不进搜索词
const NON_PROFESSIONAL_PREFS = new Set(['家人', '好友', '朋友', '同学', '其他']);

function toLabel(values: string[], map: Record<string, string>): string[] {
  return values.map((v) => map[v] || v);
}

/**
 * 推荐导师：根据档案关键词匹配已上线导师。
 * 由调用方传入档案字段；未做测评时可显示引导提示。
 */
export function RecommendedMentors({
  profile,
  showAssessmentHint = false,
  surface = 'card',
}: {
  profile: RecommendedMentorsProfile | null;
  showAssessmentHint?: boolean;
  /** card=旧版毛玻璃白卡（浅底页面）；paper=暖白信纸（深展台页面） */
  surface?: 'card' | 'paper';
}) {
  const [mentors, setMentors] = useState<MentorHit[]>([]);
  const [loaded, setLoaded] = useState(false);

  // 推荐理由（自然语言拼接）
  const reason = (() => {
    if (!profile) return '';
    const parts: string[] = [];
    // 兼容中文（档案库存值）与英文枚举（注册向导内存值）
    const statusMap: Record<string, string> = {
      '在校': '在校生',
      '在职': '在职',
      '待业': '待业中',
      student: '在校生',
      working: '在职',
      jobless: '待业中',
    };
    const status = statusMap[profile.status || ''] || '';
    if (status) parts.push(`你目前是${status}，`);

    const careers = parseJsonArray(profile.careers);
    if (careers.length > 0) {
      const careerMap: Record<string, string> = {};
      CAREER_OPTIONS.forEach((o) => {
        careerMap[o.value] = o.label;
      });
      const labels = careers
        .map((c) => careerMap[c] || c)
        .filter(Boolean);
      if (labels.length > 0) parts.push(`对${labels.join('、')}方向感兴趣，`);
    }

    const customCareers = parseJsonArray(profile.customCareerDirections);
    if (customCareers.length > 0) {
      parts.push(`也关注${customCareers.join('、')}，`);
    }

    if (profile.careerAnxiety?.trim()) {
      parts.push(`当前困惑：${profile.careerAnxiety.trim()}。`);
    }

    if (parts.length === 0) return '';
    return parts.join('') + '根据你的情况，为你找到以下导师分身，快去聊聊吧。';
  })();

  useEffect(() => {
    if (!profile) return;

    // 关键：value 要先转成中文 label 再拿去匹配中文导师库
    const careers = toLabel(parseJsonArray(profile.careers), CAREER_LABELS);
    const customCareers = parseJsonArray(profile.customCareerDirections);
    const helpPriority = parseJsonArray(profile.helpPriority);
    const mentorPref = parseJsonArray(profile.mentorPreference).filter(
      (v) => v && !NON_PROFESSIONAL_PREFS.has(v)
    );

    const query = [
      ...careers,
      ...customCareers,
      ...helpPriority,
      ...mentorPref,
      profile.careerAnxiety,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    if (!query) {
      setLoaded(true);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    fetch(`/api/search/mentors?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then(async (r) => {
        // 未登录会被中间件重定向到登录页（返回 HTML），不能当 JSON 解析
        if (!r.ok || (r.headers.get('content-type') || '').includes('text/html')) {
          throw new Error('unavailable');
        }
        return r.json();
      })
      .then((data: { hits?: MentorHit[] }) => {
        setMentors((data.hits ?? []).slice(0, 2));
      })
      .catch(() => {
        // 网络/鉴权/超时失败：保持空导师列表，但模块仍展示（含测评提示与去挑选入口）
        setMentors([]);
      })
      .finally(() => {
        clearTimeout(timer);
        setLoaded(true);
      });

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [profile]);

  if (!loaded) return null;

  return (
    <div className={surface === 'paper' ? 'letter-paper mb-4 rounded-[20px] p-5 md:p-6' : 'card mb-4'}>
      <h2 className="mb-3 border-b border-rule/40 pb-2 text-sm font-semibold text-ink">
        推荐导师
      </h2>
      {mentors.length > 0 ? (
        <>
          {reason && (
            <p className="mb-3 text-xs leading-relaxed text-muted">{reason}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {mentors.map((m) => (
              <Link
                key={m.id}
                href={`/mentors/${m.id}`}
                className="flex items-center gap-3 rounded-xl border border-rule/50 bg-white/60 p-3 transition-all hover:border-brand-300 hover:bg-brand-50/30"
              >
                {m.avatar && (
                  <img
                    src={m.avatar}
                    alt={m.name}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">
                    {m.name}
                  </p>
                  <p className="text-xs text-muted truncate">{m.title}</p>
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-muted mb-3">
            暂没找到合适导师，可去行业导师页面自行挑选
          </p>
          <Link
            href="/mentors"
            className="inline-flex items-center rounded-[10px] bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-600"
          >
            去行业导师 →
          </Link>
        </div>
      )}

      {showAssessmentHint && (
        <div
          className="mt-4 rounded-[14px] p-4"
          style={{ background: 'rgba(122,158,110,0.08)', border: '1px solid rgba(122,158,110,0.25)' }}
        >
          <p className="text-sm font-semibold" style={{ color: '#2C3E5C' }}>
            完成职业兴趣测试，导师分身匹配更精准
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            测一测霍兰德六维兴趣代码，结果会存进档案，帮导师更快懂你。
          </p>
          <Link
            href="/assessment"
            className="mt-3 inline-flex items-center rounded-[10px] bg-sage-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-sage-600"
          >
            做职业兴趣测试 →
          </Link>
        </div>
      )}
    </div>
  );
}
