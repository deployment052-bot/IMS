// seed.js

const sequelize = require("./config/sqlcon");

const Ledger = require("./model/SQL_Model/ladger");
const ClientLedger = require("./model/SQL_Model/client.ladger");
const Client = require("./model/SQL_Model/client");

async function seedData() {

  try {

    await sequelize.authenticate();
    console.log("DB Connected");

    await sequelize.sync({ alter: true });
    console.log("Tables Synced");

    const branches = [
      1,2,3,4,5,
      6,7,8,9,10,
      11,12,13,14,15,
      16,17,18,19,20
    ];

    const branchClientCounter = {};
    const clients = [];

    // ======================
    // CREATE 50 CLIENTS
    // ======================

    for (let i = 1; i <= 50; i++) {

      const branch =
        branches[Math.floor(Math.random() * branches.length)];

      if (!branchClientCounter[branch]) {
        branchClientCounter[branch] = 1;
      } else {
        branchClientCounter[branch]++;
      }

      const clientCode =
        `BR${branch}-CL${branchClientCounter[branch]}`;

      clients.push({

        client_code: clientCode,
        name: `Client ${i}`,
        phone: `9999900${100 + i}`,
        email: `client${i}@mail.com`,
        address: `Address ${i}`,
        gst_number: `GSTCL${1000 + i}`,
        credit_limit: 50000,
        branch_id: branch

      });

    }

    const createdClients = await Client.bulkCreate(clients);

    console.log("50 Clients Created");

    // ======================
    // 25 PURCHASE ENTRIES
    // ======================

    for (let i = 1; i <= 25; i++) {

      const branch =
        branches[Math.floor(Math.random() * branches.length)];

      await Ledger.create({

        branch_id: branch,
        stock_id: i,
        type: "PURCHASE",
        quantity: 20 + i,
        rate: 100 + i,
        total: (20 + i) * (100 + i),
        reference_no: `PO-${1000 + i}`,
        created_by: 1

      });

    }

    console.log("25 Purchase Entries Created");

    // ======================
    // 25 SALES + CLIENT LEDGER
    // ======================

    for (let i = 1; i <= 25; i++) {

      const client =
        createdClients[Math.floor(Math.random() * createdClients.length)];

      const saleAmount = 2000 + (i * 100);

      // Stock Ledger SALE
      await Ledger.create({

        branch_id: client.branch_id,
        stock_id: i,
        type: "SALE",
        quantity: 10 + i,
        rate: 150 + i,
        total: saleAmount,
        reference_no: `INV-${2000 + i}`,
        created_by: 1

      });

      // Client SALE entry
      await ClientLedger.create({

        client_id: client.id,
        branch_id: client.branch_id,
        type: "SALE",
        invoice_no: `INV-${2000 + i}`,
        amount: saleAmount,
        remark: "Product Sale"

      });

      // Client PAYMENT entry
      await ClientLedger.create({

        client_id: client.id,
        branch_id: client.branch_id,
        type: "PAYMENT",
        invoice_no: `PAY-${3000 + i}`,
        amount: saleAmount * 0.7,
        remark: "Partial Payment"

      });

    }

    console.log("25 Sales + Payments Added");

    console.log("🚀 SEED DATA COMPLETED");

    process.exit();

  } catch (error) {

    console.error(error);
    process.exit();

  }

}

seedData();