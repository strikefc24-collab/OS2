import { getCustomers } from "@/app/actions/customer";
import CustomersClient from "@/components/CustomersClient";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const customers = await getCustomers();

  return <CustomersClient customers={customers} />;
}
