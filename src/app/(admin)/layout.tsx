import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/auth-service';

export const instant = false;

export default async function AdminLegacyLayout() {
  const session = await getCurrentSession();
  if (!session || !session.userId) {
    redirect('/login');
  }

  const isSuper = session.roles.includes('super_admin');
  const isLeader =
    session.roles.includes('section_leader') ||
    session.roles.includes('assistant_leader') ||
    session.roles.includes('admin') ||
    session.roles.includes('attendance_leader');

  if (isSuper) {
    redirect('/super-admin');
  }
  if (isLeader) {
    redirect('/leader');
  }
  redirect('/dashboard');
}
