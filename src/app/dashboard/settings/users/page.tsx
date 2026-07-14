'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import PageContainer from '@/components/layout/page-container';

type AuthUser = {
  id: number;
  email: string;
  name: string;
  role: string;
  created_at: string;
};

export default function UsersSettingsPage() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editUser, setEditUser] = useState<AuthUser | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'admin' });
  const [saving, setSaving] = useState(false);

  async function loadUsers() {
    try {
      const res = await fetch('/api/auth/users');
      if (!res.ok) throw new Error('Failed to load users');
      setUsers(await res.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  function openCreate() {
    setEditUser(null);
    setForm({ name: '', email: '', password: '', role: 'admin' });
    setOpen(true);
  }

  function openEdit(u: AuthUser) {
    setEditUser(u);
    setForm({ name: u.name, email: u.email, password: '', role: u.role });
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editUser) {
        const body: Record<string, string> = { name: form.name, email: form.email, role: form.role };
        if (form.password) body.password = form.password;
        const res = await fetch(`/api/auth/users/${editUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Update failed');
      } else {
        const res = await fetch('/api/auth/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form)
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Create failed');
      }
      setOpen(false);
      await loadUsers();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this user?')) return;
    try {
      const res = await fetch(`/api/auth/users/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
      await loadUsers();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <PageContainer pageTitle='Пользователи' pageDescription='Управление доступом к RKDash.'>
      <div className='space-y-4'>
        {error && (
          <div className='rounded-md bg-destructive/15 p-3 text-sm text-destructive'>{error}</div>
        )}

        <div className='flex items-center justify-between'>
          <p className='text-muted-foreground text-sm'>{users.length} пользователей</p>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>+ Создать</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editUser ? 'Редактировать' : 'Создать'} пользователя</DialogTitle>
                <DialogDescription>
                  {editUser ? 'Измените данные. Оставьте пароль пустым, чтобы не менять.' : 'Новый пользователь для входа в RKDash.'}
                </DialogDescription>
              </DialogHeader>
              <div className='space-y-3'>
                <div className='space-y-1'>
                  <Label>Имя</Label>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className='space-y-1'>
                  <Label>Email</Label>
                  <Input type='email' value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className='space-y-1'>
                  <Label>Пароль {editUser && '(оставьте пустым без изменений)'}</Label>
                  <Input type='password' value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                </div>
                <div className='space-y-1'>
                  <Label>Роль</Label>
                  <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value='admin'>Админ</SelectItem>
                      <SelectItem value='manager'>Менеджер</SelectItem>
                      <SelectItem value='viewer'>Наблюдатель</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant='outline' onClick={() => setOpen(false)}>Отмена</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <p className='text-muted-foreground'>Загрузка...</p>
        ) : users.length === 0 ? (
          <p className='text-muted-foreground'>Нет пользователей.</p>
        ) : (
          <div className='space-y-2'>
            {users.map(u => (
              <Card key={u.id}>
                <CardHeader className='py-3'>
                  <div className='flex items-center justify-between'>
                    <div>
                      <CardTitle className='text-base'>{u.name}</CardTitle>
                      <CardDescription>{u.email}</CardDescription>
                    </div>
                    <div className='flex items-center gap-2'>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      }`}>
                        {u.role}
                      </span>
                      <Button variant='ghost' size='sm' onClick={() => openEdit(u)}>✎</Button>
                      <Button variant='ghost' size='sm' onClick={() => handleDelete(u.id)}>✕</Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
