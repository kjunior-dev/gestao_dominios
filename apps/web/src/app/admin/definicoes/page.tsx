'use client';
import { PageHeader, Card, Button } from '@devtrust/ui';
import { toast } from 'sonner';
import { useAccount } from '@/hooks/account-context';
import { mutate } from '@/lib/api';
export default function Page() {
  const { user } = useAccount();
  return (
    <>
      <PageHeader
        title="Definições da plataforma"
        description="Estado dos serviços e operação da Fase 1."
      />
      <Card>
        <h3>Fila de notificações</h3>
        <p>
          Transporte de desenvolvimento. Os resultados são escritos numa caixa
          de correio local protegida, sem envio externo.
        </p>
        {user.globalRole === 'SUPER_ADMIN' && (
          <Button
            onClick={async () => {
              try {
                await mutate('/admin/notifications/demo');
                toast.success('Notificação adicionada à fila');
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            Executar notificação demonstrativa
          </Button>
        )}
        <h3 className="section-gap">Integrações</h3>
        <p>
          Registradores, pagamentos e DNS serão configurados nas próximas fases.
        </p>
      </Card>
    </>
  );
}
