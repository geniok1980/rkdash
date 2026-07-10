'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-form';
import * as z from 'zod';
import { toast } from 'sonner';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { useAppForm, useFormFields } from '@/components/ui/tanstack-form';
import { apiClient } from '@/lib/api-client';
import type { RkeeperEtlConfig } from '@/lib/dashboard-settings';
import { getQueryClient } from '@/lib/query-client';

const writeModeOptions = [
  { value: 'overwrite', label: 'Overwrite' },
  { value: 'append', label: 'Append' }
] as const;

const syncKindOptions = [
  { value: 'all', label: 'Полная синхронизация' },
  { value: 'dicts', label: 'Только справочники' },
  { value: 'sales', label: 'Только продажи' },
  { value: 'payments', label: 'Только оплаты' },
  { value: 'operations', label: 'Только операции' },
  { value: 'storehouse', label: 'Только StoreHouse' }
] as const;

const rkeeperConfigSchema = z.object({
  etlServiceUrl: z.string().min(1, 'Укажите URL сервиса ETL'),
  rkServerIp: z.string(),
  rkHttpPort: z.number().min(1, 'Укажите RK7 HTTP Port'),
  rkUsername: z.string(),
  rkPassword: z.string(),
  mssqlServer: z.string(),
  mssqlDatabase: z.string(),
  mssqlUser: z.string(),
  mssqlPassword: z.string(),
  mssqlPort: z.number().min(1, 'Укажите MSSQL Port'),
  storehouseApiUrl: z.string(),
  storehouseUsername: z.string(),
  storehousePassword: z.string(),
  storehouseRequestTimeoutSeconds: z.number().min(5, 'Минимум 5 секунд'),
  storehouseRptSalePeriodDays: z.number().min(1, 'Минимум 1 день'),
  intervalSeconds: z.number().min(60, 'Минимум 60 секунд'),
  writeMode: z.enum(['append', 'overwrite'])
});

const rkeeperSyncSchema = z.object({
  kind: z.enum(['dicts', 'sales', 'payments', 'operations', 'storehouse', 'all']),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional()
});

type RkeeperConfigFormValues = z.infer<typeof rkeeperConfigSchema>;
type RkeeperSyncFormValues = z.infer<typeof rkeeperSyncSchema>;

type SyncAcceptedResponse = {
  status: string;
  message?: string;
};

const queryKeys = {
  config: ['settings', 'rkeeper-etl', 'config'] as const,
  status: ['settings', 'rkeeper-etl', 'status'] as const
};

async function fetchConfig(): Promise<RkeeperEtlConfig> {
  return apiClient('/rkeeper-etl/config', { cache: 'no-store' });
}

async function saveConfig(values: RkeeperConfigFormValues): Promise<RkeeperEtlConfig> {
  return apiClient('/rkeeper-etl/config', {
    method: 'PUT',
    body: JSON.stringify(values),
    cache: 'no-store'
  });
}

async function fetchStatus(): Promise<unknown> {
  return apiClient('/rkeeper-etl/status', { cache: 'no-store' });
}

async function startSync(values: RkeeperSyncFormValues): Promise<SyncAcceptedResponse> {
  return apiClient('/rkeeper-etl/sync', {
    method: 'POST',
    body: JSON.stringify(values),
    cache: 'no-store'
  });
}

function getConfigDescription(config: RkeeperEtlConfig | undefined): string {
  if (!config) return 'Конфигурация ещё не загружена.';

  const endpoint = config.etlServiceUrl || 'не задан';
  const interval = `${config.intervalSeconds} сек`;
  const rptSalePeriod = `${config.storehouseRptSalePeriodDays} дн.`;
  return `Сервис: ${endpoint}. Интервал планового запуска: ${interval}. Окно RptSale: ${rptSalePeriod}.`;
}

export default function RkeeperEtlSettingsPage() {
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
    mutationFn: (values: RkeeperConfigFormValues) => saveConfig(values),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.config, data);
      toast.success('Конфигурация RKeeper ETL сохранена');
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const syncMutation = useMutation({
    mutationFn: (values: RkeeperSyncFormValues) => startSync(values),
    onSuccess: async (data) => {
      toast.success(data.message || 'Синхронизация RKeeper ETL запущена');
      await queryClient.invalidateQueries({ queryKey: queryKeys.status });
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const configForm = useAppForm({
    defaultValues: {
      etlServiceUrl: 'http://rkeeper-etl:8690',
      rkServerIp: '',
      rkHttpPort: 16058,
      rkUsername: '',
      rkPassword: '',
      mssqlServer: '',
      mssqlDatabase: '',
      mssqlUser: '',
      mssqlPassword: '',
      mssqlPort: 6063,
      storehouseApiUrl: '',
      storehouseUsername: '',
      storehousePassword: '',
      storehouseRequestTimeoutSeconds: 30,
      storehouseRptSalePeriodDays: 1,
      intervalSeconds: 3600,
      writeMode: 'overwrite'
    } as RkeeperConfigFormValues,
    validators: {
      onSubmit: rkeeperConfigSchema
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
    } as RkeeperSyncFormValues,
    validators: {
      onSubmit: rkeeperSyncSchema
    },
    onSubmit: ({ value }) => {
      syncMutation.mutate(value);
    }
  });

  React.useEffect(() => {
    const data = configQuery.data;
    if (!data) return;

    configForm.setFieldValue('etlServiceUrl', data.etlServiceUrl);
    configForm.setFieldValue('rkServerIp', data.rkServerIp);
    configForm.setFieldValue('rkHttpPort', data.rkHttpPort);
    configForm.setFieldValue('rkUsername', data.rkUsername);
    configForm.setFieldValue('rkPassword', data.rkPassword);
    configForm.setFieldValue('mssqlServer', data.mssqlServer);
    configForm.setFieldValue('mssqlDatabase', data.mssqlDatabase);
    configForm.setFieldValue('mssqlUser', data.mssqlUser);
    configForm.setFieldValue('mssqlPassword', data.mssqlPassword);
    configForm.setFieldValue('mssqlPort', data.mssqlPort);
    configForm.setFieldValue('storehouseApiUrl', data.storehouseApiUrl);
    configForm.setFieldValue('storehouseUsername', data.storehouseUsername);
    configForm.setFieldValue('storehousePassword', data.storehousePassword);
    configForm.setFieldValue(
      'storehouseRequestTimeoutSeconds',
      data.storehouseRequestTimeoutSeconds
    );
    configForm.setFieldValue('storehouseRptSalePeriodDays', data.storehouseRptSalePeriodDays);
    configForm.setFieldValue('intervalSeconds', data.intervalSeconds);
    configForm.setFieldValue('writeMode', data.writeMode);
  }, [configForm, configQuery.data]);

  const {
    FormTextField: ConfigTextField,
    FormSelectField: ConfigSelectField
  } = useFormFields<RkeeperConfigFormValues>();
  const {
    FormTextField: SyncTextField,
    FormSelectField: SyncSelectField
  } = useFormFields<RkeeperSyncFormValues>();

  const syncKind = useStore(syncForm.store, (state) => state.values.kind);
  const needsDates = syncKind !== 'dicts';

  return (
    <PageContainer
      pageTitle='RKeeper ETL'
      pageDescription='Настройки сервиса, расписания, ручной синхронизации и диагностика статуса.'
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
                    placeholder='http://127.0.0.1:8690'
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
                    name='rkServerIp'
                    label='RK7 Server IP'
                    placeholder='10.10.10.15'
                    required
                  />
                  <ConfigTextField
                    name='rkHttpPort'
                    label='RK7 HTTP Port'
                    type='number'
                    min={1}
                    step='1'
                    required
                  />
                  <ConfigTextField
                    name='rkUsername'
                    label='RK логин'
                    placeholder='check'
                    required
                  />
                  <ConfigTextField
                    name='rkPassword'
                    label='RK пароль'
                    type='password'
                    placeholder='Введите пароль'
                    required
                  />
                  <ConfigTextField
                    name='mssqlServer'
                    label='MSSQL Host'
                    placeholder='sqlserver.local'
                    required
                  />
                  <ConfigTextField
                    name='mssqlDatabase'
                    label='MSSQL Database'
                    placeholder='RK7_Vernadka_new'
                    required
                  />
                  <ConfigTextField
                    name='mssqlUser'
                    label='MSSQL User'
                    placeholder='sa'
                    required
                  />
                  <ConfigTextField
                    name='mssqlPassword'
                    label='MSSQL Password'
                    type='password'
                    placeholder='Введите пароль'
                    required
                  />
                  <ConfigTextField
                    name='mssqlPort'
                    label='MSSQL Port'
                    type='number'
                    min={1}
                    step='1'
                    required
                  />
                  <ConfigTextField
                    name='storehouseApiUrl'
                    label='StoreHouse API URL'
                    placeholder='http://saturn.carbis.ru:6067'
                  />
                  <ConfigTextField
                    name='storehouseUsername'
                    label='StoreHouse логин'
                    placeholder='Admin'
                  />
                  <ConfigTextField
                    name='storehousePassword'
                    label='StoreHouse пароль'
                    type='password'
                    placeholder='Введите пароль'
                  />
                  <ConfigTextField
                    name='storehouseRequestTimeoutSeconds'
                    label='StoreHouse timeout, сек'
                    type='number'
                    min={5}
                    step='1'
                    required
                  />
                  <ConfigTextField
                    name='storehouseRptSalePeriodDays'
                    label='RptSale период, дней'
                    type='number'
                    min={1}
                    step='1'
                    required
                  />
                  <ConfigSelectField
                    name='writeMode'
                    label='Режим записи'
                    options={writeModeOptions.map((item) => ({
                      value: item.value,
                      label: item.label
                    }))}
                    required
                  />
                </div>

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
              <CardDescription>Запускает живой `rkeeper_etl` FastAPI сервис.</CardDescription>
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
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => {
                        syncForm.setFieldValue('kind', 'storehouse');
                        syncMutation.mutate({ kind: 'storehouse', dateFrom: '', dateTo: '' });
                      }}
                      isLoading={syncMutation.isPending && syncKind === 'storehouse'}
                    >
                      StoreHouse
                    </Button>
                  </div>
                </syncForm.Form>
              </syncForm.AppForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Статус ETL сервиса</CardTitle>
              <CardDescription>Проверка доступности Python/FastAPI сервиса.</CardDescription>
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

              <pre className='bg-muted overflow-auto rounded-md p-4 text-xs'>
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
              <CardTitle>Что уже перенесено</CardTitle>
              <CardDescription>Этот экран управляет живым Python ETL и его shared-конфигом.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-2 text-sm text-muted-foreground'>
              <p>Ручной запуск идёт напрямую в `rkeeper_etl` по HTTP.</p>
              <p>Плановый запуск читает `intervalSeconds` из общей SQLite `dashboard_settings`.</p>
              <p>StoreHouse `RptSale` складывается в таблицу `rkeeper_menu_item_cost` с кодом блюда RK7 и себестоимостью.</p>
              <p>Статус показывает живой runtime и effective config сервиса.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
