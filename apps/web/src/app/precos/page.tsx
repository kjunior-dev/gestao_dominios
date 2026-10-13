import { PublicShell } from '@/components/public-shell';
import { Card, EmptyState, PageHeader } from '@devtrust/ui';
export default function Page() {
  return (
    <PublicShell>
      <main className="section container">
        <PageHeader
          title="Preços transparentes, desde o início."
          description="A oferta comercial será publicada após a integração com os fornecedores."
        />
        <Card>
          <EmptyState
            title="Tabela de preços em preparação"
            description="Não existem preços comerciais ativos, pagamentos ou encomendas nesta fase."
          />
        </Card>
      </main>
    </PublicShell>
  );
}
