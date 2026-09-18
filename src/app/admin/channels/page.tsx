'use client';

/**
 * 渠道管理后台（仅 role=ADMIN 可见数据；未授权时接口返回 403）
 * 新建渠道、生成/下载二维码、查看注册与付费统计、导出对账 CSV、启用/停用。
 */
import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/components/header';

interface ChannelStat {
  registrations: number;
  paidUsers: number;
  revenue: number;
  lastPaidAt: string | null;
}

interface Channel {
  id: string;
  code: string;
  name: string;
  partner: string | null;
  shareRate: number | null;
  status: string;
  landingPath: string | null;
  note: string | null;
  createdAt: string;
  stats: ChannelStat;
}

const emptyForm = {
  code: '',
  name: '',
  partner: '',
  shareRate: '',
  landingPath: '/',
  note: '',
};

export default function AdminChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/channels', { cache: 'no-store' });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');
      setChannels(data.channels);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createChannel() {
    if (!form.code.trim() || !form.name.trim()) {
      setError('渠道码和名称必填');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/admin/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          shareRate: form.shareRate === '' ? null : Number(form.shareRate),
          partner: form.partner || null,
          note: form.note || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '创建失败');
      setForm(emptyForm);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setCreating(false);
    }
  }

  async function patchChannel(code: string, patch: Record<string, unknown>) {
    setError('');
    const res = await fetch(`/api/admin/channels/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || '保存失败');
      return;
    }
    await load();
  }

  function copyLink(code: string) {
    const url = `${window.location.origin}/r/${code}`;
    navigator.clipboard?.writeText(url).then(
      () => setError(''),
      () => setError('复制失败，请手动选择链接复制'),
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F3EE] text-[#2B2A28]">
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="font-serif text-2xl font-bold">渠道管理</h1>
        <p className="mt-1 text-sm text-stone-500">
          二维码链接指向 /r/渠道码，用户首次扫码锁定，注册时自动归因；停用后的旧链接按自然量处理。
        </p>

        {/* 新建渠道 */}
        <section className="mt-5 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">新建渠道</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="text-sm">
              渠道码*
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="如 xhs_lydia01"
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="text-sm">
              渠道名称*
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如 小红书-Lydia 9月"
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              合作方/分成归属
              <input
                value={form.partner}
                onChange={(e) => setForm({ ...form, partner: e.target.value })}
                placeholder="如 Lydia"
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              分成比例 %（可后补）
              <input
                type="number"
                min={0}
                max={100}
                value={form.shareRate}
                onChange={(e) => setForm({ ...form, shareRate: e.target.value })}
                placeholder="0-100"
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              扫码落地路径
              <input
                value={form.landingPath}
                onChange={(e) => setForm({ ...form, landingPath: e.target.value })}
                placeholder="/"
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="text-sm">
              备注
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <button
            onClick={createChannel}
            disabled={creating}
            className="mt-3 rounded-lg bg-[#C9563F] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {creating ? '创建中…' : '创建渠道'}
          </button>
        </section>

        {error && <p className="mt-3 text-sm text-[#C9563F]">{error}</p>}
        {forbidden && (
          <p className="mt-10 text-center text-stone-500">无权访问，仅管理员可查看本页。</p>
        )}
        {loading && <p className="mt-6 text-stone-500">加载中…</p>}

        {/* 渠道列表 */}
        {!forbidden && !loading && (
          <section className="mt-6 space-y-4">
            {channels.length === 0 && <p className="text-stone-500">还没有渠道，先在上面创建一个。</p>}
            {channels.map((ch) => (
              <ChannelRow
                key={ch.id}
                channel={ch}
                editing={editingCode === ch.code}
                onToggleEdit={() => setEditingCode(editingCode === ch.code ? null : ch.code)}
                onPatch={patchChannel}
                onCopy={copyLink}
              />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

function ChannelRow({
  channel,
  editing,
  onToggleEdit,
  onPatch,
  onCopy,
}: {
  channel: Channel;
  editing: boolean;
  onToggleEdit: () => void;
  onPatch: (code: string, patch: Record<string, unknown>) => Promise<void>;
  onCopy: (code: string) => void;
}) {
  const [draft, setDraft] = useState({
    name: channel.name,
    partner: channel.partner ?? '',
    shareRate: channel.shareRate?.toString() ?? '',
    landingPath: channel.landingPath ?? '/',
    note: channel.note ?? '',
  });

  useEffect(() => {
    setDraft({
      name: channel.name,
      partner: channel.partner ?? '',
      shareRate: channel.shareRate?.toString() ?? '',
      landingPath: channel.landingPath ?? '/',
      note: channel.note ?? '',
    });
  }, [channel]);

  const active = channel.status === 'ACTIVE';

  return (
    <article className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-semibold">{channel.code}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                active ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-200 text-stone-500'
              }`}
            >
              {active ? '启用中' : '已停用'}
            </span>
          </div>
          <p className="mt-1 text-sm text-stone-700">{channel.name}</p>
          <p className="text-xs text-stone-400">
            合作方：{channel.partner || '—'}　分成：
            {channel.shareRate != null ? `${channel.shareRate}%` : '未设置'}　落地：
            {channel.landingPath || '/'}
          </p>
        </div>
        <div className="text-right text-sm">
          <p>
            注册 <b>{channel.stats.registrations}</b> 人 · 付费 <b>{channel.stats.paidUsers}</b>{' '}
            人
          </p>
          <p className="text-[#C9563F]">收入 ￥{channel.stats.revenue.toFixed(2)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/admin/channels/${encodeURIComponent(channel.code)}/qrcode`}
          alt={`${channel.code} 二维码`}
          width={96}
          height={96}
          className="h-24 w-24 rounded-lg border border-stone-200 bg-white p-1"
        />
        <div className="flex flex-col gap-2 text-sm">
          <button
            onClick={() => onCopy(channel.code)}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-left"
            title={`${typeof window !== 'undefined' ? window.location.origin : ''}/r/${channel.code}`}
          >
            复制推广链接
          </button>
          <a
            href={`/api/admin/channels/${encodeURIComponent(channel.code)}/qrcode`}
            download={`qr-${channel.code}.png`}
            className="rounded-lg border border-stone-300 px-3 py-1.5"
          >
            下载二维码
          </a>
          <a
            href={`/api/admin/channels/${encodeURIComponent(channel.code)}/export`}
            className="rounded-lg border border-stone-300 px-3 py-1.5"
          >
            导出用户 CSV
          </a>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={onToggleEdit} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm">
            {editing ? '收起编辑' : '编辑'}
          </button>
          <button
            onClick={() => onPatch(channel.code, { status: active ? 'DISABLED' : 'ACTIVE' })}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
          >
            {active ? '停用' : '启用'}
          </button>
        </div>
      </div>

      {editing && (
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-stone-100 pt-3 md:grid-cols-3">
          <label className="text-sm">
            名称
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            合作方
            <input
              value={draft.partner}
              onChange={(e) => setDraft({ ...draft, partner: e.target.value })}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            分成比例 %
            <input
              type="number"
              min={0}
              max={100}
              value={draft.shareRate}
              onChange={(e) => setDraft({ ...draft, shareRate: e.target.value })}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            落地路径
            <input
              value={draft.landingPath}
              onChange={(e) => setDraft({ ...draft, landingPath: e.target.value })}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm"
            />
          </label>
          <label className="text-sm md:col-span-2">
            备注
            <input
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex items-end">
            <button
              onClick={() =>
                onPatch(channel.code, {
                  name: draft.name,
                  partner: draft.partner || null,
                  shareRate: draft.shareRate === '' ? null : Number(draft.shareRate),
                  landingPath: draft.landingPath,
                  note: draft.note || null,
                })
              }
              className="rounded-lg bg-[#4A6670] px-4 py-2 text-sm text-white"
            >
              保存修改
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
