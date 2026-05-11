'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import PageContainer from '@/components/layout/page-container';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';

type Notebook = { id: string; name: string; description: string | null };

type NotebooksResponse = {
  notebooks: Notebook[];
  defaultNotebookId: string | null;
};

type CreateNotebookResponse = {
  notebook: Notebook;
};

type SourceItem = {
  id: string;
  title: string | null;
  embedded: boolean;
  embedded_chunks: number | null;
  created: string | null;
  status: string | null;
  command_id: string | null;
};

type SourcesResponse = {
  sources: SourceItem[];
};

type UploadResult = {
  fileName: string;
  ok: boolean;
  status: number;
  result?: unknown;
  error?: string;
};

async function fetchNotebooks(): Promise<NotebooksResponse> {
  const res = await fetch('/api/open_notebook/notebooks', { cache: 'no-store' });
  const json = (await res.json()) as unknown;
  if (!res.ok) {
    const message =
      typeof json === 'object' && json && 'error' in json ? String((json as any).error) : null;
    throw new Error(message || `API error: ${res.status} ${res.statusText}`);
  }
  return json as NotebooksResponse;
}

async function createNotebook(payload: {
  name: string;
  description: string;
}): Promise<CreateNotebookResponse> {
  const res = await fetch('/api/open_notebook/notebooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store'
  });
  const json = (await res.json()) as unknown;
  if (!res.ok) {
    const message =
      typeof json === 'object' && json && 'error' in json ? String((json as any).error) : null;
    throw new Error(message || `API error: ${res.status} ${res.statusText}`);
  }
  return json as CreateNotebookResponse;
}

async function fetchSources(notebookId: string): Promise<SourcesResponse> {
  const res = await fetch(
    `/api/open_notebook/sources?notebookId=${encodeURIComponent(notebookId)}`,
    {
      cache: 'no-store'
    }
  );
  const json = (await res.json()) as unknown;
  if (!res.ok) {
    const message =
      typeof json === 'object' && json && 'error' in json ? String((json as any).error) : null;
    throw new Error(message || `API error: ${res.status} ${res.statusText}`);
  }
  return json as SourcesResponse;
}

async function uploadFiles(
  notebookId: string,
  files: FileList
): Promise<{ results: UploadResult[] }> {
  const body = new FormData();
  body.set('notebookId', notebookId);
  Array.from(files).forEach((file) => body.append('files', file, file.name));

  const res = await fetch('/api/open_notebook/upload', {
    method: 'POST',
    body,
    cache: 'no-store'
  });
  const json = (await res.json()) as unknown;
  if (!res.ok) {
    const message =
      typeof json === 'object' && json && 'error' in json ? String((json as any).error) : null;
    throw new Error(message || `API error: ${res.status} ${res.statusText}`);
  }
  return json as { results: UploadResult[] };
}

async function deleteNotebook(notebookId: string): Promise<{ ok: true }> {
  const res = await fetch(`/api/open_notebook/notebooks/${encodeURIComponent(notebookId)}`, {
    method: 'DELETE',
    cache: 'no-store'
  });
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const message =
      typeof json === 'object' && json && 'error' in json ? String((json as any).error) : null;
    throw new Error(message || `API error: ${res.status} ${res.statusText}`);
  }
  return { ok: true };
}

async function deleteSource(notebookId: string, sourceId: string): Promise<{ ok: true }> {
  const res = await fetch(
    `/api/open_notebook/sources/${encodeURIComponent(sourceId)}?notebookId=${encodeURIComponent(
      notebookId
    )}`,
    {
      method: 'DELETE',
      cache: 'no-store'
    }
  );
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const message =
      typeof json === 'object' && json && 'error' in json ? String((json as any).error) : null;
    throw new Error(message || `API error: ${res.status} ${res.statusText}`);
  }
  return { ok: true };
}

export default function KnowledgeBaseSettingsPage() {
  const [selectedNotebookId, setSelectedNotebookId] = React.useState<string>('');
  const [newNotebookName, setNewNotebookName] = React.useState('База знаний');
  const [newNotebookDescription, setNewNotebookDescription] = React.useState('');
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteSourceOpen, setDeleteSourceOpen] = React.useState(false);
  const [sourceToDelete, setSourceToDelete] = React.useState<SourceItem | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [lastResults, setLastResults] = React.useState<UploadResult[] | null>(null);

  const notebooksQuery = useQuery({
    queryKey: ['open-notebook', 'notebooks'],
    queryFn: fetchNotebooks,
    staleTime: 15_000
  });

  React.useEffect(() => {
    const notebooks = notebooksQuery.data?.notebooks ?? [];
    if (notebooks.length === 0) {
      setSelectedNotebookId('');
      return;
    }
    const preferred =
      (notebooksQuery.data?.defaultNotebookId &&
        notebooks.some((n) => n.id === notebooksQuery.data?.defaultNotebookId) &&
        notebooksQuery.data.defaultNotebookId) ||
      notebooks[0]?.id ||
      '';
    setSelectedNotebookId((prev) => (prev ? prev : preferred));
  }, [notebooksQuery.data?.defaultNotebookId, notebooksQuery.data?.notebooks]);

  const createNotebookMutation = useMutation({
    mutationFn: (payload: { name: string; description: string }) => createNotebook(payload),
    onSuccess: (data) => {
      toast.success('Блокнот создан');
      setSelectedNotebookId(data.notebook.id);
      setLastResults(null);
      void notebooksQuery.refetch();
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const sourcesQuery = useQuery({
    queryKey: ['open-notebook', 'sources', selectedNotebookId],
    queryFn: () => fetchSources(selectedNotebookId),
    enabled: Boolean(selectedNotebookId),
    staleTime: 5_000
  });

  const uploadMutation = useMutation({
    mutationFn: async (payload: { notebookId: string; files: FileList }) =>
      uploadFiles(payload.notebookId, payload.files),
    onSuccess: (data) => {
      setLastResults(data.results);
      const okCount = data.results.filter((r) => r.ok).length;
      toast.success(`Загружено: ${okCount}/${data.results.length}`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      void sourcesQuery.refetch();
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const deleteNotebookMutation = useMutation({
    mutationFn: (notebookId: string) => deleteNotebook(notebookId),
    onSuccess: () => {
      toast.success('Блокнот удалён');
      setDeleteOpen(false);
      setLastResults(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      void notebooksQuery.refetch().then((res) => {
        const nextId = res.data?.defaultNotebookId || res.data?.notebooks?.[0]?.id || '';
        setSelectedNotebookId(nextId);
      });
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const deleteSourceMutation = useMutation({
    mutationFn: (payload: { notebookId: string; sourceId: string }) =>
      deleteSource(payload.notebookId, payload.sourceId),
    onSuccess: () => {
      toast.success('Документ удалён');
      setDeleteSourceOpen(false);
      setSourceToDelete(null);
      void sourcesQuery.refetch();
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const notebookItems = notebooksQuery.data?.notebooks ?? [];
  const sources = sourcesQuery.data?.sources ?? [];

  const formattedSources = React.useMemo(() => {
    return sources.toSorted((a, b) =>
      String(b.created ?? '').localeCompare(String(a.created ?? ''))
    );
  }, [sources]);

  return (
    <PageContainer
      pageTitle='База знаний'
      pageDescription='Загрузите документы, чтобы они появились в Open Notebook.'
    >
      <div className='grid gap-4'>
        <Card>
          <CardHeader>
            <CardTitle>Open Notebook</CardTitle>
            <CardDescription>
              Интерфейс Open Notebook доступен по адресу{' '}
              <a
                className='text-primary underline underline-offset-4'
                href='http://localhost:8502'
                target='_blank'
                rel='noreferrer'
              >
                http://localhost:8502
              </a>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {notebooksQuery.isError ? (
              <div className='text-sm text-destructive'>
                {notebooksQuery.error instanceof Error
                  ? notebooksQuery.error.message
                  : 'Не удалось получить список блокнотов.'}
              </div>
            ) : null}

            <div className='grid gap-4 md:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='create-notebook-name'>Название блокнота</Label>
                <Input
                  id='create-notebook-name'
                  value={newNotebookName}
                  onChange={(e) => setNewNotebookName(e.target.value)}
                  disabled={createNotebookMutation.isPending}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='create-notebook-description'>Описание</Label>
                <Textarea
                  id='create-notebook-description'
                  value={newNotebookDescription}
                  onChange={(e) => setNewNotebookDescription(e.target.value)}
                  disabled={createNotebookMutation.isPending}
                  className='min-h-[40px]'
                />
              </div>
              <div className='md:col-span-2'>
                <Button
                  type='button'
                  variant='outline'
                  isLoading={createNotebookMutation.isPending}
                  disabled={createNotebookMutation.isPending || newNotebookName.trim().length === 0}
                  onClick={() =>
                    createNotebookMutation.mutate({
                      name: newNotebookName.trim(),
                      description: newNotebookDescription.trim()
                    })
                  }
                >
                  Создать блокнот
                </Button>
              </div>
            </div>

            <div className='grid gap-4 md:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='notebook'>Блокнот</Label>
                <Select
                  value={selectedNotebookId}
                  onValueChange={setSelectedNotebookId}
                  disabled={notebooksQuery.isLoading || notebookItems.length === 0}
                >
                  <SelectTrigger id='notebook' className='w-full'>
                    <SelectValue
                      placeholder={notebooksQuery.isLoading ? 'Загрузка…' : 'Выберите блокнот'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {notebookItems.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='flex items-end justify-start md:justify-end'>
                <Button
                  type='button'
                  variant='destructive'
                  disabled={
                    !selectedNotebookId ||
                    deleteNotebookMutation.isPending ||
                    notebooksQuery.isLoading
                  }
                  onClick={() => setDeleteOpen(true)}
                >
                  Удалить блокнот
                </Button>
              </div>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='files'>Документы</Label>
              <Input
                ref={fileInputRef}
                id='files'
                type='file'
                multiple
                disabled={
                  uploadMutation.isPending || notebookItems.length === 0 || !selectedNotebookId
                }
              />
              <div className='flex flex-wrap items-center gap-3'>
                <Button
                  type='button'
                  isLoading={uploadMutation.isPending}
                  disabled={
                    uploadMutation.isPending || notebookItems.length === 0 || !selectedNotebookId
                  }
                  onClick={() => {
                    const files = fileInputRef.current?.files;
                    if (!files || files.length === 0) {
                      toast.error('Выберите файлы для загрузки');
                      return;
                    }
                    uploadMutation.mutate({ notebookId: selectedNotebookId, files });
                  }}
                >
                  Загрузить
                </Button>
                <a
                  href='http://localhost:5055/docs'
                  target='_blank'
                  rel='noreferrer'
                  className='text-sm text-muted-foreground underline underline-offset-4'
                >
                  API Open Notebook (/docs)
                </a>
              </div>
            </div>

            {lastResults ? (
              <div className='space-y-2'>
                <div className='text-sm font-medium'>Результат загрузки</div>
                <div className='space-y-1'>
                  {lastResults.map((r) => (
                    <div key={r.fileName} className='text-sm'>
                      <span className={r.ok ? 'text-foreground' : 'text-destructive'}>
                        {r.ok ? 'OK' : 'Ошибка'}
                      </span>{' '}
                      <span className='text-muted-foreground'>—</span> {r.fileName}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className='space-y-2'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='text-sm font-medium'>Загруженные документы</div>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={!selectedNotebookId || sourcesQuery.isLoading}
                  onClick={() => sourcesQuery.refetch()}
                >
                  Обновить
                </Button>
              </div>

              {!selectedNotebookId ? (
                <div className='text-sm text-muted-foreground'>Создайте или выберите блокнот.</div>
              ) : sourcesQuery.isError ? (
                <div className='text-sm text-destructive'>
                  {sourcesQuery.error instanceof Error
                    ? sourcesQuery.error.message
                    : 'Не удалось получить список документов.'}
                </div>
              ) : formattedSources.length === 0 ? (
                <div className='text-sm text-muted-foreground'>Документов пока нет.</div>
              ) : (
                <div className='rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Документ</TableHead>
                        <TableHead>Статус</TableHead>
                        <TableHead className='text-right'>Чанков</TableHead>
                        <TableHead className='text-right'>Создан</TableHead>
                        <TableHead className='text-right'>Действия</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {formattedSources.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className='max-w-[520px] truncate'>
                            {s.title ?? s.id}
                          </TableCell>
                          <TableCell className='text-muted-foreground'>
                            {s.status ?? (s.embedded ? 'embedded' : '—')}
                          </TableCell>
                          <TableCell className='text-right tabular-nums'>
                            {s.embedded_chunks ?? '—'}
                          </TableCell>
                          <TableCell className='text-right tabular-nums'>
                            {s.created ?? '—'}
                          </TableCell>
                          <TableCell className='text-right'>
                            <Button
                              type='button'
                              variant='ghost'
                              size='icon'
                              className='text-destructive hover:text-destructive'
                              disabled={!selectedNotebookId || deleteSourceMutation.isPending}
                              onClick={() => {
                                setSourceToDelete(s);
                                setDeleteSourceOpen(true);
                              }}
                              aria-label='Удалить документ'
                            >
                              <Icons.trash className='h-4 w-4' />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить блокнот?</AlertDialogTitle>
            <AlertDialogDescription>
              Блокнот и связанные источники будут удалены из Open Notebook. Действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteNotebookMutation.isPending}>
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              disabled={deleteNotebookMutation.isPending}
              onClick={() => {
                if (!selectedNotebookId) return;
                deleteNotebookMutation.mutate(selectedNotebookId);
              }}
            >
              {deleteNotebookMutation.isPending ? 'Удаление…' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteSourceOpen}
        onOpenChange={(open) => {
          setDeleteSourceOpen(open);
          if (!open) setSourceToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить документ?</AlertDialogTitle>
            <AlertDialogDescription>
              Документ будет удалён из Open Notebook. Действие необратимо.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSourceMutation.isPending}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              disabled={deleteSourceMutation.isPending}
              onClick={() => {
                if (!selectedNotebookId || !sourceToDelete) return;
                deleteSourceMutation.mutate({
                  notebookId: selectedNotebookId,
                  sourceId: sourceToDelete.id
                });
              }}
            >
              {deleteSourceMutation.isPending ? 'Удаление…' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
