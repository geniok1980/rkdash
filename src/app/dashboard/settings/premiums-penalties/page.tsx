'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as z from 'zod';
import { toast } from 'sonner';

import PageContainer from '@/components/layout/page-container';
import { apiClient } from '@/lib/api-client';
import { getQueryClient } from '@/lib/query-client';
import { useAppForm, useFormFields } from '@/components/ui/tanstack-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const rewardPercentSchema = z.object({
  percent: z.number().min(0, 'Минимум 0').max(100, 'Максимум 100')
});

type RewardPercentFormValues = z.infer<typeof rewardPercentSchema>;

const settingsKeys = {
  waiterRewardPercent: ['settings', 'waiterRewardPercent'] as const
};

async function fetchWaiterRewardPercent(): Promise<{ percent: number | null }> {
  return apiClient('/settings/waiter-reward-percent', { cache: 'no-store' });
}

async function saveWaiterRewardPercent(percent: number): Promise<{ percent: number }> {
  return apiClient('/settings/waiter-reward-percent', {
    method: 'POST',
    body: JSON.stringify({ percent }),
    cache: 'no-store'
  });
}

export default function PremiumsPenaltiesSettingsPage() {
  const queryClient = getQueryClient();

  const percentQuery = useQuery({
    queryKey: settingsKeys.waiterRewardPercent,
    queryFn: fetchWaiterRewardPercent,
    staleTime: 15_000
  });

  const saveMutation = useMutation({
    mutationFn: (percent: number) => saveWaiterRewardPercent(percent),
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKeys.waiterRewardPercent, { percent: data.percent });
      toast.success('Процент вознаграждения сохранён');
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const form = useAppForm({
    defaultValues: {
      percent: 0
    } as RewardPercentFormValues,
    validators: {
      onSubmit: rewardPercentSchema
    },
    onSubmit: ({ value }) => {
      saveMutation.mutate(value.percent);
    }
  });

  React.useEffect(() => {
    const percent = percentQuery.data?.percent;
    if (typeof percent === 'number' && Number.isFinite(percent)) {
      form.setFieldValue('percent', percent);
    }
  }, [percentQuery.data?.percent, form]);

  const { FormTextField } = useFormFields<RewardPercentFormValues>();

  return (
    <PageContainer pageTitle='Премии и штрафы' pageDescription='Настройки премий и штрафов.'>
      <div className='grid gap-4'>
        <Card>
          <CardHeader>
            <CardTitle>Процент вознаграждения</CardTitle>
          </CardHeader>
          <CardContent>
            <form.AppForm>
              <form.Form className='space-y-6'>
                <FormTextField
                  name='percent'
                  label='Процент вознаграждения официантов'
                  description='Укажите процент от выручки/суммы, который начисляется официантам.'
                  type='number'
                  min={0}
                  max={100}
                  step='0.01'
                  required
                />

                <div className='flex items-center gap-3'>
                  <form.SubmitButton disabled={saveMutation.isPending || percentQuery.isLoading}>
                    Сохранить
                  </form.SubmitButton>
                  {percentQuery.isLoading && (
                    <div className='text-sm text-muted-foreground'>Загрузка...</div>
                  )}
                </div>
              </form.Form>
            </form.AppForm>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
