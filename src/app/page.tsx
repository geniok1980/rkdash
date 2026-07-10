'use client';

import Link from 'next/link';
import { useState } from 'react';

const navLinks = [
  { href: '#features', label: 'Возможности' },
  { href: '#ai', label: 'AI Агенты' },
  { href: '#team', label: 'Команда' },
  { href: '#integrations', label: 'Интеграции' },
  { href: '#pricing', label: 'Цены' }
];

const features = [
  {
    icon: '📊',
    title: 'Панель управления',
    desc: 'Выручка, средний чек, популярные блюда, графики — вся ключевая метрика в реальном времени.',
    color: 'from-blue-500/20 to-blue-600/10'
  },
  {
    icon: '🤖',
    title: 'Чат с базой (AI)',
    desc: 'Задавайте вопросы на русском языке — AI агент выполняет SQL-запросы и выдаёт готовые ответы.',
    color: 'from-purple-500/20 to-purple-600/10'
  },
  {
    icon: '💰',
    title: 'Премии и штрафы',
    desc: 'Автоматический расчёт KPI официантов, начисление премий и контроль штрафов.',
    color: 'from-emerald-500/20 to-emerald-600/10'
  },
  {
    icon: '📈',
    title: 'План / Факт',
    desc: 'Сравнение плановых показателей с фактическими. Контроль выполнения целей.',
    color: 'from-amber-500/20 to-amber-600/10'
  },
  {
    icon: '🔍',
    title: 'Подозрительные операции',
    desc: 'AI выявляет аномалии: несоответствия в оплатах, подозрительные скидки и возвраты.',
    color: 'from-red-500/20 to-red-600/10'
  },
  {
    icon: '🔮',
    title: 'Прогнозирование',
    desc: 'Машинное обучение прогнозирует спрос, загрузку зала и выручку на основе исторических данных.',
    color: 'from-cyan-500/20 to-cyan-600/10'
  },
  {
    icon: '🥩',
    title: 'Фудкост',
    desc: 'Контроль себестоимости блюд, анализ списаний и автоматический пересчёт цен.',
    color: 'from-orange-500/20 to-orange-600/10'
  },
  {
    icon: '📋',
    title: 'Управление меню',
    desc: 'AI агент вносит изменения в меню через учётную систему: цены, состав, доступность.',
    color: 'from-violet-500/20 to-violet-600/10'
  }
];

const howItWorks = [
  {
    step: '1',
    title: 'Подключаете учётную систему',
    desc: 'r_keeper или iiko — настраиваем ETL за 1 день.'
  },
  {
    step: '2',
    title: 'AI анализирует данные',
    desc: 'Нейросети обрабатывают историю продаж, движения товаров и действия персонала.'
  },
  {
    step: '3',
    title: 'Получаете инсайты',
    desc: 'Готовые отчёты, рекомендации по меню, прогнозы спроса и аномалии.'
  },
  {
    step: '4',
    title: 'AI действует за вас',
    desc: 'Автоматические корректировки меню, цен, начисление KPI и уведомления.'
  }
];

const integrations = [
  {
    name: 'r_keeper',
    desc: 'Полноценная интеграция с r_keeper 7: выгрузка чеков, номенклатуры, складских остатков и данных о персонале.',
    features: ['Продажи и чеки', 'Склад и остатки', 'Персонал и смены', 'Меню и номенклатура']
  },
  {
    name: 'iiko',
    desc: 'Поддержка iiko: автоматическая загрузка данных через API, синхронизация меню и аналитика в реальном времени.',
    features: [
      'Заказы и оплаты',
      'Складские движения',
      'Производство и списания',
      'План-факт анализ'
    ]
  }
];

function MenuIcon() {
  return (
    <svg
      width='24'
      height='24'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
    >
      <line x1='4' x2='20' y1='12' y2='12' />
      <line x1='4' x2='20' y1='6' y2='6' />
      <line x1='4' x2='20' y1='18' y2='18' />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      width='24'
      height='24'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
    >
      <path d='M18 6 6 18' />
      <path d='m6 6 12 12' />
    </svg>
  );
}

export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className='min-h-screen bg-[#0a0a0f] text-white'>
      {/* Nav */}
      <nav className='fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl'>
        <div className='mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8'>
          <Link href='/' className='flex items-center gap-2'>
            <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-bold'>
              R
            </div>
            <span className='text-lg font-semibold tracking-tight'>RKDash</span>
          </Link>

          {/* Desktop nav */}
          <div className='hidden items-center gap-8 md:flex'>
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className='text-sm text-zinc-400 transition-colors hover:text-white'
              >
                {l.label}
              </Link>
            ))}
            <Link
              href='/auth/sign-in'
              className='rounded-lg bg-white px-5 py-2 text-sm font-medium text-black transition-all hover:bg-zinc-200'
            >
              Войти
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button className='md:hidden' onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <XIcon /> : <MenuIcon />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className='border-t border-white/5 px-4 pb-6 pt-4 md:hidden'>
            <div className='flex flex-col gap-4'>
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className='text-sm text-zinc-400 transition-colors hover:text-white'
                >
                  {l.label}
                </Link>
              ))}
              <Link
                href='/auth/sign-in'
                onClick={() => setMobileOpen(false)}
                className='mt-2 inline-flex items-center justify-center rounded-lg bg-white px-5 py-2 text-sm font-medium text-black transition-all hover:bg-zinc-200'
              >
                Войти
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className='relative flex min-h-screen items-center overflow-hidden pt-16'>
        {/* Background effects */}
        <div className='pointer-events-none absolute inset-0'>
          <div className='absolute left-1/2 top-1/4 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-[120px]' />
          <div className='absolute right-1/4 top-2/3 h-[400px] w-[400px] rounded-full bg-purple-500/8 blur-[100px]' />
          <div className='absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent' />
        </div>

        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='mx-auto max-w-4xl text-center'>
            <div className='mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-zinc-400'>
              <span className='flex h-2 w-2 rounded-full bg-emerald-500' />
              Цифровые сотрудники для вашего ресторана
            </div>

            <h1 className='text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl'>
              Умная аналитика
              <br />
              <span className='bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent'>
                для вашего ресторана
              </span>
            </h1>

            <p className='mt-6 text-lg leading-relaxed text-zinc-400 sm:text-xl'>
              RKDash — платформа, где вашему ресторану помогает команда цифровых сотрудников на базе
              AI. Анализируйте продажи, прогнозируйте спрос, управляйте меню — просто задавая
              вопросы.
            </p>

            <div className='mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row'>
              <a
                href='https://t.me/geniok'
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex h-12 w-full items-center justify-center rounded-xl bg-white px-8 text-sm font-medium text-black transition-all hover:bg-zinc-200 sm:w-auto'
              >
                Заказать демонстрацию
              </a>
              <Link
                href='#features'
                className='inline-flex h-12 w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-8 text-sm font-medium text-zinc-300 transition-all hover:bg-white/10 sm:w-auto'
              >
                Узнать больше
              </Link>
            </div>

            {/* Stats */}
            <div className='mt-16 grid grid-cols-2 gap-8 border-t border-white/5 pt-12 sm:grid-cols-4'>
              {[
                { value: '₽679K', label: 'Выручка сегодня' },
                { value: '796', label: 'Чеков обработано' },
                { value: '99.9%', label: 'Доступность' },
                { value: '5', label: 'Цифровых сотрудников' }
              ].map((s) => (
                <div key={s.label}>
                  <div className='text-2xl font-bold'>{s.value}</div>
                  <div className='mt-1 text-xs text-zinc-500'>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id='features' className='relative py-24 sm:py-32'>
        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='mx-auto max-w-2xl text-center'>
            <h2 className='text-3xl font-bold tracking-tight sm:text-4xl'>
              Всё для управления рестораном
            </h2>
            <p className='mt-4 text-zinc-400'>
              От финансовой аналитики до AI-рекомендаций — один дашборд закрывает все задачи.
            </p>
          </div>

          <div className='mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            {features.map((f) => (
              <div
                key={f.title}
                className='group relative overflow-hidden rounded-xl border border-white/5 bg-white/5 p-6 transition-all hover:border-white/10 hover:bg-white/[0.07]'
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${f.color} opacity-0 transition-opacity group-hover:opacity-100`}
                />
                <div className='relative'>
                  <div className='mb-4 text-2xl'>{f.icon}</div>
                  <h3 className='text-base font-semibold'>{f.title}</h3>
                  <p className='mt-2 text-sm leading-relaxed text-zinc-400'>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Section */}
      <section id='ai' className='relative border-t border-white/5 py-24 sm:py-32'>
        <div className='pointer-events-none absolute inset-0'>
          <div className='absolute right-0 top-0 h-[500px] w-[500px] rounded-full bg-purple-500/8 blur-[120px]' />
        </div>

        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='grid items-center gap-12 lg:grid-cols-2'>
            <div>
              <div className='mb-4 inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/10 px-4 py-1.5 text-xs text-purple-300'>
                🤖 AI Агенты
              </div>
              <h2 className='text-3xl font-bold tracking-tight sm:text-4xl'>
                Аналитика через <span className='text-purple-400'>естественный язык</span>
              </h2>
              <p className='mt-4 text-zinc-400 leading-relaxed'>
                AI-агент понимает вопросы на русском языке, выполняет сложные SQL-запросы к вашей
                базе данных и возвращает готовые ответы с графиками и рекомендациями.
              </p>
              <ul className='mt-8 space-y-4'>
                {[
                  '«Покажи топ-10 блюд по прибыли за неделю»',
                  '«Какие позиции меню пора поднять в цене?»',
                  '«Кто из официантов показывает рост выручки?»',
                  '«Обнови цену на борщ в iiko на 380₽»'
                ].map((q) => (
                  <li key={q} className='flex items-start gap-3 text-sm text-zinc-300'>
                    <span className='mt-0.5 text-purple-400'>▸</span>
                    {q}
                  </li>
                ))}
              </ul>
            </div>

            <div className='relative'>
              <div className='overflow-hidden rounded-xl border border-white/10 bg-white/5 p-6'>
                {/* Chat mock */}
                <div className='space-y-4'>
                  <div className='flex items-start gap-3'>
                    <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs text-indigo-300'>
                      U
                    </div>
                    <div className='rounded-xl rounded-tl-none bg-white/10 px-4 py-2.5 text-sm text-zinc-200'>
                      Какие блюда приносят наибольшую прибыль?
                    </div>
                  </div>
                  <div className='flex items-start gap-3'>
                    <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-xs text-purple-300'>
                      AI
                    </div>
                    <div className='rounded-xl rounded-tl-none bg-purple-500/15 px-4 py-2.5 text-sm text-zinc-200'>
                      <p className='mb-2'>Топ-5 блюд по прибыли за последнюю неделю:</p>
                      <ol className='ml-4 list-decimal space-y-1 text-zinc-300'>
                        <li>Борщ с говядиной — ₽13,280 (прибыль 62%)</li>
                        <li>Салат с креветками — ₽16,680 (прибыль 58%)</li>
                        <li>Пицца Четыре сыра — ₽9,730 (прибыль 55%)</li>
                        <li>Котлеты из индейки — ₽9,300 (прибыль 51%)</li>
                        <li>Салат томат/авокадо — ₽10,000 (прибыль 48%)</li>
                      </ol>
                      <p className='mt-2 text-purple-300'>
                        💡 Рекомендация: поднять цену на позицию #4 на 7% — эластичность спроса
                        низкая.
                      </p>
                    </div>
                  </div>
                  <div className='flex items-start gap-3'>
                    <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs text-indigo-300'>
                      U
                    </div>
                    <div className='rounded-xl rounded-tl-none bg-white/10 px-4 py-2.5 text-sm text-zinc-200'>
                      Обнови цену на Пицца Четыре сыра до 1,590₽
                    </div>
                  </div>
                  <div className='flex items-start gap-3 opacity-60'>
                    <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-xs text-purple-300'>
                      AI
                    </div>
                    <div className='rounded-xl rounded-tl-none bg-purple-500/15 px-4 py-2.5 text-sm text-zinc-200'>
                      ✅ Цена обновлена в iiko. Текущая: 1,590₽. Прогнозируемый рост выручки:
                      +₽12,400/нед.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Digital Team */}
      <section id='team' className='relative border-t border-white/5 py-24 sm:py-32'>
        <div className='pointer-events-none absolute inset-0'>
          <div className='absolute left-0 top-1/3 h-[500px] w-[500px] rounded-full bg-emerald-500/5 blur-[120px]' />
        </div>

        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='mx-auto max-w-2xl text-center'>
            <div className='mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-xs text-emerald-300'>
              🤖 Команда
            </div>
            <h2 className='text-3xl font-bold tracking-tight sm:text-4xl'>
              Цифровые сотрудники <span className='text-emerald-400'>в каждом ресторане</span>
            </h2>
            <p className='mt-4 text-zinc-400'>
              Под капотом RKDash работает команда AI-агентов. Каждый цифровой сотрудник отвечает за
              свою задачу 24/7.
            </p>
          </div>

          <div className='mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            {[
              {
                role: 'SQL-аналитик',
                emoji: '📊',
                desc: 'Отвечает на любые вопросы о продажах, выручке и блюдах. Выполняет SQL-запросы в реальном времени и возвращает готовые ответы с цифрами.'
              },
              {
                role: 'Менеджер меню',
                emoji: '🥩',
                desc: 'Управляет ценами, составом и доступностью блюд в учётной системе. Может обновить стоимость позиции или скрыть блюдо по голосовой команде.'
              },
              {
                role: 'Финансовый контролёр',
                emoji: '💰',
                desc: 'Следит за фудкостом, начисляет KPI официантов, контролирует премии и штрафы. Сравнивает план с фактом.'
              },
              {
                role: 'Инспектор аномалий',
                emoji: '🔍',
                desc: 'Выявляет подозрительные операции: несоответствия в оплатах, аномальные скидки, возвраты. Срабатывает автоматически.'
              },
              {
                role: 'Прогнозист',
                emoji: '🔮',
                desc: 'Предсказывает спрос, загрузку зала и выручку на основе исторических данных. Помогает планировать закупки и смены.'
              },
              {
                role: 'Оркестратор',
                emoji: '⚡',
                desc: 'Координирует всю команду: будит сотрудников по расписанию, доставляет отчёты, делегирует сложные задачи между агентами.'
              }
            ].map((member) => (
              <div
                key={member.role}
                className='group relative overflow-hidden rounded-xl border border-white/5 bg-white/5 p-6 transition-all hover:border-emerald-500/20 hover:bg-white/[0.07]'
              >
                <div className='absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100' />
                <div className='relative'>
                  <div className='mb-4'>
                    <span className='text-2xl'>{member.emoji}</span>
                  </div>
                  <h3 className='text-base font-semibold'>{member.role}</h3>
                  <p className='mt-2 text-sm leading-relaxed text-zinc-400'>{member.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className='mx-auto mt-12 max-w-2xl text-center'>
            <div className='rounded-xl border border-white/5 bg-white/[0.03] p-6'>
              <p className='text-sm text-zinc-400'>
                Вместо дорогих SaaS-подписок вы получаете команду из 5 цифровых сотрудников за
                фиксированную цену тарифа. Каждый работает 24/7 без выходных.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className='relative border-t border-white/5 py-24 sm:py-32'>
        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='mx-auto max-w-2xl text-center'>
            <h2 className='text-3xl font-bold tracking-tight sm:text-4xl'>Как это работает</h2>
            <p className='mt-4 text-zinc-400'>От подключения до первых инсайтов — меньше дня.</p>
          </div>

          <div className='mt-16 grid gap-8 md:grid-cols-4'>
            {howItWorks.map((h, i) => (
              <div key={h.step} className='relative'>
                <div className='flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-lg font-bold'>
                  {h.step}
                </div>
                {i < howItWorks.length - 1 && (
                  <div className='absolute left-6 top-12 hidden h-[calc(100%-3rem)] w-px bg-gradient-to-b from-white/20 to-transparent md:block' />
                )}
                <h3 className='mt-4 text-base font-semibold'>{h.title}</h3>
                <p className='mt-2 text-sm leading-relaxed text-zinc-400'>{h.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section id='integrations' className='relative border-t border-white/5 py-24 sm:py-32'>
        <div className='pointer-events-none absolute inset-0'>
          <div className='absolute left-0 top-1/2 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-indigo-500/8 blur-[100px]' />
        </div>

        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='mx-auto max-w-2xl text-center'>
            <h2 className='text-3xl font-bold tracking-tight sm:text-4xl'>
              Работает с вашей системой
            </h2>
            <p className='mt-4 text-zinc-400'>
              Глубокая интеграция с популярными учётными системами ресторанов.
            </p>
          </div>

          <div className='mt-16 grid gap-8 md:grid-cols-2'>
            {integrations.map((int) => (
              <div
                key={int.name}
                className='rounded-xl border border-white/10 bg-white/5 p-8 transition-all hover:border-white/20'
              >
                <h3 className='text-xl font-bold'>{int.name}</h3>
                <p className='mt-3 text-sm leading-relaxed text-zinc-400'>{int.desc}</p>
                <div className='mt-6 flex flex-wrap gap-2'>
                  {int.features.map((f) => (
                    <span
                      key={f}
                      className='rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300'
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id='pricing' className='relative border-t border-white/5 py-24 sm:py-32'>
        <div className='pointer-events-none absolute inset-0'>
          <div className='absolute left-1/4 top-1/3 h-[400px] w-[400px] rounded-full bg-indigo-500/8 blur-[100px]' />
          <div className='absolute right-1/4 bottom-1/3 h-[400px] w-[400px] rounded-full bg-purple-500/8 blur-[100px]' />
        </div>

        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='mx-auto max-w-2xl text-center'>
            <h2 className='text-3xl font-bold tracking-tight sm:text-4xl'>Тарифы</h2>
            <p className='mt-4 text-zinc-400'>
              Начните с одного ресторана или подключите всю сеть.
            </p>
          </div>

          <div className='mt-16 mx-auto grid max-w-3xl gap-8 md:grid-cols-2'>
            {/* Тариф Ресторан */}
            <div className='relative rounded-xl border border-white/10 bg-white/5 p-8 transition-all hover:border-white/20'>
              <h3 className='text-lg font-medium text-zinc-400'>Ресторан</h3>
              <div className='mt-4 flex items-baseline gap-1'>
                <span className='text-4xl font-bold'>4 990</span>
                <span className='text-zinc-500'>₽/мес</span>
              </div>
              <p className='mt-2 text-sm text-zinc-500'>Для одного ресторана</p>
              <ul className='mt-8 space-y-3'>
                {[
                  'Полная аналитика и дашборды',
                  'AI-чат с базой данных',
                  'Премии и штрафы',
                  'План / Факт',
                  'Подозрительные операции',
                  'Прогнозирование',
                  'Фудкост',
                  'Управление меню через AI',
                  'Интеграция r_keeper или iiko',
                  'Поддержка по email'
                ].map((f) => (
                  <li key={f} className='flex items-start gap-3 text-sm text-zinc-300'>
                    <span className='mt-0.5 text-emerald-400'>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href='/auth/sign-in'
                className='mt-8 inline-flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-white/10'
              >
                Выбрать тариф
              </Link>
            </div>

            {/* Тариф Сеть */}
            <div className='relative rounded-xl border border-indigo-500/30 bg-white/[0.07] p-8 shadow-lg shadow-indigo-500/5 transition-all hover:border-indigo-500/50'>
              <div className='absolute -top-3 right-6 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-1 text-xs font-medium'>
                Популярное
              </div>
              <h3 className='text-lg font-medium text-zinc-400'>Сеть</h3>
              <div className='mt-4 flex items-baseline gap-1'>
                <span className='text-4xl font-bold'>3 990</span>
                <span className='text-zinc-500'>₽/мес</span>
              </div>
              <p className='mt-2 text-sm text-zinc-500'>
                за первый ресторан + 1 990 ₽/мес за каждый дополнительный
              </p>
              <div className='mt-4 rounded-lg bg-white/5 px-4 py-3'>
                <p className='text-xs text-zinc-500'>Пример для сети из 3 ресторанов:</p>
                <p className='mt-1 text-sm font-medium text-white'>
                  3 990 + 1 990 + 1 990 = <span className='text-indigo-300'>7 970 ₽/мес</span>
                </p>
              </div>
              <ul className='mt-6 space-y-3'>
                {[
                  'Всё из тарифа Ресторан',
                  'Единый дашборд по всей сети',
                  'Сравнение ресторанов между собой',
                  'Централизованное управление меню',
                  'Общая база знаний AI',
                  'Приоритетная поддержка',
                  'Выделенный менеджер'
                ].map((f) => (
                  <li key={f} className='flex items-start gap-3 text-sm text-zinc-300'>
                    <span className='mt-0.5 text-emerald-400'>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href='/auth/sign-in'
                className='mt-8 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-3 text-sm font-medium text-white transition-all hover:from-indigo-400 hover:to-purple-500'
              >
                Выбрать тариф
              </Link>
            </div>
          </div>

          <div className='mx-auto mt-16 max-w-2xl text-center'>
            <p className='text-sm text-zinc-500'>
              Остались вопросы?{' '}
              <a
                href='https://t.me/geniok'
                target='_blank'
                rel='noopener noreferrer'
                className='text-indigo-400 underline underline-offset-2 hover:text-indigo-300'
              >
                Напишите нам
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className='border-t border-white/5 py-12'>
        <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
          <div className='flex flex-col items-center justify-between gap-6 md:flex-row'>
            <div className='flex items-center gap-2'>
              <div className='flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold'>
                R
              </div>
              <span className='text-sm font-medium'>RKDash</span>
            </div>
            <div className='flex gap-6 text-xs text-zinc-500'>
              <Link href='/privacy-policy' className='transition-colors hover:text-zinc-300'>
                Политика конфиденциальности
              </Link>
              <Link href='/terms-of-service' className='transition-colors hover:text-zinc-300'>
                Условия использования
              </Link>
              <Link href='/about' className='transition-colors hover:text-zinc-300'>
                О проекте
              </Link>
            </div>
            <div className='text-xs text-zinc-600'>© 2026 RKDash</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
