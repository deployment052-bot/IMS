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

    const {
      client,
      branch_id,
      products,
      gst_percent = 0
    } = req.body;

    if (!branch_id || !products) {
      return res.status(400).json({
        error: "branch_id & products required"
      });
    }


    // ✅ client auto create / get

    const clientData =
      await exports.getOrCreateClient(
        {
          ...client,
          branch_id
        },
        t
      );


    // ✅ quotation number

    const last = await Quotation.findOne({
      where: { branch_id },
      order: [["createdAt", "DESC"]],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    let next = 1;

    if (last && last.quotation_no) {
      next =
        Number(
          last.quotation_no.split("-")[2]
        ) + 1;
    }

    const quotation_no =
      `QT-${branch_id}-${String(next).padStart(4, "0")}`;


    // ✅ total

    let subtotal = 0;

    for (const p of products) {

      subtotal +=
        p.quantity *
        p.unit_price;

    }

    const gst_amount =
      subtotal * gst_percent / 100;

    const grand_total =
      subtotal + gst_amount;


    // ✅ create quotation

    const quotation =
      await Quotation.create({

        quotation_no,
        client_id: clientData.id,
        branch_id,

        total_amount: grand_total,
        gst_amount,

        status: "pending"

      }, { transaction: t });


    // ✅ items

    for (const p of products) {

      await QuotationItem.create({

        quotation_id: quotation.id,

        product_name: p.product_name,

        quantity: p.quantity,

        unit_price: p.unit_price,

        subtotal:
          p.quantity *
          p.unit_price

      }, { transaction: t });

    }


    await t.commit();

    res.json({
      message: "QT created",
      quotation
    });

  }
  catch (err) {

    await t.rollback();

    res.status(500).json({
      error: err.message
    });

  }

};


exports.convertQuotationToInvoice = async (req, res) => {

  const t = await sequelize.transaction();

  try {

    const { id } = req.params;

    const q =
      await Quotation.findByPk(id);

    if (!q)
      return res.status(404).json({
        error: "Not found"
      });

    if (q.status !== "approved")
      return res.status(400).json({
        error: "Approve first"
      });


    // ✅ status change

    q.status = "invoiced";

    await q.save({ transaction: t });


    // ✅ ledger entry

    await ClientLedger.create({

      client_id: q.client_id,

      branch_id: q.branch_id,

      type: "SALE",

      invoice_no:
        q.quotation_no,

      amount:
        q.total_amount,

      remark:
        "Invoice from QT"

    }, { transaction: t });


    await t.commit();

    res.json({
      message:
        "Invoice created"
    });

  }
  catch (err) {

    await t.rollback();

    res.status(500).json({
      error: err.message
    });

  }

};
exports.approveQuotation = async (req, res) => {

  const { id } = req.params;

  const q =
    await Quotation.findByPk(id);

  if (!q)
    return res
      .status(404)
      .json({ error: "Not found" });

  q.status = "approved";

  await q.save();

  res.json({
    message: "Approved"
  });

};

exports.generateQuotationPDF = async (req, res) => {

  try {

    const { quotation_id } = req.params;

    const quotation =
      await Quotation.findByPk(
        quotation_id,
        {
          include: [
            { model: Client },
            { model: Branch }
          ]
        }
      );

    const items =
      await QuotationItem.findAll({
        where: { quotation_id }
      });

    const client =
      quotation.Client;

    const branch =
      quotation.Branch;

    let rows = "";

    items.forEach((it, i) => {

      rows += `
      <tr>
        <td>${i + 1}</td>
        <td>${it.product_name}</td>
        <td>${it.quantity}</td>
        <td>${it.unit_price}</td>
        <td>${it.subtotal}</td>
      </tr>
      `;

    });


    const html = `

    <html>
    <body>

    <h2>${branch.name}</h2>
    <p>${branch.address}</p>

    <hr/>

    <h3>Quotation</h3>

    <p>No: ${quotation.quotation_no}</p>

    <p>Date:
    ${quotation.createdAt.toDateString()}
    </p>

    <h4>Client</h4>

    <p>${client.name}</p>
    <p>${client.address}</p>

    <table border="1" width="100%">

    <tr>
      <th>#</th>
      <th>Item</th>
      <th>Qty</th>
      <th>Rate</th>
      <th>Total</th>
    </tr>

    ${rows}

    </table>

    <h3>
    Total:
    ${quotation.total_amount}
    </h3>

    <h3>
    GST:
    ${quotation.gst_amount}
    </h3>

    </body>
    </html>

    `;


    const browser =
      await puppeteer.launch();

    const page =
      await browser.newPage();

    await page.setContent(html);

    const pdf =
      await page.pdf({
        format: "A4"
      });

    await browser.close();

    res.contentType("application/pdf");

    res.send(pdf);

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

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

exports.listQuotations = async (req, res) => {
  try {

    const { branch_id, status, search = "" } = req.query;

    const where = {};

    if (branch_id) where.branch_id = branch_id;

    if (status) where.status = status;

    if (search) {
      where[Op.or] = [
        { quotation_no: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const quotations = await Quotation.findAll({
      where,
      order: [["createdAt", "DESC"]],
      include: [
        { model: Client },
        { model: Branch }
      ]
    });

    res.json({
      total: quotations.length,
      quotations
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};