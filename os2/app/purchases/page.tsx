import { getPurchaseInvoices } from "@/app/actions/purchase";
import { getSuppliers } from "@/app/actions/supplier";
import { getProducts } from "@/app/actions/product";
import PurchasesClient from "@/components/PurchasesClient";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const [invoices, suppliers, products] = await Promise.all([
    getPurchaseInvoices(),
    getSuppliers(),
    getProducts(),
  ]);

  return <PurchasesClient suppliers={suppliers} products={products} invoices={invoices} />;
}
