const { Op } = require("sequelize");
const {Client,ClientLedger,Branch, Quotation, QuotationItem,sequelize} = require("../../../model/SQL_Model");
const puppeteer = require("puppeteer");
exports.createClient = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { name, phone, email, address, branch_id, gst_number } = req.body;

    if (!name || !branch_id) {
      return res.status(400).json({ error: "name and branch_id required" });
    }

    // 🔹 Last client of that branch
    const lastClient = await Client.findOne({
      where: { branch_id },
      order: [["createdAt", "DESC"]],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    let nextNumber = 1;

    if (lastClient && lastClient.client_code) {
      const lastNumber = parseInt(lastClient.client_code.split("-")[1]);
      nextNumber = lastNumber + 1;
    }

    const client_code = `BR${branch_id}-${String(nextNumber).padStart(4, "0")}`;

    const client = await Client.create({
      name,
      phone,
      email,
      address,
      branch_id,
      gst_number,
      client_code
    }, { transaction: t });

    await t.commit();

    res.status(201).json({ message: "Client created", client });

  } catch (err) {
    await t.rollback();
    res.status(500).json({ error: err.message });
  }
};

exports.listClients = async (req, res) => {
  try {
    const { search = "", branch_id } = req.query;

    const where = {};
    if (branch_id) where.branch_id = branch_id;

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const clients = await Client.findAll({
      where,
      order: [["createdAt", "DESC"]]
    });

    res.json({ total: clients.length, clients });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createQuotation = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { client_id, branch_id, products, gst_percent } = req.body;

    if (!client_id || !branch_id || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: "client_id, branch_id and products are required" });
    }

    
    let totalAmount = 0;
    products.forEach(p => {
      if (!p.product_name || !p.quantity || !p.unit_price) {
        throw new Error("Each product must have name, quantity and unit_price");
      }
      totalAmount += p.quantity * p.unit_price;
    });

    const gstAmount = gst_percent ? (totalAmount * gst_percent) / 100 : 0;
    const grandTotal = totalAmount + gstAmount;

    
    const quotation = await Quotation.create({
      client_id,
      branch_id,
      total_amount: grandTotal,
      gst_amount: gstAmount,
      status: "pending"
    }, { transaction: t });

    
    for (const p of products) {
      await QuotationItem.create({
        quotation_id: quotation.id,
        product_name: p.product_name,
        quantity: p.quantity,
        unit_price: p.unit_price,
        specifications: p.specifications || null,
        subtotal: p.quantity * p.unit_price
      }, { transaction: t });
    }

    await t.commit();

    const fullQuotation = await Quotation.findByPk(quotation.id, {
      include: [{ model: QuotationItem, as: "items" }]
    });

    res.status(201).json({ message: "Quotation created successfully", quotation: fullQuotation });

  } catch (err) {
    await t.rollback();
    res.status(500).json({ error: err.message });
  }
};



exports.generateQuotationPDF = async (req, res) => {
  try {
    const { quotation_id } = req.params;

    const quotation = await Quotation.findByPk(quotation_id, {
      include: [
        { model: Client },
        { model: Branch }
      ]
    });

    const items = await QuotationItem.findAll({
      where: { quotation_id }
    });

    const client = quotation.Client;
    const branch = quotation.Branch;

    let itemRows = "";

    items.forEach((item, index) => {
      itemRows += `
        <tr>
          <td>${index + 1}</td>
          <td>${item.product_name}</td>
          <td>${item.quantity}</td>
          <td>${item.price}</td>
          <td>${item.total}</td>
        </tr>
      `;
    });

    const html = `
    <html>
    <head>
      <style>
        body { font-family: Arial; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid black; padding: 5px; }
        .header { text-align:center; }
        .right { text-align:right; }
      </style>
    </head>
    <body>

    <div class="header">
      <h2>${branch.name}</h2>
      <p>${branch.address}</p>
      <p>GSTIN: ${branch.gst_number}</p>
      <h3>QUOTATION</h3>
    </div>

    <div class="right">
      <p><strong>Quotation No:</strong> ${quotation.quotation_no}</p>
      <p><strong>Date:</strong> ${quotation.createdAt.toDateString()}</p>
    </div>

    <hr/>

    <h4>Billing Address</h4>
    <p>${client.name}</p>
    <p>${client.address}</p>
    <p>GST: ${client.gst_number}</p>

    <br/>

    <table>
      <thead>
        <tr>
          <th>No</th>
          <th>Description</th>
          <th>Qty</th>
          <th>Rate</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <br/>

    <div class="right">
      <p><strong>Subtotal:</strong> ₹${quotation.subtotal}</p>
      <p><strong>GST:</strong> ₹${quotation.gst_total}</p>
      <p><strong>Grand Total:</strong> ₹${quotation.grand_total}</p>
    </div>

    <br/><br/>

    <p><strong>Bank Details:</strong></p>
    <p>${branch.bank_name}</p>
    <p>Account No: ${branch.account_number}</p>
    <p>IFSC: ${branch.ifsc}</p>

    <br/>

    <div class="right">
      <p>For ${branch.name}</p>
      <br/><br/>
      <p>Authorised Signatory</p>
    </div>

    </body>
    </html>
    `;

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(html);

    const pdf = await page.pdf({ format: "A4" });
    await browser.close();

    res.contentType("application/pdf");
    res.send(pdf);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createSaleEntry = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { client_id, invoice_no, amount, remark } = req.body;

    if (!client_id || !amount) {
      return res.status(400).json({ error: "client_id and amount required" });
    }

    const client = await Client.findByPk(client_id);
    if (!client) return res.status(404).json({ error: "Client not found" });

    // Branch rule:
    // Sales manager normally works for his branch
    const branch_id = req.user.branch_id || client.branch_id;

    const entry = await ClientLedger.create({
      client_id,
      branch_id,
      type: "SALE",
      invoice_no: invoice_no || null,
      amount: Number(amount),
      remark: remark || "Sale"
    }, { transaction: t });

    await t.commit();

    res.status(201).json({ message: "Sale added in ledger", entry });

  } catch (err) {
    await t.rollback();
    res.status(500).json({ error: err.message });
  }
};

/* =========================
   3) PAYMENT -> LEDGER PAYMENT ENTRY
========================= */

exports.addClientPayment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { client_id, amount, remark } = req.body;

    if (!client_id || !amount) {
      return res.status(400).json({ error: "client_id and amount required" });
    }

    const client = await Client.findByPk(client_id);
    if (!client) return res.status(404).json({ error: "Client not found" });

    const branch_id = req.user.branch_id || client.branch_id;

    const entry = await ClientLedger.create({
      client_id,
      branch_id,
      type: "PAYMENT",
      amount: Number(amount),
      remark: remark || "Payment received"
    }, { transaction: t });

    await t.commit();

    res.status(201).json({ message: "Payment added in ledger", entry });

  } catch (err) {
    await t.rollback();
    res.status(500).json({ error: err.message });
  }
};

/* =========================
   4) CLIENT LEDGER (RUNNING BALANCE)
========================= */

exports.getClientLedger = async (req, res) => {
  try {
    const { clientId } = req.params;

    const rows = await ClientLedger.findAll({
      where: { client_id: clientId },
      order: [["createdAt", "ASC"]],
      include: [
        { model: Client, as: "client", attributes: ["id", "name"] },
        { model: Branch, as: "branch", attributes: ["id", "name", "location"] }
      ]
    });

    let balance = 0;

    const ledger = rows.map((r) => {
      if (r.type === "SALE") balance += Number(r.amount);
      else balance -= Number(r.amount);

      return {
        date: r.createdAt,
        type: r.type,
        invoice_no: r.invoice_no,
        sale: r.type === "SALE" ? Number(r.amount) : 0,
        payment: r.type === "PAYMENT" ? Number(r.amount) : 0,
        balance,
        remark: r.remark,
        branch: r.branch
      };
    });

    res.json({
      clientId,
      total: ledger.length,
      outstanding: balance,
      ledger
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};