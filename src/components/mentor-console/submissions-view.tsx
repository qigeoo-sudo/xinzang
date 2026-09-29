'use client';

/**
 * 我的提交：资料修改（头像/标签/简介）+ 内容纠错/补充 + 历史提交记录。
 * 资料修改需走审核流程：提交后状态 PENDING，审核通过后生效。
 */
import { useEffect, useState } from 'react';
import { useApi, isDemoMode } from './use-api';
import { ViewState } from './stat-card';

interface Submission {
  id: string;
  submissionType: string;
  fieldLabel: string | null;
  afterValue: string;
  status: string;
  reviewNote: string | null;
  submittedAt: string;
  publishedAt: string | null;
}
interface ListResponse {
  submissions: Submission[];
}
interface ProfileResponse {
  mentorName: string;
  tags: string[];
  intro: string;
  avatar: string;
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  PENDING: { label: '待审核', cls: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: '已审核', cls: 'bg-stone-100 text-stone-700' },
  APPROVED_PENDING_RELEASE: { label: '待发布', cls: 'bg-sky-100 text-sky-800' },
  PUBLISHED: { label: '已发布', cls: 'bg-emerald-100 text-emerald-800' },
  REJECTED: { label: '已退回', cls: 'bg-red-100 text-red-700' },
};

const TYPE_LABEL: Record<string, string> = {
  PROFILE_EDIT: '资料修改',
  CONTENT_CORRECTION: '内容纠错',
  CONTENT_SUPPLEMENT: '内容补充',
};

const FIELD_LABEL: Record<string, string> = {
  avatar: '头像',
  tags: '对外关键词标签',
  intro: '对外简介',
};

/** 统一 POST 提交 */
async function submitEntry(body: object): Promise<void> {
  const res = await fetch('/api/mentor/submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? '提交失败');
}

/** 压缩头像：限制最大边 512px，JPEG 质量递减直到 base64 ≤ 500KB（约 375KB 原图） */
async function compressAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件');
  }
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });

  // 用 Image 解码
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('图片解析失败'));
    el.src = dataUrl;
  });

  // 限制最大边
  const MAX = 512;
  let { width, height } = img;
  if (width > MAX || height > MAX) {
    const ratio = Math.min(MAX / width, MAX / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 不可用');
  ctx.drawImage(img, 0, 0, width, height);

  // JPEG 质量递减
  const MAX_BASE64 = 500 * 1024;
  let quality = 0.85;
  let out = canvas.toDataURL('image/jpeg', quality);
  while (out.length > MAX_BASE64 && quality > 0.3) {
    quality -= 0.1;
    out = canvas.toDataURL('image/jpeg', quality);
  }
  if (out.length > MAX_BASE64) {
    throw new Error('图片过大，压缩后仍超限，请换一张更小的图片');
  }
  return out;
}

export function SubmissionsView() {
  const profile = useApi<ProfileResponse>('/api/mentor/profile');
  const list = useApi<ListResponse>('/api/mentor/submissions');

  if (list.loading && !list.data) return <ViewState loading />;
  if (list.error) return <ViewState error={list.error} />;

  /** 本地 mock 一条 PENDING 提交记录，插入 list 开头。
   *  demo 模式下 list 走静态 JSON 不会被真实 POST 更新，所以提交成功后由前端补一条记录让用户看到反馈。
   *  真实模式下也会先 mock，紧跟着 list.reload() 会用真实数据覆盖。 */
  const mockInsert = (field: 'avatar' | 'tags' | 'intro', afterValue: string) => {
    const now = new Date().toISOString();
    const rec: Submission = {
      id: `local-${Date.now()}`,
      submissionType: 'PROFILE_EDIT',
      fieldLabel: FIELD_LABEL[field] ?? field,
      afterValue: field === 'avatar' ? '(头像图片)' : afterValue,
      status: 'PENDING',
      reviewNote: null,
      submittedAt: now,
      publishedAt: null,
    };
    const prev = list.data?.submissions ?? [];
    list.setData({ submissions: [rec, ...prev] });
  };

  return (
    <div className="space-y-4">
      <ProfileEditCard
        profile={profile.data}
        onSubmitted={() => list.reload()}
        onMockInsert={mockInsert}
      />
      {/* 内容纠错/补充 暂时隐藏，后续恢复时取消注释即可
      <ContentFeedbackCard onSubmitted={() => list.reload()} />
      */}

      {/* 提交记录 */}
      <div className="rounded-2xl border-t-2 border-t-sky-300 bg-gradient-to-br from-sky-50 to-cyan-50 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
        <p className="text-sm font-medium text-stone-800">提交记录</p>
        <div className="mt-3 divide-y divide-stone-100">
          {list.data?.submissions.length === 0 && (
            <p className="py-6 text-center text-xs text-stone-400">还没有提交记录</p>
          )}
          {list.data?.submissions.map((s) => {
            const st = STATUS_MAP[s.status] ?? { label: s.status, cls: 'bg-stone-100' };
            return (
              <div key={s.id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-stone-500">
                    {TYPE_LABEL[s.submissionType] ?? s.submissionType}
                    {s.fieldLabel ? ` · ${s.fieldLabel}` : ''}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${st.cls}`}>
                    {st.label}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-stone-700">
                  {s.afterValue}
                </p>
                {s.reviewNote && (
                  <p className="mt-1 text-xs leading-5 text-stone-400">审核备注：{s.reviewNote}</p>
                )}
                <p className="mt-1 text-[11px] text-stone-400">
                  {s.submittedAt.slice(0, 10)} 提交
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 资料修改卡：头像 / 标签 / 简介 三段 */
function ProfileEditCard({
  profile,
  onSubmitted,
  onMockInsert,
}: {
  profile: ProfileResponse | null;
  onSubmitted: () => void;
  onMockInsert: (field: 'avatar' | 'tags' | 'intro', afterValue: string) => void;
}) {
  const [intro, setIntro] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [avatarBase64, setAvatarBase64] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const [avatarSaved, setAvatarSaved] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [submitting, setSubmitting] = useState<null | 'avatar' | 'tags' | 'intro'>(null);
  const [error, setError] = useState('');
  const [lastSaved, setLastSaved] = useState('');

  // profile 加载后同步本地初值（仅一次）
  useEffect(() => {
    if (!initialized && profile) {
      setTags(profile.tags ?? []);
      setIntro(profile.intro ?? '');
      setInitialized(true);
    }
  }, [profile, initialized]);

  const submit = async (field: 'avatar' | 'tags' | 'intro', afterValue: string) => {
    setSubmitting(field);
    setError('');
    // demo 模式：list 走静态 JSON 不会被真实 POST 更新，直接本地 mock 一条 PENDING 记录
    if (isDemoMode('/api/mentor/submissions')) {
      onMockInsert(field, afterValue);
      setSubmitting(null);
      return;
    }
    try {
      await submitEntry({ submissionType: 'PROFILE_EDIT', field, afterValue });
      // 先本地 mock 让列表立即反馈，紧跟着 reload 会用真实数据覆盖
      onMockInsert(field, afterValue);
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* 头像 */}
      <div className="rounded-2xl border-t-2 border-t-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
        <p className="text-sm font-medium text-stone-800">头像</p>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-16 w-16 overflow-hidden rounded-full bg-stone-100 ring-1 ring-stone-200">
            {avatarBase64 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarBase64} alt="新头像预览" className="h-full w-full object-cover" />
            ) : profile?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar} alt="当前头像" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <label className="cursor-pointer rounded-lg bg-white px-3 py-1.5 text-xs text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50">
            {avatarBusy ? '压缩中…' : '选择图片'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setAvatarBusy(true);
                setAvatarError('');
                setAvatarSaved(false);
                try {
                  const compressed = await compressAvatar(f);
                  setAvatarBase64(compressed);
                } catch (err) {
                  setAvatarError(err instanceof Error ? err.message : '图片处理失败');
                  setAvatarBase64('');
                } finally {
                  setAvatarBusy(false);
                  // 重置 input 以便重新选择同一文件
                  e.target.value = '';
                }
              }}
            />
          </label>
          <button
            disabled={!avatarBase64 || submitting !== null || avatarBusy}
            onClick={async () => {
              if (!avatarBase64) return;
              // 头像走和 submit 同样的逻辑：demo 模式本地 mock，真实模式 POST + reload
              await submit('avatar', avatarBase64);
            }}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white disabled:bg-stone-300"
          >
            {submitting === 'avatar' ? '提交中…' : '提交审核'}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-stone-400">
          支持 JPG/PNG，会自动压缩到 512px 内、≤375KB；头像修改需审核后生效
        </p>
        {avatarError && (
          <p className="mt-2 text-xs text-red-500">{avatarError}</p>
        )}
      </div>

      {/* 标签 */}
      <div className="rounded-2xl border-t-2 border-t-indigo-300 bg-gradient-to-br from-indigo-50 to-violet-50 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-stone-800">对外关键词标签</p>
          <span className="text-[11px] text-stone-400">长按拖动排序</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((t, i) => (
            <span
              key={`${t}-${i}`}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragIndex !== null && dragIndex !== i) {
                  // 实时交换位置形成跟手效果
                  const next = [...tags];
                  const [moved] = next.splice(dragIndex, 1);
                  next.splice(i, 0, moved);
                  setTags(next);
                  setDragIndex(i);
                }
              }}
              onDragEnd={() => setDragIndex(null)}
              className={`inline-flex cursor-grab items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-stone-700 ring-1 ring-stone-200 transition-opacity active:cursor-grabbing ${
                dragIndex === i ? 'opacity-50' : 'opacity-100'
              }`}
            >
              <span className="select-none">{t}</span>
              <button
                onClick={() => setTags(tags.filter((_, j) => j !== i))}
                className="text-stone-400 hover:text-red-500"
                aria-label={`移除 ${t}`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && tagInput.trim()) {
                e.preventDefault();
                setTags([...tags, tagInput.trim()]);
                setTagInput('');
              }
            }}
            placeholder="按回车添加"
            className="min-w-[80px] flex-1 rounded-full bg-white px-2.5 py-1 text-xs ring-1 ring-stone-200"
          />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            disabled={tags.length === 0 || submitting !== null}
            onClick={() => submit('tags', tags.join('|'))}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white disabled:bg-stone-300"
          >
            {submitting === 'tags' ? '提交中…' : '提交审核'}
          </button>
        </div>
      </div>

      {/* 简介 */}
      <div className="rounded-2xl border-t-2 border-t-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
        <p className="text-sm font-medium text-stone-800">对外简介</p>
        <textarea
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          placeholder={profile?.intro ?? '请输入对外简介'}
          rows={4}
          maxLength={500}
          className="mt-3 w-full rounded-lg bg-white px-3 py-2 text-sm leading-6 text-stone-700 ring-1 ring-stone-200"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-stone-400">{intro.length} / 500</span>
          <button
            disabled={!intro.trim() || intro.length > 500 || submitting !== null}
            onClick={() => submit('intro', intro.trim())}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs text-white disabled:bg-stone-300"
          >
            {submitting === 'intro' ? '提交中…' : '提交审核'}
          </button>
        </div>
      </div>

      {/* 提示：失败信息保留在卡片内，成功反馈直接进入下方"提交记录"列表 */}
      {error && <p className="px-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

/** 内容纠错 / 补充卡 */
function ContentFeedbackCard({ onSubmitted }: { onSubmitted: () => void }) {
  const [type, setType] = useState<'CONTENT_SUPPLEMENT' | 'CONTENT_CORRECTION'>('CONTENT_SUPPLEMENT');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [lastSubmitted, setLastSubmitted] = useState(false);

  const submit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await submitEntry({ submissionType: type, afterValue: content.trim() });
      setContent('');
      setLastSubmitted(true);
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border-t-2 border-t-rose-300 bg-gradient-to-br from-rose-50 to-pink-50 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
      <p className="text-sm font-medium text-stone-800">内容纠错 / 补充</p>
      <div className="mt-3 flex gap-0.5 rounded-lg bg-stone-100 p-0.5">
        {(['CONTENT_SUPPLEMENT', 'CONTENT_CORRECTION'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`rounded px-2 py-1 text-xs transition-colors ${
              type === t ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-400'
            }`}
          >
            {t === 'CONTENT_SUPPLEMENT' ? '内容补充' : '内容纠错'}
          </button>
        ))}
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder="描述需要补充或纠正的具体内容…"
        className="mt-3 w-full rounded-lg bg-white px-3 py-2 text-sm leading-6 text-stone-700 ring-1 ring-stone-200"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-stone-400">{content.length} / 2000</span>
        <button
          disabled={!content.trim() || content.length > 2000 || submitting}
          onClick={submit}
          className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs text-white disabled:bg-stone-300"
        >
          {submitting ? '提交中…' : '提交'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      {lastSubmitted && !error && (
        <p className="mt-2 text-xs text-emerald-600">已提交，等待审核</p>
      )}
    </div>
  );
}
