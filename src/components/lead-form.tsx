'use client';

import { useState, type FormEvent } from 'react';

export default function LeadForm() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [restaurant, setRestaurant] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, restaurant })
      });
      if (!res.ok) throw new Error('Ошибка отправки');
      setSent(true);
    } catch {
      setError('Не удалось отправить. Попробуйте позже или напишите в Telegram.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className='rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-8 text-center'>
        <div className='text-3xl mb-3'>📩</div>
        <p className='text-lg font-medium text-emerald-300'>Спасибо!</p>
        <p className='mt-2 text-sm text-zinc-400'>Мы свяжемся с вами в ближайшее время.</p>
        <p className='mt-4 text-sm text-zinc-500'>
          А пока —{' '}
          <a
            href='https://t.me/geniok'
            target='_blank'
            rel='noopener noreferrer'
            className='text-indigo-400 underline underline-offset-2 hover:text-indigo-300'
          >
            напишите в Telegram
          </a>
          , если хотите быстрее.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      <div>
        <input
          type='text'
          placeholder='Ваше имя'
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className='w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition-all focus:border-indigo-500/50 focus:bg-white/10'
        />
      </div>
      <div>
        <input
          type='email'
          placeholder='Email'
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className='w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition-all focus:border-indigo-500/50 focus:bg-white/10'
        />
      </div>
      <div>
        <input
          type='text'
          placeholder='Название ресторана / сети'
          value={restaurant}
          onChange={(e) => setRestaurant(e.target.value)}
          className='w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition-all focus:border-indigo-500/50 focus:bg-white/10'
        />
      </div>
      <button
        type='submit'
        disabled={loading}
        className='inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-3 text-sm font-medium text-white transition-all hover:from-indigo-400 hover:to-purple-500 disabled:opacity-50'
      >
        {loading ? 'Отправка...' : 'Получить консультацию'}
      </button>
      {error && <p className='text-xs text-red-400'>{error}</p>}
      <p className='text-xs text-zinc-600'>
        Нажимая кнопку, вы соглашаетесь на обработку персональных данных
      </p>
    </form>
  );
}
