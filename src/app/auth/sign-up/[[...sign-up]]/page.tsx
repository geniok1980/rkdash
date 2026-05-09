import { redirect } from 'next/navigation';

export default function SignUpViewPage() {
  redirect('/dashboard/overview');
  return null;
}
