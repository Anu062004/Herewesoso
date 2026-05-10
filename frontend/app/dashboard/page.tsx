import DashboardClient from '@/components/DashboardClient';
import { getDashboardData } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const initialData = await getDashboardData();
  return <DashboardClient initialData={initialData} />;
}
