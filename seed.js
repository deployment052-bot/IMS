const sequelize = require("./config/sqlcon");
const Stock = require("./model/SQL_Model/stock.record");
const StockMovement = require("./model/SQL_Model/stockmovement");

const branches = [
  1,2,3,4,
  5,6,7,8,
  9,10,11,12,
  13,14,15,16,
  17,18,19,20,
  21,22,23,24
];

const items = [
  { name: "LED TV", category: "Electronics", rate: 12000, hsn: "8528" },
  { name: "Office Chair", category: "Furniture", rate: 2500, hsn: "9401" },
  { name: "Laptop", category: "Electronics", rate: 55000, hsn: "8471" },
  { name: "Printer", category: "Electronics", rate: 8000, hsn: "8443" },
  { name: "AC Unit", category: "Electronics", rate: 32000, hsn: "8415" },
];

async function seedData() {

  for (const branch of branches) {

    for (const item of items) {

      const qty = Math.floor(Math.random() * 200) + 20;

      const stock = await Stock.create({
        item: item.name,
        category: item.category,
        quantity: qty,
        rate: item.rate,
        value: qty * item.rate,
        hsn: item.hsn,
        grn: "GRN-" + Math.floor(Math.random()*10000),
        batch_no: "BATCH-" + Math.floor(Math.random()*1000),
        aging: Math.floor(Math.random()*365),
        status: ["GOOD","DAMAGED","REPAIRABLE"][Math.floor(Math.random()*3)],
        po_number: "PO-" + Math.floor(Math.random()*10000),
        owner_id: 1,
        branch_id: branch
      });

      // PURCHASE (IN)
      await StockMovement.create({
        stock_id: stock.id,
        branch_id: branch,
        type: "IN",
        quantity: qty
      });

      // SALES (OUT)
      await StockMovement.create({
        stock_id: stock.id,
        branch_id: branch,
        type: "OUT",
        quantity: Math.floor(qty * 0.4)
      });

      // DAMAGE (OUT)
      await StockMovement.create({
        stock_id: stock.id,
        branch_id: branch,
        type: "OUT",
        quantity: Math.floor(qty * 0.05)
      });

      // SCRAP (OUT)
      await StockMovement.create({
        stock_id: stock.id,
        branch_id: branch,
        type: "OUT",
        quantity: Math.floor(qty * 0.03)
      });

    }
  }

  console.log("✅ Stock Data Seeded Successfully");
  process.exit();
}

seedData();