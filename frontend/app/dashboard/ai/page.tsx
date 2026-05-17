import { redirect } from 'next/navigation';

export default function LegacyAiPage() {
  redirect('/dashboard/scanner');
}
