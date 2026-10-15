import { FinanceList } from '@/features/transactions/finance-list';
export default function Page() {
  return <FinanceList kind="payments" admin={true} />;
}
