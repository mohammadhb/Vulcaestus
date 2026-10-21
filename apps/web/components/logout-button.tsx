'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { postJson } from '@/lib/client';
import { Button } from './ui';

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await postJson('/api/auth/logout');
        } finally {
          router.push('/login');
          router.refresh();
        }
      }}
      title="Sign out"
    >
      <LogOut className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Sign out</span>
    </Button>
  );
}
