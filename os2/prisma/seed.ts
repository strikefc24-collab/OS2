import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.supplier.upsert({
    where: { code: "SUPP-0001" },
    update: {},
    create: {
      name: "Team X",
      code: "SUPP-0001",
      contact: "",
      email: "",
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
