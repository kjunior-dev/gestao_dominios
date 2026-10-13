'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { ThemeProvider, useTheme } from 'next-themes';
import { Toaster } from 'sonner';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@devtrust/ui';
export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const handle = () => router.replace('/login');
    window.addEventListener('devtrust:unauthorized', handle);
    return () => window.removeEventListener('devtrust:unauthorized', handle);
  }, [router]);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
      <Notifications />
    </ThemeProvider>
  );
}
const subscribe = () => () => {};
function Notifications() {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const { resolvedTheme } = useTheme();
  return mounted ? (
    <Toaster
      richColors
      position="top-right"
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
    />
  ) : null;
}
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      aria-label="Alternar tema"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Sun size={18} className="dark:hidden" />
      <Moon size={18} className="hidden dark:block" />
    </Button>
  );
}
