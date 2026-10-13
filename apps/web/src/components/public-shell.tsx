import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@devtrust/ui';
import { ThemeToggle } from './providers';
import { Brand } from './brand';
import { getUser } from '@/lib/server-auth';
export async function PublicShell({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return (
    <>
      <header className="public-header">
        <div className="container">
          <Brand />
          <nav className="public-nav" aria-label="Navegação principal">
            <Link href="/dominios">Domínios</Link>
            <Link href="/precos">Preços</Link>
            <Link href="/#vantagens">Porquê DevTrust</Link>
          </nav>
          <div className="actions">
            <ThemeToggle />
            <Link href="/carrinho">Carrinho</Link>
            {user ? (
              <Button asChild>
                <Link href="/dashboard">Minha conta</Link>
              </Button>
            ) : (
              <>
                <Link href="/login">Entrar</Link>
                <Button asChild className="header-register">
                  <Link href="/registar">
                    Criar conta <ArrowUpRight size={16} />
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      {children}
      <footer className="footer">
        <div className="container">
          <Brand />
          <p>© {new Date().getFullYear()} DevTrust · Cabo Verde</p>
          <div className="actions">
            <Link href="/precos">Preços</Link>
            <Link href={user ? '/dashboard' : '/login'}>Área do cliente</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
