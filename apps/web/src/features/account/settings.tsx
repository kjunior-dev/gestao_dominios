'use client';
import { PageHeader, Card } from '@devtrust/ui';
import { ThemeToggle } from '@/components/providers';
export function Settings() {
  return (
    <>
      <PageHeader
        title="Definições"
        description="Personalize o seu espaço de trabalho."
      />
      <Card>
        <div className="account-row">
          <div>
            <strong>Aparência</strong>
            <p>Alterne entre o tema claro e escuro.</p>
          </div>
          <ThemeToggle />
        </div>
        <div className="account-row">
          <div>
            <strong>Idioma e região</strong>
            <p>Português · Cabo Verde</p>
          </div>
        </div>
        <div className="account-row">
          <div>
            <strong>Serviços comerciais</strong>
            <p>
              Disponíveis nas próximas fases. Ainda não existem pagamentos ou
              operações de domínios.
            </p>
          </div>
        </div>
      </Card>
    </>
  );
}
