import Link from 'next/link';
import { ShieldCheck, ArrowUpRight } from 'lucide-react';
import { Button } from '@devtrust/ui';
import { ThemeToggle } from './providers';
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="DevTrust Domains, início">
      <span className="brand-icon">
        <ShieldCheck size={23} />
      </span>
      <span>
        DevTrust<small>DOMAINS</small>
      </span>
    </Link>
  );
}
export function PublicShell({ children }: { children: React.ReactNode }) {
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
            <Link href="/login">Entrar</Link>
            <Button asChild className="header-register">
              <Link href="/registar">
                Criar conta <ArrowUpRight size={16} />
              </Link>
            </Button>
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
            <Link href="/login">Área do cliente</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
