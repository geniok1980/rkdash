'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HermesSkillRow, HermesStatus, HermesTelegramAgent } from '@/types/hermes';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Icons } from '@/components/icons';
import { toast } from 'sonner';
import { useState } from 'react';

function normalizeSkillsPayload(data: unknown): HermesSkillRow[] {
  if (Array.isArray(data)) return data as HermesSkillRow[];
  if (data && typeof data === 'object' && Array.isArray((data as { skills?: unknown }).skills)) {
    return (data as { skills: HermesSkillRow[] }).skills;
  }
  return [];
}

function AgentSkillsBlock({ agentId }: { agentId: string }) {
  const qc = useQueryClient();
  const [zip, setZip] = useState<File | null>(null);
  const [folderName, setFolderName] = useState('');

  const skillsQ = useQuery({
    queryKey: ['hermes', 'agent-skills', agentId],
    queryFn: async () => {
      const res = await fetch(`/api/hermes/agents/${agentId}/skills`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
      return normalizeSkillsPayload(data) as Array<HermesSkillRow & { folder?: string }>;
    }
  });

  const installM = useMutation({
    mutationFn: async () => {
      if (!zip) throw new Error('Выбери zip-архив.');
      const form = new FormData();
      form.set('zip', zip);
      if (folderName.trim()) form.set('folderName', folderName.trim());

      const res = await fetch(`/api/hermes/agents/${agentId}/skills`, {
        method: 'POST',
        body: form
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
      return data as { folder?: string };
    },
    onSuccess: (data) => {
      toast.success(`Skill установлен: ${data.folder || 'ok'}`);
      setZip(null);
      setFolderName('');
      qc.invalidateQueries({ queryKey: ['hermes', 'agent-skills', agentId] });
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const uninstallM = useMutation({
    mutationFn: async (folder: string) => {
      const res = await fetch(`/api/hermes/agents/${agentId}/skills`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderName: folder })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
      return data;
    },
    onSuccess: () => {
      toast.success('Skill удалён у этого агента');
      qc.invalidateQueries({ queryKey: ['hermes', 'agent-skills', agentId] });
    },
    onError: (e: Error) => toast.error(e.message)
  });

  return (
    <div className='mt-3 space-y-3 rounded-lg border border-dashed p-3'>
      <div className='flex items-center justify-between gap-2'>
        <div className='text-sm font-medium'>Skills этого агента</div>
        {skillsQ.isFetching ? <Icons.spinner className='h-4 w-4 animate-spin' /> : null}
      </div>

      <div className='grid gap-2 md:grid-cols-[1fr_auto]'>
        <Input
          placeholder='Имя skill (опционально)'
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
        />
        <Input
          type='file'
          accept='.zip,application/zip'
          onChange={(e) => setZip(e.target.files?.[0] || null)}
        />
      </div>
      <Button
        type='button'
        size='sm'
        disabled={!zip || installM.isPending}
        onClick={() => installM.mutate()}
      >
        {installM.isPending ? <Icons.spinner className='h-4 w-4 animate-spin' /> : null}
        Установить skill этому агенту
      </Button>

      {skillsQ.isLoading ? (
        <Icons.spinner className='h-4 w-4 animate-spin' />
      ) : skillsQ.data?.length ? (
        <div className='space-y-2'>
          {skillsQ.data.map((skill) => {
            const name = String(skill.name || '');
            const folder = typeof skill.folder === 'string' ? skill.folder : '';
            if (!name) return null;
            return (
              <div key={`${name}-${folder}`} className='rounded border p-2'>
                <div className='flex items-center justify-between gap-2'>
                  <div className='text-sm font-medium'>{name}</div>
                  {folder ? (
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      disabled={uninstallM.isPending}
                      onClick={() => uninstallM.mutate(folder)}
                    >
                      Удалить
                    </Button>
                  ) : (
                    <Badge variant='secondary'>read-only</Badge>
                  )}
                </div>
                {skill.description ? (
                  <div className='text-muted-foreground text-xs'>{String(skill.description)}</div>
                ) : null}
                {folder ? (
                  <div className='text-muted-foreground text-xs'>folder: {folder}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className='text-muted-foreground text-xs'>Пока нет skills у этого агента.</p>
      )}
    </div>
  );
}

export function HermesPanel() {
  const qc = useQueryClient();
  const [skillZip, setSkillZip] = useState<File | null>(null);
  const [skillFolder, setSkillFolder] = useState('');
  const [agentName, setAgentName] = useState('');
  const [agentToken, setAgentToken] = useState('');
  const [agentChatId, setAgentChatId] = useState('');

  const statusQ = useQuery({
    queryKey: ['hermes', 'status'],
    queryFn: async () => {
      const res = await fetch('/api/hermes/status');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
      return data as HermesStatus;
    },
    retry: 1,
    refetchInterval: 15_000
  });

  const skillsQ = useQuery({
    queryKey: ['hermes', 'skills'],
    queryFn: async () => {
      const res = await fetch('/api/hermes/skills');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
      return normalizeSkillsPayload(data);
    },
    enabled: statusQ.isSuccess
  });

  const agentsQ = useQuery({
    queryKey: ['hermes', 'agents'],
    queryFn: async () => {
      const res = await fetch('/api/hermes/agents');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
      return ((data as { agents?: HermesTelegramAgent[] }).agents || []) as HermesTelegramAgent[];
    },
    enabled: statusQ.isSuccess
  });

  const uploadSkillM = useMutation({
    mutationFn: async () => {
      if (!skillZip) {
        throw new Error('Выбери zip-архив.');
      }
      const form = new FormData();
      form.set('zip', skillZip);
      if (skillFolder.trim()) {
        form.set('folderName', skillFolder.trim());
      }
      const res = await fetch('/api/hermes/skills', {
        method: 'POST',
        body: form
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
      return data as { path?: string; folder?: string };
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['hermes', 'skills'] });
      toast.success(`Skill записан: ${d.folder || 'ok'}`);
      setSkillZip(null);
      setSkillFolder('');
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const updateHermesM = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/hermes/update', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !(data as { ok?: boolean }).ok) {
        throw new Error((data as { error?: string }).error || 'update failed');
      }
      return data as { log?: string };
    },
    onSuccess: () => {
      toast.success('hermes update завершён');
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const createAgentM = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/hermes/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agentName,
          telegramBotToken: agentToken,
          chatId: agentChatId
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
      return data;
    },
    onSuccess: () => {
      toast.success('Агент создан');
      setAgentName('');
      setAgentToken('');
      setAgentChatId('');
      qc.invalidateQueries({ queryKey: ['hermes', 'agents'] });
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const deleteAgentM = useMutation({
    mutationFn: async (agentId: string) => {
      const res = await fetch(`/api/hermes/agents/${agentId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
      return data;
    },
    onSuccess: () => {
      toast.success('Агент удален');
      qc.invalidateQueries({ queryKey: ['hermes', 'agents'] });
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const startAgentM = useMutation({
    mutationFn: async (agentId: string) => {
      const res = await fetch(`/api/hermes/agents/${agentId}/start`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
      return data;
    },
    onSuccess: () => {
      toast.success('Агент запущен');
      qc.invalidateQueries({ queryKey: ['hermes', 'agents'] });
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const stopAgentM = useMutation({
    mutationFn: async (agentId: string) => {
      const res = await fetch(`/api/hermes/agents/${agentId}/stop`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
      return data;
    },
    onSuccess: () => {
      toast.success('Агент остановлен');
      qc.invalidateQueries({ queryKey: ['hermes', 'agents'] });
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const connErr = statusQ.error instanceof Error ? statusQ.error.message : null;

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex flex-wrap items-center gap-2'>
          {statusQ.isFetching ? <Icons.spinner className='h-4 w-4 animate-spin' /> : null}
          <Badge variant={statusQ.isSuccess ? 'default' : 'secondary'}>
            {statusQ.isSuccess ? `Hermes ${(statusQ.data?.version as string) || 'ok'}` : '…'}
          </Badge>
          {statusQ.data?.gateway && typeof statusQ.data.gateway === 'object' ? (
            <Badge variant='outline'>
              gateway:{' '}
              {(statusQ.data.gateway as { running?: boolean }).running ? 'running' : 'stopped'}
            </Badge>
          ) : null}
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['hermes'] });
            }}
          >
            <Icons.settings className='mr-1 h-4 w-4' />
            Обновить данные
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                disabled={updateHermesM.isPending}
              >
                {updateHermesM.isPending ? (
                  <Icons.spinner className='h-4 w-4 animate-spin' />
                ) : null}
                hermes update (CLI)
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Обновить агента сейчас?</AlertDialogTitle>
                <AlertDialogDescription>Процесс может занять 1-3 минуты.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction onClick={() => updateHermesM.mutate()}>
                  Запустить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {connErr ? (
        <Card>
          <CardHeader>
            <CardTitle>Не удалось подключиться к Hermes</CardTitle>
            <CardDescription>{connErr}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Hermes Telegram агенты</CardTitle>
          <CardDescription>
            Создай отдельного агента и задай ему Telegram Bot API token + chat_id.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-3 md:grid-cols-3'>
            <div className='space-y-2'>
              <Label htmlFor='agent-name'>Имя агента</Label>
              <Input
                id='agent-name'
                placeholder='sales-assistant'
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='agent-token'>Telegram Bot API token</Label>
              <Input
                id='agent-token'
                type='password'
                placeholder='123456:ABC...'
                value={agentToken}
                onChange={(e) => setAgentToken(e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='agent-chat-id'>chat_id</Label>
              <Input
                id='agent-chat-id'
                placeholder='-1001234567890'
                value={agentChatId}
                onChange={(e) => setAgentChatId(e.target.value)}
              />
            </div>
          </div>
          <Button
            type='button'
            disabled={
              createAgentM.isPending ||
              !agentName.trim() ||
              !agentToken.trim() ||
              !agentChatId.trim()
            }
            onClick={() => createAgentM.mutate()}
          >
            {createAgentM.isPending ? <Icons.spinner className='h-4 w-4 animate-spin' /> : null}
            Создать агента
          </Button>

          <div className='space-y-2'>
            {agentsQ.isLoading ? (
              <Icons.spinner className='h-5 w-5 animate-spin' />
            ) : agentsQ.data?.length ? (
              agentsQ.data.map((agent) => (
                <div key={agent.id} className='rounded-lg border p-3'>
                  <div className='flex items-center justify-between gap-2'>
                    <div className='font-medium'>{agent.name}</div>
                    <div className='flex gap-2'>
                      {agent.runtime?.status === 'running' ? (
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          disabled={stopAgentM.isPending}
                          onClick={() => stopAgentM.mutate(agent.id)}
                        >
                          Остановить
                        </Button>
                      ) : (
                        <Button
                          type='button'
                          variant='default'
                          size='sm'
                          disabled={startAgentM.isPending}
                          onClick={() => startAgentM.mutate(agent.id)}
                        >
                          Запустить этого агента в Telegram
                        </Button>
                      )}
                      <Button
                        type='button'
                        variant='destructive'
                        size='sm'
                        disabled={deleteAgentM.isPending}
                        onClick={() => deleteAgentM.mutate(agent.id)}
                      >
                        Удалить
                      </Button>
                    </div>
                  </div>
                  <div className='text-muted-foreground mt-1 text-sm'>
                    token: {agent.telegramBotTokenMasked}
                  </div>
                  <div className='text-muted-foreground text-sm'>chat_id: {agent.chatId}</div>
                  <div className='text-muted-foreground text-sm'>
                    статус: {agent.runtime?.status === 'running' ? 'running' : 'stopped'}
                    {agent.runtime?.pid ? ` (pid ${agent.runtime.pid})` : ''}
                  </div>
                  <AgentSkillsBlock agentId={agent.id} />
                </div>
              ))
            ) : (
              <p className='text-muted-foreground text-sm'>Пока нет созданных агентов.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Установленные skills</CardTitle>
          <CardDescription>Вот что уже установлено у агента.</CardDescription>
        </CardHeader>
        <CardContent>
          {skillsQ.isLoading ? (
            <Icons.spinner className='h-6 w-6 animate-spin' />
          ) : skillsQ.error ? (
            <p className='text-destructive text-sm'>Не удалось загрузить список skills</p>
          ) : (
            <ScrollArea className='h-[min(420px,50vh)] pr-4'>
              <div className='space-y-3'>
                {skillsQ.data?.length ? (
                  skillsQ.data.map((s, index) => {
                    const id = String((s as { id?: string }).id || '');
                    const name = String(s.name || id || '');
                    if (!name) return null;
                    const key = id ? id : `${name}-${index}`;
                    return (
                      <div key={key} className='rounded-lg border p-3'>
                        <div className='flex items-center justify-between gap-2'>
                          <div className='font-medium'>{name}</div>
                          <Badge variant='outline'>Установлен</Badge>
                        </div>
                        {s.description ? (
                          <div className='text-muted-foreground mt-1 text-sm'>
                            {String(s.description)}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <p className='text-muted-foreground text-sm'>Пока skills не установлены.</p>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Загрузить skill</CardTitle>
          <CardDescription>Выбери ZIP-архив навыка и нажми кнопку установки.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='space-y-2'>
            <Label htmlFor='skill-folder'>Имя skill (опционально)</Label>
            <Input
              id='skill-folder'
              placeholder='my-skill'
              value={skillFolder}
              onChange={(e) => setSkillFolder(e.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='skill-zip'>ZIP архив навыка</Label>
            <Input
              id='skill-zip'
              type='file'
              accept='.zip,application/zip'
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setSkillZip(file);
              }}
            />
            {skillZip ? (
              <p className='text-muted-foreground text-xs'>Выбрано: {skillZip.name}</p>
            ) : null}
          </div>
          <Button
            type='button'
            disabled={uploadSkillM.isPending || !skillZip}
            onClick={() => uploadSkillM.mutate()}
          >
            {uploadSkillM.isPending ? <Icons.spinner className='h-4 w-4 animate-spin' /> : null}
            Установить skill из ZIP
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
