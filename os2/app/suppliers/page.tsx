import { getSuppliers } from "@/app/actions/supplier";
import SupplierLedgerClient from "@/components/SupplierLedgerClient";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const suppliers = await getSuppliers();

  return <SupplierLedgerClient suppliers={suppliers} />;
}
