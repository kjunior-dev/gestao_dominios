import { PublicShell } from '@/components/public-shell';
import { Card, PageHeader } from '@devtrust/ui';
export default function Page() {
  return (
    <PublicShell>
      <main className="container section-gap">
        <PageHeader title="Termos da encomenda de desenvolvimento" />
        <Card>
          <p>
            A plataforma opera por padrão com pagamentos mock e registos
            desativados. Uma simulação não movimenta dinheiro nem compra um
            domínio.
          </p>
          <p>
            O preço apresentado deve ser confirmado no checkout. A
            disponibilidade só pode ser confirmada pelo registrador no momento
            do registo. Pagamento confirmado não implica domínio registado.
          </p>
          <p>
            Taxas premium superiores à cotação autorizada bloqueiam o registo.
            Pedidos incertos exigem reconciliação e podem necessitar de
            intervenção administrativa.
          </p>
          <p>
            Pedidos de reembolso são analisados separadamente e não representam
            reembolsos concluídos. Os documentos emitidos são comprovativos
            internos sem validade fiscal.
          </p>
          <p>
            Os contactos de titularidade serão utilizados para o pedido de
            registo e contacto pelo registrador. Antes de ativar vendas reais, a
            DevTrust deve publicar termos comerciais, política de privacidade e
            condições específicas dos TLDs validados.
          </p>
        </Card>
      </main>
    </PublicShell>
  );
}
