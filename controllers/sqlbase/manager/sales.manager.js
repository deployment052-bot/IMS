const {
  Client,
  ClientLedger,
  Branch,
  Quotation,
  QuotationItem,
  Stock,
  Ledger,
  sequelize
} = require("../../../model/SQL_Model");

const puppeteer = require("puppeteer");

const { quotationHTML } = require("../../../utils/qt");
const { invoiceHTML } = require("../../../utils/invoice");
const getOrCreateClient = async (data, t) => {

  let client = await Client.findOne({
    where: {
      phone: data.phone,
      branch_id: data.branch_id
    },
    transaction: t
  });

  if (client) return client;

  const last = await Client.findOne({
    where: { branch_id: data.branch_id },
    order: [["createdAt", "DESC"]],
    transaction: t
  });

  let next = 1;

  if (last?.client_code) {
    next =
      Number(last.client_code.split("-")[1]) + 1;
  }

  const code =
    `BR${data.branch_id}-${String(next).padStart(4, "0")}`;

  client = await Client.create({
    name: data.name,
    phone: data.phone,
    email: data.email,
    address: data.address,
    branch_id: data.branch_id,
    gst_number: data.gst_number,
    client_code: code
  }, { transaction: t });

  return client;
};
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
      gst_percent = 0,
      valid_till
    } = req.body;


    // =========================
    // CLIENT
    // =========================

    const clientData =
      await getOrCreateClient(
        { ...client, branch_id },
        t
      );


    // =========================
    // STOCK VALIDATION
    // =========================

    for (const p of products) {

      const stock = await Stock.findOne({
        where: {
          name: p.product_name,
          branch_id
        },
        transaction: t
      });

      if (!stock) {

        await t.rollback();

        return res.status(400).json({
          error: `Stock not found for ${p.product_name}`
        });

      }

      if (stock.quantity < p.quantity) {

        await t.rollback();

        return res.status(400).json({
          error: `Not enough stock for ${p.product_name}`
        });

      }

    }


    // =========================
    // QUOTATION NO
    // =========================

    const last = await Quotation.findOne({
      where: { branch_id },
      order: [["createdAt", "DESC"]],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    let next = 1;

    if (last?.quotation_no) {

      const parts =
        last.quotation_no.split("-");

      next = Number(parts[2]) + 1;
    }

    const quotation_no =
      `QT-${branch_id}-${String(next).padStart(4, "0")}`;


    // =========================
    // TOTAL CALC
    // =========================

    let subtotal = 0;

    for (const p of products) {
      subtotal += p.quantity * p.unit_price;
    }

    const gst_amount =
      subtotal * gst_percent / 100;

    const grand_total =
      subtotal + gst_amount;


    // =========================
    // CREATE QUOTATION
    // =========================

    const quotation =
      await Quotation.create({

        quotation_no,
        client_id: clientData.id,
        branch_id,

        total_amount: grand_total,
        gst_amount,

        valid_till:
          valid_till || null,

        status: "pending"

      }, { transaction: t });


    // =========================
    // CREATE ITEMS
    // =========================

    for (const p of products) {

      const itemTotal =
        p.quantity * p.unit_price;

      const cgst =
        (itemTotal * gst_percent) / 200;

      const sgst =
        (itemTotal * gst_percent) / 200;

      await QuotationItem.create({

        quotation_id: quotation.id,

        product_name: p.product_name,

        quantity: p.quantity,

        unit_price: p.unit_price,

        unit: p.unit || "",

        hsn: p.hsn || "",

        cgst,

        sgst,

        subtotal: itemTotal,

        amount:
          itemTotal + cgst + sgst

      }, { transaction: t });

    }

    await t.commit();


    // =========================
    // GET DATA FOR PDF
    // =========================

    const branch =
      await Branch.findByPk(branch_id);

    const items =
      await QuotationItem.findAll({
        where: {
          quotation_id: quotation.id
        }
      });


    const html =
      quotationHTML({
        branch,
        quotation,
        client: clientData,
        items
      });


    // =========================
    // PDF
    // =========================

    const browser =
      await puppeteer.launch();

    const page =
      await browser.newPage();

    await page.setContent(html, {
      waitUntil: "networkidle0"
    });

    const pdf =
      await page.pdf({
        format: "A4",
        printBackground: true
      });

    await browser.close();


    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition":
        "inline; filename=quotation.pdf"
    });

    return res.send(pdf);

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

    const quotation = await Quotation.findByPk(id, {
      transaction: t
    });

    if (!quotation) {
      await t.rollback();
      return res.status(404).json({
        error: "Quotation not found"
      });
    }

    if (quotation.status !== "approved") {
      await t.rollback();
      return res.status(400).json({
        error: "Quotation not approved"
      });
    }


    // =====================
    // GET ITEMS
    // =====================

    const items = await QuotationItem.findAll({
      where: {
        quotation_id: id
      },
      transaction: t
    });


    // =====================
    // REDUCE STOCK + LEDGER
    // =====================

    for (const it of items) {

      const stock = await Stock.findOne({
        where: {
          name: it.product_name,
          branch_id: quotation.branch_id
        },
        transaction: t
      });

      if (!stock) {
        await t.rollback();
        return res.status(400).json({
          error: `Stock not found ${it.product_name}`
        });
      }

      if (stock.quantity < it.quantity) {
        await t.rollback();
        return res.status(400).json({
          error: `Not enough stock ${it.product_name}`
        });
      }

      stock.quantity -= it.quantity;

      await stock.save({ transaction: t });


      await Ledger.create({

        branch_id: quotation.branch_id,

        stock_id: stock.id,

        type: "SALE",

        quantity: it.quantity,

        rate: it.unit_price,

        total: it.subtotal,

        reference_no: quotation.quotation_no

      }, { transaction: t });

    }


    // =====================
    // CLIENT LEDGER
    // =====================

    await ClientLedger.create({

      client_id: quotation.client_id,

      branch_id: quotation.branch_id,

      type: "SALE",

      amount: quotation.total_amount,

      invoice_no: quotation.quotation_no,

      remark: "Invoice"

    }, { transaction: t });


    // =====================
    // CREATE INVOICE OBJECT
    // =====================

    const invoice = {
      invoice_no: "INV-" + quotation.quotation_no,
      quotation_no: quotation.quotation_no,
      total_amount: quotation.total_amount,
      gst_amount: quotation.gst_amount,
      status: "created",
      createdAt: new Date()
    };


    quotation.status = "invoiced";

    await quotation.save({ transaction: t });


    await t.commit();


    // =====================
    // GET CLIENT + BRANCH
    // =====================

    const client =
      await Client.findByPk(
        quotation.client_id
      );

    const branch =
      await Branch.findByPk(
        quotation.branch_id
      );


    // =====================
    // HTML
    // =====================

    const html = invoiceHTML({

      branch,
      invoice,
      client,
      items

    });


    // =====================
    // PDF
    // =====================

    const browser =
      await puppeteer.launch();

    const page =
      await browser.newPage();

    await page.setContent(html, {
      waitUntil: "networkidle0"
    });

    const pdf =
      await page.pdf({
        format: "A4",
        printBackground: true
      });

    await browser.close();


    // =====================
    // SHOW PDF
    // =====================

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition":
        "inline; filename=invoice.pdf"
    });

    return res.send(pdf);

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

    const quotation = await Quotation.findByPk(
      quotation_id,
      {
        include: [Client, Branch]
      }
    );

    const items = await QuotationItem.findAll({
      where: { quotation_id }
    });

    const client = quotation.Client;
    const branch = quotation.Branch;

    let rows = "";

    items.forEach((it, i) => {

      rows += `
      <tr>
        <td>${i + 1}</td>
        <td>${it.product_name}</td>
        <td>${it.hsn}</td>
        <td>${it.quantity}</td>
        <td>${it.unit}</td>
        <td>${it.unit_price}</td>
        <td>${it.subtotal}</td>
        <td>${it.cgst}</td>
        <td>${it.sgst}</td>
        <td>${it.amount}</td>
      </tr>
      `;

    });


    const html = `

    <h2>${branch.name}</h2>
    <p>${branch.address}</p>
    <p>GST : ${branch.gst}</p>

    <h3>QUOTATION</h3>

    <p>No : ${quotation.quotation_no}</p>
    <p>Date : ${quotation.createdAt.toDateString()}</p>

    <h4>Billing</h4>
    <p>${client.name}</p>
    <p>${client.address}</p>

    <table border="1" width="100%">
    <tr>
    <th>#</th>
    <th>Item</th>
    <th>HSN</th>
    <th>Qty</th>
    <th>Unit</th>
    <th>Rate</th>
    <th>Taxable</th>
    <th>CGST</th>
    <th>SGST</th>
    <th>Total</th>
    </tr>

    ${rows}

    </table>

    <h3>Total : ${quotation.total_amount}</h3>
    <h3>GST : ${quotation.gst_amount}</h3>

    `;


    const browser = await puppeteer.launch();

    const page = await browser.newPage();

    await page.setContent(html);

    const pdf = await page.pdf({
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
exports.listQuotations = async (req, res) => {
  try {

    const quotations = await Quotation.findAll({
      include: [
        { model: Client, as: "client" },
        { model: Branch, as: "branch" },
        {
          model: QuotationItem,
          as: "items"
        }
      ],
      order: [["createdAt", "DESC"]]
    });

    res.json(quotations);

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }
};