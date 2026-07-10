'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-form';
import * as z from 'zod';
import { toast } from 'sonner';
import PageContainer from '@/components/layout/page-container';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppForm, useFormFields } from '@/components/ui/tanstack-form';
import { apiClient } from '@/lib/api-client';
import type { IikoEtlConfig } from '@/lib/dashboard-settings';
import { getQueryClient } from '@/lib/query-client';

const syncKindOptions = [
  { value: 'all', label: 'Полная синхронизация' },
  { value: 'dicts', label: 'Справочники' },
  { value: 'products', label: 'Номенклатура' },
  { value: 'sales', label: 'Продажи' }
] as const;

const configSchema = z.object({
  etlServiceUrl: z.string().min(1, 'Укажите URL ETL сервиса'),
  serverUrl: z.string().min(1, 'Укажите URL сервера iiko'),
  login: z.string().min(1, 'Укажите логин'),
  password: z.string().min(1, 'Укажите пароль'),
  intervalSeconds: z.number().min(60, 'Минимум 60 секунд'),
  requestTimeoutSeconds: z.number().min(5, 'Минимум 5 секунд'),
  verifySsl: z.boolean()
});

const syncSchema = z.object({
  kind: z.enum(['all', 'dicts', 'products', 'sales']),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional()
});

type IikoConfigFormValues = z.infer<typeof configSchema>;
type IikoSyncFormValues = z.infer<typeof syncSchema>;

type SyncAcceptedResponse = {
  status: string;
  message?: string;
};

const queryKeys = {
  config: ['settings', 'iiko-etl', 'config'] as const,
  status: ['settings', 'iiko-etl', 'status'] as const
};

async function fetchConfig(): Promise<IikoEtlConfig> {
  return apiClient('/iiko-etl/config', { cache: 'no-store' });
}

async function saveConfig(values: IikoConfigFormValues): Promise<IikoEtlConfig> {
  return apiClient('/iiko-etl/config', {
    method: 'PUT',
    body: JSON.stringify(values),
    cache: 'no-store'
  });
}

async function fetchStatus(): Promise<unknown> {
  return apiClient('/iiko-etl/status', { cache: 'no-store' });
}

async function startSync(values: IikoSyncFormValues): Promise<SyncAcceptedResponse> {
  return apiClient('/iiko-etl/sync', {
    method: 'POST',
    body: JSON.stringify(values),
    cache: 'no-store'
  });
}

function getConfigDescription(config: IikoEtlConfig | undefined): string {
  if (!config) return 'Конфигурация iiko ETL ещё не загружена.';
  return `Сервис: ${config.etlServiceUrl}. Сервер iiko: ${config.serverUrl}. Интервал: ${config.intervalSeconds} сек.`;
}

export default function IikoEtlSettingsPage() {
  const queryClient = getQueryClient();

  const configQuery = useQuery({
    queryKey: queryKeys.config,
    queryFn: fetchConfig,
    staleTime: 15_000
  });

  const statusQuery = useQuery({
    queryKey: queryKeys.status,
    queryFn: fetchStatus,
    retry: false,
    staleTime: 10_000
  });

  const saveMutation = useMutation({
    mutationFn: (values: IikoConfigFormValues) => saveConfig(values),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.config, data);
      toast.success('Конфигурация IIKO ETL сохранена');
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const syncMutation = useMutation({
    mutationFn: (values: IikoSyncFormValues) => startSync(values),
    onSuccess: async (data) => {
      toast.success(data.message || 'Синхронизация IIKO ETL запущена');
      await queryClient.invalidateQueries({ queryKey: queryKeys.status });
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const configForm = useAppForm({
    defaultValues: {
      etlServiceUrl: 'http://127.0.0.1:8791',
      serverUrl: 'https://403-115-825.iiko.it',
      login: 'geniok',
      password: '20Upiter17',
      intervalSeconds: 3600,
      requestTimeoutSeconds: 60,
      verifySsl: false
    } as IikoConfigFormValues,
    validators: {
      onSubmit: configSchema
    },
    onSubmit: ({ value }) => {
      saveMutation.mutate(value);
    }
  });

  const syncForm = useAppForm({
    defaultValues: {
      kind: 'all',
      dateFrom: '',
      dateTo: ''
    } as IikoSyncFormValues,
    validators: {
      onSubmit: syncSchema
    },
    onSubmit: ({ value }) => {
      syncMutation.mutate(value);
    }
  });

  React.useEffect(() => {
    const data = configQuery.data;
    if (!data) return;

    configForm.setFieldValue('etlServiceUrl', data.etlServiceUrl);
    configForm.setFieldValue('serverUrl', data.serverUrl);
    configForm.setFieldValue('login', data.login);
    configForm.setFieldValue('password', data.password);
    configForm.setFieldValue('intervalSeconds', data.intervalSeconds);
    configForm.setFieldValue('requestTimeoutSeconds', data.requestTimeoutSeconds);
    configForm.setFieldValue('verifySsl', data.verifySsl);
  }, [configForm, configQuery.data]);

  const {
    FormTextField: ConfigTextField,
    FormSwitchField: ConfigSwitchField
  } = useFormFields<IikoConfigFormValues>();
  const {
    FormTextField: SyncTextField,
    FormSelectField: SyncSelectField
  } = useFormFields<IikoSyncFormValues>();

  const syncKind = useStore(syncForm.store, (state) => state.values.kind);
  const needsDates = syncKind === 'all' || syncKind === 'sales';

  return (
    <PageContainer
      pageTitle='IIKO ETL'
      pageDescription='Настройки сервиса, ручной запуск синхронизации и статус подключения к iiko Server API.'
    >
      <div className='grid gap-4 xl:grid-cols-[1.2fr_0.8fr]'>
        <Card>
          <CardHeader>
            <CardTitle>Конфигурация</CardTitle>
            <CardDescription>{getConfigDescription(configQuery.data)}</CardDescription>
          </CardHeader>
          <CardContent>
            <configForm.AppForm>
              <configForm.Form className='space-y-6'>
                <div className='grid gap-4 md:grid-cols-2'>
                  <ConfigTextField
                    name='etlServiceUrl'
                    label='URL ETL сервиса'
                    placeholder='http://127.0.0.1:8791'
                    required
                  />
                  <ConfigTextField
                    name='serverUrl'
                    label='URL сервера iiko'
                    placeholder='https://403-115-825.iiko.it'
                    required
                  />
                  <ConfigTextField name='login' label='Логин iiko' placeholder='geniok' required />
                  <ConfigTextField
                    name='password'
                    label='Пароль iiko'
                    type='password'
                    placeholder='Введите пароль'
                    required
                  />
                  <ConfigTextField
                    name='intervalSeconds'
                    label='Интервал расписания, сек'
                    type='number'
                    min={60}
                    step='60'
                    required
                  />
                  <ConfigTextField
                    name='requestTimeoutSeconds'
                    label='HTTP timeout, сек'
                    type='number'
                    min={5}
                    step='5'
                    required
                  />
                </div>

                <ConfigSwitchField
                  name='verifySsl'
                  label='Проверять SSL сертификат'
                  description='Отключено по умолчанию, потому что этот iiko сервер нестабилен по TLS.'
                />

                <div className='flex items-center gap-3'>
                  <configForm.SubmitButton disabled={saveMutation.isPending || configQuery.isLoading}>
                    Сохранить конфигурацию
                  </configForm.SubmitButton>
                  {configQuery.isLoading && (
                    <span className='text-sm text-muted-foreground'>Загрузка конфигурации...</span>
                  )}
                </div>
              </configForm.Form>
            </configForm.AppForm>
          </CardContent>
        </Card>

        <div className='grid gap-4'>
          <Card>
            <CardHeader>
              <CardTitle>Ручной запуск</CardTitle>
              <CardDescription>Запускает живой FastAPI сервис `iiko_etl`.</CardDescription>
            </CardHeader>
            <CardContent>
              <syncForm.AppForm>
                <syncForm.Form className='space-y-4'>
                  <SyncSelectField
                    name='kind'
                    label='Тип синхронизации'
                    options={syncKindOptions.map((item) => ({
                      value: item.value,
                      label: item.label
                    }))}
                    required
                  />

                  {needsDates && (
                    <div className='grid gap-4 md:grid-cols-2'>
                      <SyncTextField name='dateFrom' label='Дата от' type='date' />
                      <SyncTextField name='dateTo' label='Дата до' type='date' />
                    </div>
                  )}

                  <div className='flex gap-3'>
                    <syncForm.SubmitButton disabled={syncMutation.isPending}>
                      Запустить синхронизацию
                    </syncForm.SubmitButton>
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => {
                        syncForm.setFieldValue('kind', 'dicts');
                        syncMutation.mutate({ kind: 'dicts', dateFrom: '', dateTo: '' });
                      }}
                      isLoading={syncMutation.isPending && syncKind === 'dicts'}
                    >
                      Справочники
                    </Button>
                  </div>
                </syncForm.Form>
              </syncForm.AppForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Статус ETL сервиса</CardTitle>
              <CardDescription>Проверка доступности Python/FastAPI сервиса и его последних запусков.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='flex items-center gap-3'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => statusQuery.refetch()}
                  isLoading={statusQuery.isFetching}
                >
                  <Icons.clock className='mr-2 h-4 w-4' />
                  Обновить статус
                </Button>
                <span className='text-sm text-muted-foreground'>
                  {statusQuery.isError ? 'Сервис недоступен' : 'Ответ получен'}
                </span>
              </div>

              <pre className='overflow-auto rounded-md bg-muted p-4 text-xs'>
                {JSON.stringify(
                  statusQuery.isError
                    ? { error: statusQuery.error instanceof Error ? statusQuery.error.message : 'Unknown error' }
                    : statusQuery.data,
                  null,
                  2
                )}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Что собирается</CardTitle>
              <CardDescription>IIKO ETL пишет в ту же SQLite, что использует dashboard.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-2 text-sm text-muted-foreground'>
              <p>Справочники: departments, groups, terminals, stores.</p>
              <p>Номенклатура: products.</p>
              <p>Продажи: `api/reports/sales` по каждому департаменту с записью в bronze/silver/gold таблицы.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
