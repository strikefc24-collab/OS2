import { getPurchaseInvoices } from "@/app/actions/purchase";
import { getSuppliers } from "@/app/actions/supplier";
import PurchasesClient from "@/components/PurchasesClient";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const [invoices, suppliers] = await Promise.all([
    getPurchaseInvoices(),
    getSuppliers(),
  ]);

  return <PurchasesClient suppliers={suppliers} invoices={invoices} />;
}
