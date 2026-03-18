require("dotenv").config();
const sequelize = require("./config/sqlcon");

const { Quotation, QuotationItem } = require("./model/SQL_Model/Quotation");
const { Client } = require("./model/SQL_Model");

const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const seedBulkQuotation = async () => {
  try {
    console.log("🚀 BULK QUOTATION SEED STARTED...");

    await sequelize.authenticate();
    console.log("✅ DB Connected");

 
    const clients = await Client.findAll();

    if (!clients.length) {
      console.log("❌ No clients found");
      return;
    }

    const products = [
      { name: "Cement", hsn: "2523", unit: "bag", price: 300 },
      { name: "Steel Rod", hsn: "7214", unit: "piece", price: 1000 },
      { name: "Bricks", hsn: "6901", unit: "piece", price: 10 },
      { name: "Sand", hsn: "2505", unit: "ton", price: 1500 },
      { name: "Tiles", hsn: "6907", unit: "box", price: 800 }
    ];

    // =========================
    // LOOP CREATE QUOTATIONS
    // =========================
    for (let i = 0; i < 50; i++) {

      const client = getRandom(clients);

      const quotation = await Quotation.create({
        quotation_no: "QT-" + Date.now() + "-" + i,
        client_id: client.id,
        branch_id: client.branch_id || 1,
        total_amount: 0,
        gst_amount: 0,
        valid_till: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        reference_no: "REF-" + i,
        terms: "Payment within 7 days",
        notes: "Auto generated quotation",
        status: "pending"
      });

      // =========================
      // CREATE RANDOM ITEMS
      // =========================
      const itemCount = Math.floor(Math.random() * 3) + 2; // 2–4 items

      let totalAmount = 0;
      let gstAmount = 0;

      const items = [];

      for (let j = 0; j < itemCount; j++) {
        const product = getRandom(products);

        const qty = Math.floor(Math.random() * 50) + 1;
        const subtotal = qty * product.price;

        const cgst = 9;
        const sgst = 9;

        const gst = subtotal * 0.18;
        const amount = subtotal + gst;

        totalAmount += amount;
        gstAmount += gst;

        items.push({
          quotation_id: quotation.id,
          product_name: product.name,
          quantity: qty,
          unit_price: product.price,
          unit: product.unit,
          hsn: product.hsn,
          cgst,
          sgst,
          subtotal,
          amount
        });
      }

      // SAVE ITEMS
      await QuotationItem.bulkCreate(items);

      // UPDATE TOTAL
      await quotation.update({
        total_amount: totalAmount,
        gst_amount: gstAmount
      });

      console.log(`✅ Quotation ${quotation.quotation_no} created`);
    }

    console.log("🎉 BULK SEED COMPLETED");

  } catch (error) {
    console.error("❌ Seed Error:", error.message);
  } finally {
    await sequelize.close();
  }
};

seedBulkQuotation();