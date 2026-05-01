import { redirect } from 'next/navigation';

export default function LegacyBlockedProjectsPage() {
  redirect('/blocked');
}