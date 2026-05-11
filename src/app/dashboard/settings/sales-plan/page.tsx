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

const growthPercentSchema = z.object({
  percent: z.number().min(-100, 'Минимум -100').max(1000, 'Максимум 1000')
});

type GrowthPercentFormValues = z.infer<typeof growthPercentSchema>;

const settingsKeys = {
  revenueGrowthYoYPercent: ['settings', 'revenueGrowthYoYPercent'] as const
};

async function fetchRevenueGrowthYoYPercent(): Promise<{ percent: number | null }> {
  return apiClient('/settings/revenue-growth-yoy-percent', { cache: 'no-store' });
}

async function saveRevenueGrowthYoYPercent(percent: number): Promise<{ percent: number }> {
  return apiClient('/settings/revenue-growth-yoy-percent', {
    method: 'POST',
    body: JSON.stringify({ percent }),
    cache: 'no-store'
  });
}

export default function SalesPlanSettingsPage() {
  const queryClient = getQueryClient();

  const percentQuery = useQuery({
    queryKey: settingsKeys.revenueGrowthYoYPercent,
    queryFn: fetchRevenueGrowthYoYPercent,
    staleTime: 15_000
  });

  const saveMutation = useMutation({
    mutationFn: (percent: number) => saveRevenueGrowthYoYPercent(percent),
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKeys.revenueGrowthYoYPercent, { percent: data.percent });
      toast.success('Процент роста сохранён');
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const form = useAppForm({
    defaultValues: {
      percent: 0
    } as GrowthPercentFormValues,
    validators: {
      onSubmit: growthPercentSchema
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

  const { FormTextField } = useFormFields<GrowthPercentFormValues>();

  return (
    <PageContainer pageTitle='План продаж' pageDescription='Настройки плана продаж.'>
      <div className='grid gap-4'>
        <Card>
          <CardHeader>
            <CardTitle>Рост выручки к прошлому году</CardTitle>
          </CardHeader>
          <CardContent>
            <form.AppForm>
              <form.Form className='space-y-6'>
                <FormTextField
                  name='percent'
                  label='Процент увеличения выручки'
                  description='Целевой рост выручки по сравнению с предыдущим годом.'
                  type='number'
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
