import { redirect } from 'next/navigation';

export default function LegacyTelegramPage() {
  redirect('/dashboard/alerts');
}
