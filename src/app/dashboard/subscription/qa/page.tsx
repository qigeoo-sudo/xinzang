import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { Header } from '@/components/header';
import { PaperCredits, GoldFlakes } from '@/components/page-shell';

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
          '同级重复购买（如月卡再买月卡、季卡再买季卡）和向下降级不允许；年度会员可以续费年度，续费后到期日在原到期日上再加一年。年卡续费有上限：来自年卡的剩余天数在 1460 天（4 年）以内才能再续，正好剩 1460 天可续最后一年（续后 1825 天），之后需等剩余天数回落到 1460 天内才能再续，届时卡面角标会从橙色"续满"恢复为绿色"续费"。',
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
          '升级支付成功后立即按新套餐的每日上限执行，但当天已经用掉的轮次不重置。例如月卡当天已聊满 15 轮后升级年卡，当天还能再聊 17−15=2 轮会员配额，超出部分改走多榨卡。',
        ],
      },
      {
        q: '收到系统的固定提示（如内容提醒、超出分身领域的回复），会计入轮次吗？',
        a: [
          '不会。只有导师分身真正生成的回复才计 1 轮；命中安全提醒、超出分身能力范围等系统固定提示不扣减任何额度，也不会计入本期、今日或多榨卡的用量，聊天框上的数字保持不变。',
        ],
      },
    ],
  },
  {
    id: 'tickets',
    title: '三、多榨卡',
    items: [
      {
        q: '什么是多榨卡？',
        a: [
          '多榨卡是按轮次购买的加购额度，￥19.9 含 10 轮次。它不是会员：不授予会员身份、一次购买永不过期、用完再续，会员和非会员都可以购买，可重复购买。',
          '多榨卡可以用于和任意已上线的导师分身对话，且不占用会员的每日上限。',
        ],
      },
      {
        q: '可以一次购买多个多榨卡吗？有折扣吗？',
        a: [
          '可以。在多榨卡卡片上用 − / ＋ 选择购买数量（单笔 1-99 个），每个含 10 轮次，一次下单、一次支付，所有轮次立即到账。',
          '批量折扣按整单数量计算：一次购买 5-9 个打 9 折，买满 5 个折后 ￥89.5；一次购买 10 个及以上一律 8.5 折，买满 10 个折后 ￥169.1，买 20 个折后 ￥338.3。折后总价向下取整到角，固定显示一位小数（如 ￥89.0）。',
          '多买的轮次同样一次购买、永不过期，用不完会一直留在账号里。',
          '持有上限 2970 轮次（297 包）：当前余额加上本次购买超过 2970 轮时，支付按钮失活，卡顶出现红色"榨干"标记，数量加号也无法继续上调；等多榨卡随对话消耗、余额回落后自动恢复可购买。',
        ],
      },
      {
        q: '会员配额和多榨卡的消耗顺序是怎样的？',
        a: [
          '非会员：先消耗免费试用的 3 次付费导师对话，用完后开始消耗多榨卡；多榨卡也用完则引导开通会员。',
          '会员：优先消耗订阅周期内的轮次（同时受每日上限约束）。只有周期总轮次用完、或当天达到每日上限时，才开始消耗多榨卡。',
          '免费导师分身的对话不消耗任何额度。',
        ],
      },
      {
        q: '多榨卡正在消耗时，又买了月卡 / 季卡 / 年卡，怎么算？',
        a: [
          '会员权益立即生效，从下一条消息起恢复消耗会员配额，多榨卡暂停扣减。',
          '周期内已用轮次和当天已用轮次都不清零，只是按新套餐抬高上限；之前没用完的多榨卡原样保留，之后会员配额再次触顶时自动继续消耗，不会过期也不会被抵扣。',
        ],
      },
      {
        q: '聊天框上方的“本期 40/60 · 今日 12/15 · 多榨卡 0/10”是什么意思？',
        a: [
          '这是三个相互独立的额度，每个都按“已用 / 总额”显示：本期是当前订阅周期内的总轮次（非会员显示“免费试用 0/3”）；今日是最近 24 小时滚动窗口内的用量；多榨卡是历次购买累计的加购轮次，只有买过多榨卡才会显示这一段。',
          '三个池子各自计数，任何一个池子的已用量都不会超过它自己的总额。本期和今日都没满时消耗会员（或试用）额度；其中任意一个满了就改消耗多榨卡，此时本期和今日的数字保持不动；多榨卡也用完时，会引导你开通会员或再次购买多榨卡。',
          '免费导师分身的对话不消耗任何额度。',
        ],
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
          '可以。免费导师分身的对话不限次数；付费导师分身提供 3 次免费试用，试用结束后可选择开通会员或购买多榨卡继续对话。',
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
    <div className="relative min-h-screen flex flex-col bg-bg cream-foil overflow-hidden">
      <Header />
      <GoldFlakes />

      <main className="relative z-10 flex-1 w-full max-w-2xl mx-auto px-4 py-8">
        <Link
          href="/dashboard/subscription"
          className="inline-flex items-center gap-1 text-sm text-accent hover:text-accent-dark mb-5"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          返回加入会员
        </Link>

        <div className="relative">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-2 -top-6 select-none font-serif text-[130px] font-bold leading-none text-[#B0852E]/[0.08] md:text-[170px]"
          >
            榨
          </span>
          <h1 className="relative text-2xl font-bold text-ink mb-2">购买Q&amp;A</h1>
          <p className="relative text-sm text-muted mb-6">
            会员升级、轮次计算、多榨卡消耗规则，这里都有说明。
          </p>
        </div>

        {/* 目录 */}
        <nav className="letter-paper rounded-[20px] p-4 mb-8">
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
                  <div key={i} className="letter-paper rounded-[16px] p-4 md:p-5">
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

        <div className="letter-paper rounded-[16px] p-4 mt-10">
          <p className="text-sm text-muted leading-relaxed">
            规则如有调整以页面实际展示为准。
          </p>
        </div>
      </main>

      <PaperCredits lang="zh" />
    </div>
  );
}
