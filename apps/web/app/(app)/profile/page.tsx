import { api } from '@/lib/api';
import type { Me } from '@/lib/types';
import { PageHeader, PageShell } from '@/components/ui';
import { ProfileForm } from '@/components/profile-form';

export const metadata = { title: 'Profile' };

export default async function ProfilePage() {
  const me = await api<Me>('/api/auth/me');
  return (
    <PageShell>
      <PageHeader
        eyebrow="Candidate profile"
        title="Your source of truth"
        description="The AI may reorder and rewrite, but it cannot invent experience, skills, metrics, or authorization. Keep this accurate."
      />
      <ProfileForm
        profile={me.profile}
        email={me.user.email}
        name={me.user.name ?? me.user.email.split('@')[0] ?? 'Candidate'}
      />
    </PageShell>
  );
}
