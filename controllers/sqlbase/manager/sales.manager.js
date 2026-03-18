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
const { generateEwayBill } = require("../../../utils/ewayService");
const { quotationHTML } = require("../../../utils/qt");
const { invoiceHTML } = require("../../../utils/invoice");
const { generateIRN } = require("../../../utils/taxproService");
const { generateEinvoicePayload } = require("../../../utils/einvoicePayload");
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

    const {
      client_type,
      company_name,
      contact_person,
      phone,
      email,
      address,
      city,
      country
    } = req.body;

    const branch_id = req.user.branch_id;

    if (!company_name) {
      await t.rollback();
      return res.status(400).json({
        error: "Company name required"
      });
    }

    // =========================
    // CLIENT CODE GENERATION
    // =========================

    const lastClient = await Client.findOne({
      where: { branch_id },
      order: [["createdAt", "DESC"]],
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    let nextNumber = 1;

    if (lastClient?.client_code) {
      const lastNumber =
        parseInt(lastClient.client_code.split("-")[1]);
      nextNumber = lastNumber + 1;
    }

    const client_code =
      `BR${branch_id}-${String(nextNumber).padStart(4, "0")}`;

    // =========================
    // CREATE CLIENT
    // =========================

    const client = await Client.create({

      client_type,
      company_name,
      contact_person,
      phone,
      email,
      address,
      city,
      country,

      branch_id,
      client_code

    }, { transaction: t });

    await t.commit();

    res.status(201).json({
      message: "Client created successfully",
      client
    });

  }
  catch (err) {

    await t.rollback();

    res.status(500).json({
      error: err.message
    });

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

  let t;

  try {

    const { id } = req.params;

    t = await sequelize.transaction();

    const quotation = await Quotation.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!quotation) {
      await t.rollback();
      return res.status(404).json({ error: "Quotation not found" });
    }

    if (quotation.status !== "approved") {
      await t.rollback();
      return res.status(400).json({ error: "Quotation not approved" });
    }

    const items = await QuotationItem.findAll({
      where: { quotation_id: id },
      transaction: t
    });

    if (!items.length) {
      await t.rollback();
      return res.status(400).json({ error: "No quotation items found" });
    }

    const client = await Client.findByPk(quotation.client_id, { transaction: t });
    const branch = await Branch.findByPk(quotation.branch_id, { transaction: t });

    if (!client) {
      await t.rollback();
      return res.status(404).json({ error: "Client not found" });
    }

    if (!branch) {
      await t.rollback();
      return res.status(404).json({ error: "Branch not found" });
    }

   

    const invoice_no = "INV-" + quotation.quotation_no;

    const invoice = {
      invoice_no,
      quotation_no: quotation.quotation_no,
      total_amount: quotation.total_amount,
      gst_amount: quotation.gst_amount,
      status: "created",
      createdAt: new Date(),

      // Eway
      eway_bill_no: null,
      eway_bill_date: null,

      // TaxPro
      irn: null,
      ack_no: null,
      ack_date: null,
      qr_code: null
    };



    for (const it of items) {

      const stock = await Stock.findOne({
        where: {
          name: it.product_name,
          branch_id: quotation.branch_id
        },
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (!stock) {
        await t.rollback();
        return res.status(400).json({ error: `Stock not found ${it.product_name}` });
      }

      if (Number(stock.quantity) < Number(it.quantity)) {
        await t.rollback();
        return res.status(400).json({ error: `Not enough stock ${it.product_name}` });
      }

      stock.quantity = Number(stock.quantity) - Number(it.quantity);

      await stock.save({ transaction: t });

      await Ledger.create({
        branch_id: quotation.branch_id,
        stock_id: stock.id,
        type: "SALE",
        quantity: Number(it.quantity),
        rate: Number(it.unit_price),
        total: Number(it.subtotal),
        reference_no: invoice_no
      }, { transaction: t });

    }

 

    await ClientLedger.create({
      client_id: quotation.client_id,
      branch_id: quotation.branch_id,
      type: "SALE",
      amount: Number(quotation.total_amount),
      invoice_no,
      remark: "Invoice"
    }, { transaction: t });

    quotation.status = "invoiced";

    await quotation.save({ transaction: t });

    await t.commit();


try {

  const payload = generateEinvoicePayload({
    invoice,
    client,
    branch,
    items
  });

  const taxResponse = await generateIRN(payload);

  // IRN Details
  invoice.irn = taxResponse?.Irn || null;
  invoice.ack_no = taxResponse?.AckNo || null;
  invoice.ack_date = taxResponse?.AckDt || null;
  invoice.qr_code = taxResponse?.SignedQRCode || null;

  // Eway Details (TaxPro response)
  invoice.eway_bill_no =
    taxResponse?.EwbNo ||
    taxResponse?.ewayBillNo ||
    null;

  invoice.eway_bill_date =
    taxResponse?.EwbDt ||
    taxResponse?.ewayBillDate ||
    null;

} catch (err) {

  console.log("TaxPro generation failed:", err.message);

}


    const html = invoiceHTML({
      branch,
      invoice,
      client,
      items
    });

   

    const pdf = await generatePdfFromHtml(html);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=${invoice_no}.pdf`
    });

    return res.send(pdf);

  } catch (err) {

    if (t) await t.rollback();

    return res.status(500).json({
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

    const clients = await Client.findAll({
      attributes: [
        "id",
        "name",
        "phone",
        "email",
        "client_code",
        [
          sequelize.literal(`
            COALESCE(SUM(CASE WHEN ledger.type='SALE' THEN ledger.amount ELSE 0 END),0)
          `),
          "revenue"
        ],
        [
          sequelize.literal(`
            COALESCE(SUM(CASE WHEN ledger.type='PAYMENT' THEN ledger.amount ELSE 0 END),0)
          `),
          "payment"
        ],
        [
          sequelize.literal(`
            COALESCE(SUM(CASE WHEN ledger.type='SALE' THEN ledger.amount ELSE 0 END),0)
            -
            COALESCE(SUM(CASE WHEN ledger.type='PAYMENT' THEN ledger.amount ELSE 0 END),0)
          `),
          "pendingAmount"
        ]
      ],
      include: [
        {
          model: ClientLedger,
          as: "ledger",
          attributes: []
        }
      ],
      group: ["Client.id"]
    });

    res.json({
      success: true,
      totalClients: clients.length,
      clients
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

exports.getClientLedgerDetails = async (req, res) => {
  try {

    const { clientId } = req.params;

    const ledger = await ClientLedger.findAll({
      where: { client_id: clientId },
      attributes: [
        "id",
        "invoice_no",
        "type",
        "amount",
        "remark",
        "createdAt"
      ],
      include: [
        {
          model: Client,
          as: "client",
          attributes: ["id", "name"]
        }
      ],
      order: [["createdAt", "DESC"]]
    });

    res.json({
      success: true,
      totalEntries: ledger.length,
      ledger
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};


exports.listQuotations = async (req, res) => {
  try {

    const branchId = req.user?.branch_id; // agar branch based access hai

    const quotations = await Quotation.findAll({
      where: branchId ? { branch_id: branchId } : {},

      attributes: [
        "id",
        "quotation_no",
        "client_id",
        "branch_id",
        "total_amount",
        "gst_amount",
        "valid_till",
        "status",
        "createdAt"
      ],

      include: [
        {
          model: Client,
          as: "client",
          attributes: ["id", "name", "phone", "email"]
        },
        {
          model: Branch,
          as: "branch",
          attributes: ["id", "name", "location"]
        },
        {
          model: QuotationItem,
          as: "items",
          attributes: [
            "id",
            "product_name",
            "quantity",
            "unit_price",
            "cgst",
            "sgst",
            "amount"
          ]
        }
      ],

      order: [["createdAt", "DESC"]]
    });

    res.json({
      total: quotations.length,
      quotations
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      error: err.message
    });

  }
};

exports.getSalesDashboard = async (req, res) => {
  try {

    const branchId = req.user?.branch_id || null;

    // ===============================
    // 1. CARDS (TOP)
    // ===============================
    const cards = await sequelize.query(`
      SELECT 
        COALESCE(SUM(total_amount),0) AS revenue,
        COALESCE(AVG(total_amount),0) AS avgOrderValue,
        COUNT(*) AS totalOrders,
        COUNT(DISTINCT client_id) AS activeClients
      FROM quotations
      ${branchId ? `WHERE branch_id = ${branchId}` : ""}
    `);

    // ===============================
    // 2. REVENUE & ORDERS TREND
    // ===============================
    const revenueOrders = await sequelize.query(`
      SELECT 
        TO_CHAR("createdAt",'Mon') AS month,
        SUM(total_amount) AS revenue,
        COUNT(*) AS orders
      FROM quotations
      ${branchId ? `WHERE branch_id = ${branchId}` : ""}
      GROUP BY month, DATE_TRUNC('month',"createdAt")
      ORDER BY DATE_TRUNC('month',"createdAt")
    `);

    // ===============================
    // 3. PRODUCT CATEGORY DISTRIBUTION (PIE)
    // ===============================
    const category = await sequelize.query(`
      SELECT 
        product_name AS name,
        SUM(amount) AS value
      FROM quotation_items qi
      JOIN quotations q ON q.id = qi.quotation_id
      ${branchId ? `WHERE q.branch_id = ${branchId}` : ""}
      GROUP BY product_name
    `);

    // ===============================
    // 4. WEEKLY ACTIVITY (3 LINES)
    // ===============================
    const weekly = await sequelize.query(`
      SELECT 
        TO_CHAR("createdAt",'Dy') AS day,
        COUNT(*) FILTER (WHERE status='quotation') AS quotations,
        COUNT(*) FILTER (WHERE status='approved') AS invoices,
        COUNT(*) FILTER (WHERE status='dispatched') AS dispatched
      FROM quotations
      WHERE "createdAt" >= NOW() - INTERVAL '7 days'
      ${branchId ? `AND branch_id = ${branchId}` : ""}
      GROUP BY day
    `);

    // ===============================
    // 5. MONTHLY PROFIT (BAR)
    // ===============================
    const profit = await sequelize.query(`
      SELECT 
        TO_CHAR("createdAt",'Mon') AS month,
        SUM(total_amount * 0.2) AS profit
      FROM quotations
      ${branchId ? `WHERE branch_id = ${branchId}` : ""}
      GROUP BY month, DATE_TRUNC('month',"createdAt")
      ORDER BY DATE_TRUNC('month',"createdAt")
    `);

    // ===============================
    // 6. TOP PRODUCTS (TABLE)
    // ===============================
    const topProducts = await sequelize.query(`
      SELECT 
        product_name,
        SUM(quantity) AS sales,
        SUM(amount) AS revenue
      FROM quotation_items qi
      JOIN quotations q ON q.id = qi.quotation_id
      ${branchId ? `WHERE q.branch_id = ${branchId}` : ""}
      GROUP BY product_name
      ORDER BY sales DESC
      LIMIT 5
    `);

    // ===============================
    // 7. RECENT TRANSACTIONS
    // ===============================
    const transactions = await sequelize.query(`
      SELECT 
        quotation_no AS invoice,
        total_amount AS amount,
        status,
        "createdAt"
      FROM quotations
      ${branchId ? `WHERE branch_id = ${branchId}` : ""}
      ORDER BY "createdAt" DESC
      LIMIT 5
    `);

    // ===============================
    // 8. INVENTORY STATUS
    // ===============================
    const inventory = await sequelize.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status='in_stock') AS inStock,
        COUNT(*) FILTER (WHERE status='low_stock') AS lowStock,
        COUNT(*) FILTER (WHERE status='out_of_stock') AS outOfStock
      FROM stocks
      ${branchId ? `WHERE branch_id = ${branchId}` : ""}
    `);

    // ===============================
    // 9. CLIENT BREAKDOWN
    // ===============================
    const clients = await sequelize.query(`
      SELECT 
        COUNT(*) FILTER (WHERE createdAt >= NOW() - INTERVAL '30 days') AS newClients,
        COUNT(*) FILTER (WHERE createdAt < NOW() - INTERVAL '30 days') AS returningClients
      FROM clients
      ${branchId ? `WHERE branch_id = ${branchId}` : ""}
    `);

    // ===============================
    // 10. QUICK STATS
    // ===============================
    const quickStats = await sequelize.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status='approved') AS approvedQuotations,
        COUNT(*) FILTER (WHERE status='converted') AS invoicesGenerated,
        COUNT(*) FILTER (WHERE status='pending') AS pendingApprovals
      FROM quotations
      ${branchId ? `WHERE branch_id = ${branchId}` : ""}
    `);

    // ===============================
    // FINAL RESPONSE (UI READY)
    // ===============================
    res.json({
      success: true,

      cards: cards[0][0],

      revenueTrend: revenueOrders[0],

      categoryDistribution: category[0],

      weeklyActivity: weekly[0],

      profitAnalysis: profit[0],

      topProducts: topProducts[0],

      recentTransactions: transactions[0],

      inventoryStatus: inventory[0][0],

      clientBreakdown: clients[0][0],

      quickStats: quickStats[0][0]

    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};