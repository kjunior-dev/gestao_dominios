import { Card, PageHeader, EmptyState } from '@devtrust/ui';
export default function Page() {
  return (
    <>
      <PageHeader title="As suas encomendas" />
      <Card>
        <EmptyState
          title="Sem registos"
          description="Ainda não existem encomendas. Não são efetuadas compras ou pagamentos nesta fase."
        />
      </Card>
    </>
  );
}
