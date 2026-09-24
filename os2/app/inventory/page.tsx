import { getProducts } from "@/app/actions/product";
import { getSuppliers } from "@/app/actions/supplier";
import InventoryClient from "@/components/InventoryClient";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const [products, suppliers] = await Promise.all([getProducts(), getSuppliers()]);

  return <InventoryClient products={products} suppliers={suppliers} />;
}
