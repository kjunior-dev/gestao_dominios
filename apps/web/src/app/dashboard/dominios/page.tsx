import { Card, PageHeader, EmptyState } from '@devtrust/ui';
export default function Page() {
  return (
    <>
      <PageHeader title="Os seus domínios" />
      <Card>
        <EmptyState
          title="Sem registos"
          description="Ainda não existem registos de domínios. Pesquise um nome para preparar o carrinho."
        />
      </Card>
    </>
  );
}
