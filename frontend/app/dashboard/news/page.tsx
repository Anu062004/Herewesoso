import { redirect } from 'next/navigation';

export default function LegacyNewsPage() {
  redirect('/dashboard/signals');
}
