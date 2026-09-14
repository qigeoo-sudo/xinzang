import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Header } from '@/components/header';
import { HomeFooter } from '@/components/home/home-footer';

export const metadata = {
  title: '购买Q&A - AI Career Companion',
};

interface QA {
  q: string;
  a: string[];
}

interface Section {
  id: string;
  title: string;
  items: QA[];
}

// 内容与实际计费逻辑保持一致：
// - 套餐见 src/lib/plans.ts（月60/季180/年720，日限15/16/17）
// - 扣减顺序与升级接续见 src/app/api/chat/route.ts、src/lib/payment-fulfillment.ts
const SECTIONS: Section[] = [
  {
    id: 'plans',
    title: '一、会员套餐',
    items: [
      {
        q: '月度、季度、年度会员分别是什么？',
        a: [
          '月度会员 ￥29.9/月，含 60 轮次导师分身对话，每日最高 15 轮次，解锁全部已上线导师分身。',
          '季度会员 ￥79.9/季，含 180 轮次，每日最高 16 轮次，另可优先体验新功能。',
          '年度会员 ￥269.9/年，含 720 轮次，每日最高 17 轮次，享优先体验新功能、优先开放新导师分身、优先参与线下活动等权益。年度会员价格长期不变，没有续费折扣。',
        ],
      },
      {
        q: '月度、季度、年度之间如何升级？',
        a: [
          '可以买更高档的套餐：月→季、月→年、季→年。支付成功后新套餐权益立即生效，不用等当前套餐到期。',
          '到期时间不是从购买当天重新算，而是在原到期日上接续。例如月卡 9/14→10/14，9/14 当天升级季卡，到期日变为次年 1/14。按自然月对日计算，遇月末（如 1/31）自动落到目标月最后一天（2/28）。',
          '已用掉的轮次不清零，只是上限抬高。例如月卡已用 30 轮时升级季卡，季卡周期池内还剩 180−30=150 轮。',
          '同级重复购买（如月卡再买月卡、季卡再买季卡）和向下降级不允许；年度会员可以续费年度，续费后到期日在原到期日上再加一年。',
        ],
      },
      {
        q: '会员到期后没有及时续，之后再买怎么算？',
        a: [
          '到期后原订阅失效，再次购买会生成一段全新订阅：从支付成功当天起算，周期轮次从 0 开始重新计数。',
        ],
      },
    ],
  },
  {
    id: 'quota',
    title: '二、轮次与每日上限',
    items: [
      {
        q: '一轮对话怎么计算？',
        a: [
          '你发送一条消息、导师分身回复一条，合计算 1 轮。轮次只统计与导师分身的对话，和首页 AI 向导的对话不计入。',
        ],
      },
      {
        q: '总轮次按什么周期计算？',
        a: [
          '月卡 60 轮、季卡 180 轮、年卡 720 轮，均在当前订阅生效期内累计。会员有效期内升级时累计计数延续；到期后新购会员则重新从 0 开始。',
        ],
      },
      {
        q: '“最高 15 / 16 / 17 轮次每天”是什么意思？',
        a: [
          '这是每日使用上限：月卡 15 轮、季卡 16 轮、年卡 17 轮，按最近 24 小时滚动窗口统计（不是按自然日零点重置），用于防止账号被滥用。',
        ],
      },
      {
        q: '升级后每日上限如何转换？',
        a: [
          '升级支付成功后立即按新套餐的每日上限执行，但当天已经用掉的轮次不重置。例如月卡当天已聊满 15 轮后升级年卡，当天还能再聊 17−15=2 轮会员配额，超出部分改走加榨包。',
        ],
      },
    ],
  },
  {
    id: 'tickets',
    title: '三、加榨包',
    items: [
      {
        q: '什么是加榨包？',
        a: [
          '加榨包是按轮次购买的加购额度，￥19.9 含 10 轮次。它不是会员：不授予会员身份、没有有效期（永久不过期）、用完再续，会员和非会员都可以购买，可重复购买。',
          '加榨包可以用于和任意已上线的导师分身对话，且不占用会员的每日上限。',
        ],
      },
      {
        q: '会员配额和加榨包的消耗顺序是怎样的？',
        a: [
          '非会员：先消耗免费试用的 3 次付费导师对话，用完后开始消耗加榨包；加榨包也用完则引导开通会员。',
          '会员：优先消耗订阅周期内的轮次（同时受每日上限约束）。只有周期总轮次用完、或当天达到每日上限时，才开始消耗加榨包。',
          '免费导师分身的对话不消耗任何额度。',
        ],
      },
      {
        q: '加榨包正在消耗时，又买了月卡 / 季卡 / 年卡，怎么算？',
        a: [
          '会员权益立即生效，从下一条消息起恢复消耗会员配额，加榨包暂停扣减。',
          '周期内已用轮次和当天已用轮次都不清零，只是按新套餐抬高上限；之前没用完的加榨包原样保留，之后会员配额再次触顶时自动继续消耗，不会过期也不会被抵扣。',
        ],
      },
      {
        q: '聊天框上的“+20”是什么？',
        a: ['“+数字”表示当前剩余的加榨包轮次，例如“+20”即还剩 20 轮加榨包。没有加榨包时该标识不显示。'],
      },
    ],
  },
  {
    id: 'free',
    title: '四、免费使用',
    items: [
      {
        q: '不开通会员可以聊导师分身吗？',
        a: [
          '可以。免费导师分身的对话不限次数；付费导师分身提供 3 次免费试用，试用结束后可选择开通会员或购买加榨包继续对话。',
        ],
      },
    ],
  },
];

export default async function BuyingQaPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/dashboard/subscription/qa');
  }

  return (
    <div className="min-h-screen flex flex-col bg-beige">
      <Header />

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-8">
        <Link
          href="/dashboard/subscription"
          className="inline-flex items-center gap-1 text-sm text-accent hover:text-accent-dark mb-5"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          返回加入会员
        </Link>

        <h1 className="text-2xl font-bold text-ink mb-2">购买Q&amp;A</h1>
        <p className="text-sm text-muted mb-6">
          会员升级、轮次计算、加榨包消耗规则，这里都有说明。
        </p>

        {/* 目录 */}
        <nav className="rounded-xl bg-white border border-rule p-4 mb-8">
          <ul className="space-y-1.5 text-sm">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-accent hover:text-accent-dark">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* 正文 */}
        <div className="space-y-10">
          {SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-20">
              <h2 className="text-lg font-bold text-ink mb-4 pb-2 border-b border-rule">
                {section.title}
              </h2>
              <div className="space-y-6">
                {section.items.map((item, i) => (
                  <div key={i}>
                    <h3 className="text-[15px] font-semibold text-ink mb-2">
                      Q：{item.q}
                    </h3>
                    <div className="space-y-1.5">
                      {item.a.map((line, j) => (
                        <p key={j} className="text-sm text-slate-600 leading-relaxed">
                          {item.a.length > 1
                            ? `${j === 0 ? 'A：' : '　　'}${j + 1}. ${line}`
                            : `A：${line}`}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10 rounded-xl bg-white border border-rule p-4">
          <p className="text-sm text-muted leading-relaxed">
            规则如有调整以页面实际展示为准。
          </p>
        </div>
      </main>

      <HomeFooter lang="zh" />
    </div>
  );
}
