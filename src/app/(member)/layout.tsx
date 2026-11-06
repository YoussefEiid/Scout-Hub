import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/auth-service';

export const instant = false;

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentSession();
  if (!session || !session.userId) {
    redirect('/login');
  }

  return <>{children}</>;
}
