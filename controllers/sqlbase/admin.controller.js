const { Branch, User, Role, Stock, sequelize } = require("../../model/SQL_Model");
const { Op } = require("sequelize");

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



exports.createBranch = async (req, res) => {
  const t = await sequelize.transaction(); // safety transaction

  try {
    const {
      name,
      code,
      location,
      type,
      adminEmail,
      adminPassword
    } = req.body;

    if (!name || !code || !location || !type || !adminEmail || !adminPassword) {
      return res.status(400).json({
        error: "Branch info + admin email/password required"
      });
    }

    // branch exists check
    const exists = await Branch.findOne({
      where: {
        [sequelize.Op.or]: [{ name }, { code }]
      }
    });

    if (exists) {
      return res.status(400).json({
        error: "Branch name or code already exists"
      });
    }

    // admin role get
    const adminRole = await Role.findOne({
      where: { name: "admin" }
    });

    if (!adminRole) {
      return res.status(400).json({
        error: "Admin role not found in DB"
      });
    }

    // check admin email exists
    const emailExists = await User.findOne({
      where: { email: adminEmail }
    });

    if (emailExists) {
      return res.status(400).json({
        error: "Admin email already exists"
      });
    }

    const branch = await Branch.create(
      {
        name,
        code,
        location,
        type,
        status: "ACTIVE"
      },
      { transaction: t }
    );


    const adminUser = await User.create(
      {
        name: `${name} Admin`,
        email: adminEmail,
        password: adminPassword, // hashed by hook
        role_id: adminRole.id,
        branch_id: branch.id
      },
      { transaction: t }
    );

    await t.commit();

    res.status(201).json({
      message: "Branch + Admin created successfully",
      branch,
      admin: {
        email: adminUser.email
      }
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

    const totalUsers = await User.count();

    const totalBranches = await Branch.count();

    const totalStock = (await Stock.sum("quantity")) || 0;

    const totalStockValue = (await Stock.sum("value")) || 0;

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
      order: [["id", "ASC"]],
      raw: true
    });

    // frontend friendly format
    const result = branches.map((b) => ({
      branchId: b.id,
      branchName: b.name,
      stockItems: Number(b.stockItems),

      // demo values (future sales table se replace)
      purchase: Number(b.purchase),
      sale: Math.floor(Number(b.purchase) * 0.4),

      stockIn: Number(b.stockItems),
      stockOut: Math.floor(Number(b.stockItems) * 0.3)
    }));


    res.json({
      stats: {
        totalUsers,
        totalStock,
        totalBranches,
        totalStockValue
      },

       totalBranches: result.length,
      branches: result
    });

  } catch (err) {
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
      order: [["id", "ASC"]],
      raw: true
    });

    // frontend friendly format
    const result = branches.map((b) => ({
      branchId: b.id,
      branchName: b.name,
      stockItems: Number(b.stockItems),

      // demo values (future sales table se replace)
      purchase: Number(b.purchase),
      sale: Math.floor(Number(b.purchase) * 0.4),

      stockIn: Number(b.stockItems),
      stockOut: Math.floor(Number(b.stockItems) * 0.3)
    }));

    res.json({
      totalBranches: result.length,
      branches: result
    });

  } catch (err) {
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