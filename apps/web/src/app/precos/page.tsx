import { PublicShell } from '@/components/public-shell';
import { TldCatalog } from '@/features/domains/domain-search';
import { PageHeader } from '@devtrust/ui';
export default function Page() {
  return (
    <PublicShell>
      <main className="section container">
        <PageHeader
          title="Preços de domínios"
          description="Preços standard publicados em CVE. Pesquise o domínio para obter uma cotação individual."
        />
        <TldCatalog />
      </main>
    </PublicShell>
  );
}
