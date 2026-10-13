import { PublicShell } from '@/components/public-shell';
import { DomainSearch } from '@/features/domains/domain-search';
import { PageHeader } from '@devtrust/ui';
export default function Page() {
  return (
    <PublicShell>
      <main className="section container">
        <PageHeader
          title="Encontre o domínio da sua próxima ideia"
          description="Compare extensões e prepare o seu carrinho, com preços em escudos cabo-verdianos."
        />
        <DomainSearch />
      </main>
    </PublicShell>
  );
}
