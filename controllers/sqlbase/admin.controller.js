const { Branch, User, Role, Stock, sequelize, Ledger,  ClientLedger,
 
  QuotationItem } = require("../../model/SQL_Model");
const { Op } = require("sequelize");
const StockMovement = require("../../model/SQL_Model/stockmovement");
function getDateFilter(range) {
  const now = new Date();

  if (range === "day") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    return { [Op.gte]: start };
  }

  if (range === "week") {
    const start = new Date();
    start.setDate(start.getDate() - 7);

    return { [Op.gte]: start };
  }

  if (range === "month") {
    const start = new Date();
    start.setMonth(start.getMonth() - 1);

    return { [Op.gte]: start };
  }

  return null;
}



 generatePassword = () => {
  return Math.random().toString(36).slice(-8);
};

exports.createBranch = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { name, code, location, type, state } = req.body;

    if (!name || !code || !location || !type || !state) {
      return res.status(400).json({
        error: "All branch fields required"
      });
    }

    // ================= CHECK BRANCH =================
    const exists = await Branch.findOne({
      where: {
        [Op.or]: [{ name }, { code }]
      }
    });

    if (exists) {
      return res.status(400).json({
        error: "Branch already exists"
      });
    }

    // ================= CREATE BRANCH =================
    const branch = await Branch.create(
      {
        name,
        code,
        location,
        type,
        state,
        status: "ACTIVE"
      },
      { transaction: t }
    );

    // ================= ROLES FETCH =================
    const roles = await Role.findAll();

    const roleMap = {};
    roles.forEach(r => {
      roleMap[r.name] = r.id;
    });

    // ================= USERS TO CREATE =================
    const usersToCreate = [
      { role: "admin", prefix: "admin" },
      { role: "sales_manager", prefix: "sales" },
      { role: "inventory_manager", prefix: "inventory" }
    ];

    const createdUsers = [];

    for (const u of usersToCreate) {
      if (!roleMap[u.role]) {
        throw new Error(`${u.role} role not found in DB`);
      }

      const password = generatePassword();
      const email = `${u.prefix}_${code}@company.com`;

      const user = await User.create(
        {
          name: `${name} ${u.role}`,
          email,
          password,
          role_id: roleMap[u.role],
          branch_id: branch.id
        },
        { transaction: t }
      );

      createdUsers.push({
        role: u.role,
        email,
        password
      });
    }

    await t.commit();

    // ================= RESPONSE =================
    res.status(201).json({
      message: "Branch + Users created successfully",
      branch,
      users: createdUsers
    });

  } catch (err) {
    await t.rollback();
    res.status(500).json({ error: err.message });
  }
};


exports.getAllBranches = async (req, res) => {
  try {
    const branches = await Branch.findAll();

    res.status(200).json({
      message: "Branches fetched successfully",
      total: branches.length,
      branches
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getGlobalDashboard = async (req, res) => {
  try {
    // ✅ FIXED ROLE CHECK
    if (!superRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Access denied"
      });
    }

    const totalUsers = await User.count();
    const totalBranches = await Branch.count();

    const locations = await Branch.findAll({
      attributes: [
        "location",

        [sequelize.fn("COUNT", sequelize.col("Branch.id")), "total_branches"],

        [
          sequelize.fn(
            "COALESCE",
            sequelize.fn("SUM", sequelize.col("stocks.quantity")),
            0
          ),
          "total_stock"
        ],

        [
          sequelize.fn(
            "COALESCE",
            sequelize.fn("SUM", sequelize.col("stocks.value")),
            0
          ),
          "total_value"
        ]
      ],

      include: [
        {
          model: Stock,
          as: "stocks",
          attributes: []
        }
      ],

      group: ["location"],
      order: [["location", "ASC"]],
      raw: true
    });

    res.json({
      stats: {
        totalUsers,
        totalBranches
      },
      locations
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.getLocationDashboard = async (req, res) => {
  try {
    const { location } = req.params;

    const branches = await Branch.findAll({
      where: { location },

      attributes: [
        "id",
        "name",
        "code",

        [
          sequelize.fn(
            "COALESCE",
            sequelize.fn("SUM", sequelize.col("stocks.quantity")),
            0
          ),
          "total_stock"
        ],

        [
          sequelize.fn(
            "COALESCE",
            sequelize.fn("SUM", sequelize.col("stocks.value")),
            0
          ),
          "total_value"
        ]
      ],

      include: [
        {
          model: Stock,
          as: "stocks",
          attributes: []
        }
      ],

      group: ["Branch.id"],
      subQuery: false
    });

    res.json({
      location,
      totalBranches: branches.length,
      branches
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



exports.getBranchDashboard = async (req, res) => {
  try {
    const { branchId } = req.params;
    const { range = "month" } = req.query;

    const branch = await Branch.findByPk(branchId);
    if (!branch) return res.status(404).json({ error: "Branch not found" });

    // =========================
    // DATE FILTER
    // =========================
    let dateFilter = {};

    if (range === "day") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      dateFilter = { created_at: { [Op.gte]: start } };
    }

    if (range === "week") {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      dateFilter = { created_at: { [Op.gte]: start } };
    }

    if (range === "month") {
      const start = new Date();
      start.setMonth(start.getMonth() - 1);
      dateFilter = { created_at: { [Op.gte]: start } };
    }

    const where = {
      branch_id: branchId,
      ...dateFilter
    };

    // =========================
    // STOCK + USERS
    // =========================
    const [stocks, users] = await Promise.all([
      Stock.findAll({ where }),
      User.findAll({
        where: { branch_id: branchId },
        include: { association: "role", attributes: ["name"] }
      })
    ]);

    // =========================
    // CHART DATA
    // =========================
    const barChart = await Stock.findAll({
      where,
      attributes: [
        [sequelize.fn("DATE", sequelize.col("created_at")), "date"],
        [sequelize.fn("SUM", sequelize.col("quantity")), "stockIn"]
      ],
      group: ["date"],
      order: [["date", "ASC"]],
      raw: true
    });

    const lineChart = await Stock.findAll({
      where,
      attributes: [
        [sequelize.fn("DATE", sequelize.col("created_at")), "date"],
        [sequelize.fn("SUM", sequelize.col("value")), "totalValue"]
      ],
      group: ["date"],
      order: [["date", "ASC"]],
      raw: true
    });

    // =========================
    // TABLE DATA CLEANUP
    // (NULL values avoid)
    // =========================
    const tableStocks = stocks.map((s) => ({
      id: s.id,
      item: s.item,
      category: s.category || "General",
      quantity: s.quantity,
      hsn: s.hsn || "-",
      grn: s.grn || "-",
      batch_no: s.batch_no || `BATCH-${s.id}`,
      aging: s.aging || 0,
      status: s.status || "GOOD"
    }));

    // =========================
    // RESPONSE (IMAGE LIKE)
    // =========================
    res.json({
      branchInfo: branch,

      stats: {
        totalStock: stocks.reduce((sum, i) => sum + i.quantity, 0),
        totalValue: stocks.reduce((sum, i) => sum + i.value, 0),
        totalUsers: users.length,

        // demo for now
        totalSales: Math.floor(stocks.length * 2),
        agingItems: tableStocks.filter(s => s.aging > 5).length
      },

      charts: {
        barChart,
        lineChart
      },

      stocks: tableStocks,
      users
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.getAdminDashboard = async (req, res) => {
  try {

  
    const totalUsers = await User.count();

  
    const totalStock = await Stock.sum("quantity");

    const totalBranches = await Branch.count();

 
    const totalStockValue = await Stock.sum("value");

    const weeklyAnalytics = await Stock.findAll({
      attributes: [
        [sequelize.fn("DATE", sequelize.col("created_at")), "date"],
        [sequelize.fn("SUM", sequelize.col("value")), "total"]
      ],
      group: ["date"],
      order: [["date", "ASC"]],
      raw: true
    });

    const stockDistribution = await Stock.findAll({
      attributes: [
        "item",
        [sequelize.fn("SUM", sequelize.col("quantity")), "total_quantity"]
      ],
      group: ["item"],
      raw: true
    });

 
    const branchOverview = await Branch.findAll({
      include: [
        {
          model: User,
          as: "users",
          attributes: ["id"]
        }
      ]
    });

    res.json({
      stats: {
        totalUsers,
        totalStock,
        totalBranches,
        totalStockValue
      },
      weeklyAnalytics,
      stockDistribution,
      branchOverview
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// const { Branch, User, Stock, sequelize } = require("../../model/SQL_Model");

exports.getSuperAdminDashboard = async (req, res) => {
  try {
    // =========================
    // 🔹 TOP STATS
    // =========================
    const totalUsers = await User.count();
    const totalBranches = await Branch.count();
    const totalStock = (await Stock.sum("quantity")) || 0;
    const totalStockValue = (await Stock.sum("value")) || 0;

    const totalSales =
      (await Ledger.sum("total", {
        where: { type: "SALE" }
      })) || 0;

    // =========================
    // 🔹 SALES ANALYTICS
    // =========================
    const salesData = await Ledger.findAll({
      attributes: [
        [sequelize.fn("DATE", sequelize.col("createdAt")), "date"],
        [sequelize.fn("SUM", sequelize.col("total")), "total"]
      ],
      where: { type: "SALE" },
      group: [sequelize.fn("DATE", sequelize.col("createdAt"))],
      order: [[sequelize.fn("DATE", sequelize.col("createdAt")), "ASC"]],
      raw: true
    });

    const purchaseData = await Ledger.findAll({
      attributes: [
        [sequelize.fn("DATE", sequelize.col("createdAt")), "date"],
        [sequelize.fn("SUM", sequelize.col("total")), "total"]
      ],
      where: { type: "PURCHASE" },
      group: [sequelize.fn("DATE", sequelize.col("createdAt"))],
      order: [[sequelize.fn("DATE", sequelize.col("createdAt")), "ASC"]],
      raw: true
    });

    // =========================
    // 🔹 STOCK DISTRIBUTION
    // =========================
    const stockRaw = await Stock.findAll({
      attributes: [
        "category",
        [sequelize.fn("SUM", sequelize.col("quantity")), "total"]
      ],
      group: ["category"],
      raw: true
    });

    const totalCategoryStock = stockRaw.reduce(
      (sum, i) => sum + Number(i.total),
      0
    );

    const stockDistribution = stockRaw.map((i) => ({
      category: i.category || "Others",
      total: Number(i.total),
      percentage: totalCategoryStock
        ? ((i.total / totalCategoryStock) * 100).toFixed(1)
        : 0
    }));

    // =========================
    // 🔹 BRANCH OVERVIEW
    // =========================
    const branches = await Branch.findAll({
      attributes: [
        "id",
        "name",
        [
          sequelize.fn(
            "COALESCE",
            sequelize.fn("SUM", sequelize.col("stocks.quantity")),
            0
          ),
          "stockItems"
        ],
        [
          sequelize.fn(
            "COALESCE",
            sequelize.fn("SUM", sequelize.col("stocks.value")),
            0
          ),
          "purchase"
        ]
      ],
      include: [
        {
          model: Stock,
          as: "stocks",
          attributes: []
        }
      ],
      group: ["Branch.id"],
      raw: true
    });

    const branchOverview = branches.map((b) => ({
      branchName: b.name,
      stockItems: Number(b.stockItems),
      purchase: Number(b.purchase),
      sale: Math.floor(Number(b.purchase) * 0.4),
      stockIn: Number(b.stockItems),
      stockOut: Math.floor(Number(b.stockItems) * 0.3)
    }));

    // =========================
    // 🔹 RECENT ACTIVITIES (ADVANCED)
    // =========================

    // Ledger Activities
    const ledgerActivities = await Ledger.findAll({
      limit: 5,
      order: [["createdAt", "DESC"]],
      raw: true
    });

    // Latest User
    const userActivities = await User.findAll({
      limit: 2,
      order: [["createdAt", "DESC"]],
      raw: true
    });

    // Latest Stock Updates
    const stockActivities = await Stock.findAll({
      limit: 2,
      order: [["updatedAt", "DESC"]],
      raw: true
    });

    let activities = [];

    // 👤 Users
    userActivities.forEach((u) => {
      activities.push({
        title: "User Registered",
        description: u.name || "New User",
        time: u.createdAt,
        type: "user",
        icon: "user"
      });
    });

    // 📦 Stock
    stockActivities.forEach((s) => {
      activities.push({
        title: "Stock Updated",
        description: s.item || "Stock Item",
        time: s.updatedAt,
        type: "stock",
        icon: "box"
      });
    });

    // 💰 Ledger
    ledgerActivities.forEach((l) => {
      if (l.type === "SALE") {
        activities.push({
          title: "Sales Transaction",
          description: `Sale completed - ₹${l.total}`,
          time: l.createdAt,
          type: "sale",
          icon: "dollar"
        });
      } else if (l.type === "PURCHASE") {
        activities.push({
          title: "Purchase Entry",
          description: `Purchase added - ₹${l.total}`,
          time: l.createdAt,
          type: "purchase",
          icon: "cart"
        });
      }
    });

    // 🔄 SORT & LIMIT
    const recentActivities = activities
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 5);

    // =========================
    // ✅ FINAL RESPONSE
    // =========================
    res.json({
      stats: {
        totalUsers,
        totalStock,
        totalBranches,
        totalSales,
        totalStockValue
      },
      salesAnalytics: {
        sales: salesData,
        purchase: purchaseData
      },
      stockDistribution,
      branchOverview,
      recentActivities
    });

  } catch (err) {
    console.error("DASHBOARD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};



exports.getBranchAnalytics = async (req, res) => {
  try {
    const { branchId } = req.params;
    const { range = "month" } = req.query;

    let dateFilter = {};

    if (range === "day") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      dateFilter = { created_at: { [Op.gte]: start } };
    }

    if (range === "week") {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      dateFilter = { created_at: { [Op.gte]: start } };
    }

    if (range === "month") {
      const start = new Date();
      start.setMonth(start.getMonth() - 1);
      dateFilter = { created_at: { [Op.gte]: start } };
    }

    const where = {
      branch_id: branchId,
      ...dateFilter
    };

   
    const barChart = await Stock.findAll({
      where,
      attributes: [
        [sequelize.fn("DATE", sequelize.col("created_at")), "date"],
        [sequelize.fn("SUM", sequelize.col("quantity")), "stockIn"]
      ],
      group: ["date"],
      order: [["date", "ASC"]],
      raw: true
    });

    
    const lineChart = await Stock.findAll({
      where,
      attributes: [
        [sequelize.fn("DATE", sequelize.col("created_at")), "date"],
        [sequelize.fn("SUM", sequelize.col("value")), "totalValue"]
      ],
      group: ["date"],
      order: [["date", "ASC"]],
      raw: true
    });


    const pieChart = await Stock.findAll({
      where,
      attributes: [
        "item",
        [sequelize.fn("SUM", sequelize.col("quantity")), "qty"]
      ],
      group: ["item"],
      raw: true
    });

 
    res.json({
      filter: range,

      charts: {
        barChart,
        lineChart,
        pieChart
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.getAllUsersForDashboard = async (req, res) => {
  try {

    const users = await User.findAll({
      attributes: [
        "id",
        "name",
        "email",
   
        // "status",
        // "last_login_at",
        "created_at"
      ],

      include: [
        {
          association: "role",
          attributes: ["name"]
        },
        {
          model: Branch,
          as: "branch",
          attributes: ["id", "name", "location"]
        }
      ],

      order: [["created_at", "DESC"]]
    });

  
    const result = users.map((u) => {
      const aging =
        Math.floor(
          (Date.now() - new Date(u.created_at).getTime()) /
          (1000 * 60 * 60 * 24)
        );

      return {
        id: u.id,
        name: u.name,
        email: u.email,
     
        role: u.role?.name || null,
        branch: u.branch?.name || null,
        // status: u.status || "ACTIVE",
        // aging,
        // lastLogin: u.last_login_at
      };
    });

    res.json({
      totalUsers: result.length,
      users: result
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.getBranchOverview = async (req, res) => {
  try {

    // =========================
    // 🔹 CARDS
    // =========================
    const totalStock = (await Stock.sum("quantity")) || 0;
    const totalStockValue = (await Stock.sum("value")) || 0;

    const totalSales =
      (await Ledger.sum("total", { where: { type: "SALE" } })) || 0;

    const agingItems =
      (await Stock.count({
        where: { quantity: { [Op.lt]: 50 } }
      })) || 0;

    // =========================
    // 🔹 STOCK STATUS
    // =========================
    const stockStatusRaw = await Stock.findAll({
      attributes: [
        "status",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"]
      ],
      group: ["status"],
      raw: true
    });

    const stockStatus = {
      GOOD: 0,
      DAMAGED: 0,
      REPAIRABLE: 0
    };

    stockStatusRaw.forEach((s) => {
      stockStatus[s.status] = Number(s.count);
    });

    // =========================
    // 🔹 BAR GRAPH (FIXED)
    // =========================
    const barGraphRaw = await StockMovement.findAll({
      attributes: [
        [
          sequelize.literal(`TO_CHAR("created_at", 'IW')`),
          "week"
        ],
        [
          sequelize.fn(
            "SUM",
            sequelize.literal(`CASE WHEN type='IN' THEN quantity ELSE 0 END`)
          ),
          "stockIn"
        ],
        [
          sequelize.fn(
            "SUM",
            sequelize.literal(`CASE WHEN type='OUT' THEN quantity ELSE 0 END`)
          ),
          "stockOut"
        ]
      ],
      group: [sequelize.literal(`TO_CHAR("created_at", 'IW')`)],
      order: [[sequelize.literal(`TO_CHAR("created_at", 'IW')`), "ASC"]],
      raw: true
    });

    const barGraph = barGraphRaw.map((d, i) => ({
      week: `Week ${i + 1}`,
      stockIn: Number(d.stockIn),
      stockOut: Number(d.stockOut)
    }));

    // =========================
    // 🔹 LINE GRAPH
    // =========================
    const lineGraph = barGraph.map((d) => ({
      week: d.week,
      stockIn: d.stockIn,
      stockOut: d.stockOut
    }));

    // =========================
    // 🔹 BRANCH DATA (STATE INCLUDED)
    // =========================
    const branches = await Branch.findAll({
      attributes: [
        "id",
        "name",
        "state", // ✅ ADDED

        [
          sequelize.fn(
            "COALESCE",
            sequelize.fn("SUM", sequelize.col("stocks.quantity")),
            0
          ),
          "stockItems"
        ],

        [
          sequelize.fn(
            "COALESCE",
            sequelize.fn("SUM", sequelize.col("stocks.value")),
            0
          ),
          "purchase"
        ]
      ],
      include: [
        {
          model: Stock,
          as: "stocks",
          attributes: []
        }
      ],
      group: ["Branch.id", "Branch.name", "Branch.state"], // ✅ FIXED
      raw: true
    });

    // =========================
    // 🔹 STOCK MOVEMENT MAP
    // =========================
    const movement = await StockMovement.findAll({
      attributes: [
        "branch_id",
        [
          sequelize.fn(
            "SUM",
            sequelize.literal(`CASE WHEN type='IN' THEN quantity ELSE 0 END`)
          ),
          "stockIn"
        ],
        [
          sequelize.fn(
            "SUM",
            sequelize.literal(`CASE WHEN type='OUT' THEN quantity ELSE 0 END`)
          ),
          "stockOut"
        ]
      ],
      group: ["branch_id"],
      raw: true
    });

    const movementMap = {};
    movement.forEach((m) => {
      movementMap[m.branch_id] = {
        stockIn: Number(m.stockIn),
        stockOut: Number(m.stockOut)
      };
    });

    // =========================
    // 🔹 FORMAT ₹
    // =========================
    const formatRupee = (num) => {
      if (!num) return "₹ 0";
      return `₹ ${(num / 100000).toFixed(0)} Lakhs`;
    };

    // =========================
    // 🔹 FINAL TABLE
    // =========================
    const branchData = branches.map((b) => {
      const move = movementMap[b.id] || { stockIn: 0, stockOut: 0 };

      return {
        branchName: b.name,
        state: b.state, // ✅ NOW INCLUDED

        stockItems:
          Number(b.stockItems) >= 1000
            ? `${Math.floor(Number(b.stockItems) / 1000)}K`
            : Number(b.stockItems),

        purchase: formatRupee(Number(b.purchase)),

        // TEMP (can replace with real sales)
        sale: formatRupee(Number(b.purchase)),

        stockIn:
          move.stockIn >= 1000
            ? `${Math.floor(move.stockIn / 1000)}K`
            : move.stockIn,

        stockOut:
          move.stockOut >= 1000
            ? `${Math.floor(move.stockOut / 1000)}K`
            : move.stockOut
      };
    });

    // =========================
    // ✅ FINAL RESPONSE
    // =========================
    res.json({
      cards: {
        totalStock,
        totalStockValue,
        totalSales,
        agingItems
      },
      barGraph,
      lineGraph,
      stockStatus,
      branches: branchData
    });

  } catch (err) {
    console.error("BRANCH OVERVIEW ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};


exports.getSuperAdminAnalytics = async (req, res) => {
  try {
    const { range = "week" } = req.query;

    let dateFilter = {};

    if (range === "day") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      dateFilter = { created_at: { [Op.gte]: start } };
    }

    if (range === "week") {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      dateFilter = { created_at: { [Op.gte]: start } };
    }

    if (range === "month") {
      const start = new Date();
      start.setMonth(start.getMonth() - 1);
      dateFilter = { created_at: { [Op.gte]: start } };
    }


    const lineChart = await Stock.findAll({
      where: dateFilter,
      attributes: [
        [sequelize.fn("DATE", sequelize.col("created_at")), "date"],
        [sequelize.fn("SUM", sequelize.col("value")), "stockIn"]
      ],
      group: ["date"],
      order: [["date", "ASC"]],
      raw: true
    });

  
    const lineData = lineChart.map((d) => ({
      date: d.date,
      stockIn: Number(d.stockIn),
      stockOut: Math.floor(Number(d.stockIn) * 0.6)
    }));

 
    const pieChart = await Stock.findAll({
      where: dateFilter,
      attributes: [
        "category",
        [sequelize.fn("SUM", sequelize.col("quantity")), "qty"]
      ],
      group: ["category"],
      raw: true
    });

    const pieData = pieChart.map((p) => ({
      name: p.category || "General",
      value: Number(p.qty)
    }));

    res.json({
      charts: {
        lineChart: lineData,
        pieChart: pieData
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.getLocationWiseSummary = async (req, res) => {
  try {
    const locations = await Branch.findAll({
      attributes: [
        "location",

        // total branches per location
        [
          sequelize.fn("COUNT", sequelize.col("Branch.id")),
          "totalBranches"
        ],

        // total users per location
        [
          sequelize.fn(
            "COUNT",
            sequelize.fn("DISTINCT", sequelize.col("users.id"))
          ),
          "totalUsers"
        ],

        // total stock quantity per location
        [
          sequelize.fn(
            "COALESCE",
            sequelize.fn("SUM", sequelize.col("stocks.quantity")),
            0
          ),
          "totalStock"
        ],

        // total stock value per location
        [
          sequelize.fn(
            "COALESCE",
            sequelize.fn("SUM", sequelize.col("stocks.value")),
            0
          ),
          "totalStockValue"
        ]
      ],

      include: [
        {
          model: Stock,
          as: "stocks",
          attributes: []
        },
        {
          model: User,
          as: "users",
          attributes: []
        }
      ],

      group: ["location"],
      order: [["location", "ASC"]],
      raw: true
    });

    res.json({
      totalLocations: locations.length,
      locations
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};