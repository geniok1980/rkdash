import Link from 'next/link';

import PageContainer from '@/components/layout/page-container';
import { Icons } from '@/components/icons';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SettingsPage() {
  return (
    <PageContainer pageTitle='Настройки' pageDescription='Выберите раздел настроек.'>
      <div className='grid gap-4 md:grid-cols-2'>
        <Link
          href='/dashboard/settings/sales-plan'
          className='focus-visible:ring-ring/50 rounded-xl focus-visible:ring-[3px] focus-visible:outline-hidden'
        >
          <Card className='transition-colors hover:bg-accent/40'>
            <CardHeader>
              <div className='flex items-start gap-3'>
                <div className='bg-muted text-foreground flex size-10 items-center justify-center rounded-lg'>
                  <Icons.trendingUp className='size-5' />
                </div>
                <div className='space-y-1'>
                  <CardTitle>План продаж</CardTitle>
                  <CardDescription>Настройки целей и показателей.</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </Link>

        <Link
          href='/dashboard/settings/premiums-penalties'
          className='focus-visible:ring-ring/50 rounded-xl focus-visible:ring-[3px] focus-visible:outline-hidden'
        >
          <Card className='transition-colors hover:bg-accent/40'>
            <CardHeader>
              <div className='flex items-start gap-3'>
                <div className='bg-muted text-foreground flex size-10 items-center justify-center rounded-lg'>
                  <Icons.badgeCheck className='size-5' />
                </div>
                <div className='space-y-1'>
                  <CardTitle>Премии и штрафы</CardTitle>
                  <CardDescription>Правила начислений и удержаний.</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </Link>

        <Link
          href='/dashboard/hermes'
          className='focus-visible:ring-ring/50 rounded-xl focus-visible:ring-[3px] focus-visible:outline-hidden'
        >
          <Card className='transition-colors hover:bg-accent/40'>
            <CardHeader>
              <div className='flex items-start gap-3'>
                <div className='bg-muted text-foreground flex size-10 items-center justify-center rounded-lg'>
                  <Icons.sparkles className='size-5' />
                </div>
                <div className='space-y-1'>
                  <CardTitle>Hermes — агенты</CardTitle>
                  <CardDescription>Управление skills, toolsets и конфигом Hermes.</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </Link>

        <Link
          href='/dashboard/settings/knowledge-base'
          className='focus-visible:ring-ring/50 rounded-xl focus-visible:ring-[3px] focus-visible:outline-hidden'
        >
          <Card className='transition-colors hover:bg-accent/40'>
            <CardHeader>
              <div className='flex items-start gap-3'>
                <div className='bg-muted text-foreground flex size-10 items-center justify-center rounded-lg'>
                  <Icons.workspace className='size-5' />
                </div>
                <div className='space-y-1'>
                  <CardTitle>База знаний</CardTitle>
                  <CardDescription>Загрузка документов в Open Notebook.</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </PageContainer>
  );
}
