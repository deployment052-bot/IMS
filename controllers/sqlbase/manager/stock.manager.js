const { Branch, Stock, sequelize } = require("../../../model/SQL_Model");
const { Op } = require("sequelize");



exports.getStockLocations = async (req, res) => {
  try {
    const locations = await Branch.findAll({
      attributes: [
        "location",
        [
          sequelize.fn("COUNT", sequelize.col("Branch.id")),
          "totalBranches"
        ],
        [
          sequelize.fn(
            "COALESCE",
            sequelize.fn("SUM", sequelize.col("stocks.quantity")),
            0
          ),
          "totalStock"
        ],
        [
          sequelize.fn(
            "COALESCE",
            sequelize.fn("SUM", sequelize.col("stocks.value")),
            0
          ),
          "totalValue"
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
      raw: true
    });

    res.json({ locations });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// ==========================================
// 2️⃣ GET BRANCH LIST BY LOCATION
// ==========================================
exports.getBranchesByLocation = async (req, res) => {
  try {
    const { location } = req.params;

    const branches = await Branch.findAll({
      where: { location },
      attributes: [
        "id",
        "name",
        [
          sequelize.fn(
            "COALESCE",
            sequelize.fn("SUM", sequelize.col("stocks.quantity")),
            0
          ),
          "totalStock"
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

    res.json({ branches });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// ==========================================
// 3️⃣ GET BRANCH DASHBOARD
// ==========================================
exports.getBranchDashboard = async (req, res) => {
  try {
    const { branchId } = req.params;

    const totalStock =
      (await Stock.sum("quantity", {
        where: { branch_id: branchId }
      })) || 0;

    const totalValue =
      (await Stock.sum("value", {
        where: { branch_id: branchId }
      })) || 0;

    const lowStock = await Stock.count({
      where: {
        branch_id: branchId,
        quantity: { [Op.lt]: 5 }
      }
    });

    const damagedStock = await Stock.count({
      where: {
        branch_id: branchId,
        status: "DAMAGED"
      }
    });

    // Category Chart
    const categoryChart = await Stock.findAll({
      where: { branch_id: branchId },
      attributes: [
        "category",
        [sequelize.fn("SUM", sequelize.col("quantity")), "qty"]
      ],
      group: ["category"],
      raw: true
    });

    // Monthly Trend (PostgreSQL safe)
    const monthlyTrend = await Stock.findAll({
      where: { branch_id: branchId },
      attributes: [
        [
          sequelize.fn(
            "TO_CHAR",
            sequelize.col("created_at"),
            "YYYY-MM"
          ),
          "month"
        ],
        [sequelize.fn("SUM", sequelize.col("quantity")), "stock"]
      ],
      group: [
        sequelize.fn(
          "TO_CHAR",
          sequelize.col("created_at"),
          "YYYY-MM"
        )
      ],
      raw: true
    });

    // Table Data
    const stocks = await Stock.findAll({
      where: { branch_id: branchId },
      order: [["created_at", "DESC"]]
    });

    res.json({
      stats: {
        totalStock,
        totalValue,
        lowStock,
        damagedStock
      },
      charts: {
        categoryChart,
        monthlyTrend
      },
      stocks
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getStockManagerHeadDashboard = async (req, res) => {
  try {


    const totalStock = (await Stock.sum("quantity")) || 0;

    const totalValue = (await Stock.sum("value")) || 0;

    const lowStock = await Stock.count({
      where: { quantity: { [Op.lt]: 5 } }
    });

    const scrapItems = await Stock.count({
      where: { status: "DAMAGED" }
    });

    const transitItems = (await Stock.sum("quantity", {
      where: { status: "REPAIRABLE" }
    })) || 0;


    // ========================
    // CATEGORY CHART (GLOBAL)
    // ========================
    const categoryChart = await Stock.findAll({
      attributes: [
        "category",
        [sequelize.fn("SUM", sequelize.col("quantity")), "qty"]
      ],
      group: ["category"],
      raw: true
    });


    // ========================
    // MONTHLY TREND (PostgreSQL Safe)
    // ========================
    const monthlyTrend = await Stock.findAll({
      attributes: [
        [
          sequelize.fn("TO_CHAR", sequelize.col("created_at"), "YYYY-MM"),
          "month"
        ],
        [sequelize.fn("SUM", sequelize.col("quantity")), "stock"]
      ],
      group: [
        sequelize.fn("TO_CHAR", sequelize.col("created_at"), "YYYY-MM")
      ],
      order: [
        [
          sequelize.fn("TO_CHAR", sequelize.col("created_at"), "YYYY-MM"),
          "ASC"
        ]
      ],
      raw: true
    });


    // ========================
    // COMPLETE INVENTORY TABLE
    // ========================
    const stocks = await Stock.findAll({
      include: [
        {
          model: Branch,
          as: "branch",
          attributes: ["id", "name", "location"]
        }
      ],
      order: [["created_at", "DESC"]]
    });


    res.json({
      stats: {
        totalStock,
        totalValue,
        lowStock,
        scrapItems,
        transitItems
      },
      charts: {
        categoryChart,
        monthlyTrend
      },
      stocks
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSuperStockManagerDashboard = async (req, res) => {
  try {

    // =========================
    // GLOBAL STATS
    // =========================
    const totalStock = (await Stock.sum("quantity")) || 0;
    const totalValue = (await Stock.sum("value")) || 0;

    const lowStock = await Stock.count({
      where: { quantity: { [Op.lt]: 5 } }
    });

    const damagedStock = await Stock.count({
      where: { status: "DAMAGED" }
    });

    const repairableStock = (await Stock.sum("quantity", {
      where: { status: "REPAIRABLE" }
    })) || 0;

    // =========================
    // CATEGORY GRAPH
    // =========================
    const categoryChart = await Stock.findAll({
      attributes: [
        "category",
        [sequelize.fn("SUM", sequelize.col("quantity")), "currentStock"]
      ],
      group: ["category"],
      raw: true
    });

    // =========================
    // STOCK IN / OUT (DEMO LOGIC)
    // =========================
    const stockMovement = await Stock.findAll({
      attributes: [
        [sequelize.fn("DATE", sequelize.col("created_at")), "date"],
        [sequelize.fn("SUM", sequelize.col("quantity")), "stockIn"]
      ],
      group: ["date"],
      order: [["date", "ASC"]],
      raw: true
    });

    const movementData = stockMovement.map(d => ({
      date: d.date,
      stockIn: Number(d.stockIn),
      stockOut: Math.floor(Number(d.stockIn) * 0.4) // replace later with real sales table
    }));

   
    const stocks = await Stock.findAll({
      include: [
        {
          model: Branch,
          as: "branch",
          attributes: ["id", "name", "location"]
        }
      ],
      order: [["created_at", "DESC"]]
    });

    res.json({
      stats: {
        totalStock,
        totalValue,
        lowStock,
        damagedStock,
        repairableStock
      },
      charts: {
        categoryChart,
        movementData
      },
      stocks
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSuperStockManagerDashboard = async (req, res) => {
  try {

    // =========================
    // GLOBAL STATS
    // =========================
    const totalStock = (await Stock.sum("quantity")) || 0;
    const totalValue = (await Stock.sum("value")) || 0;

    const lowStock = await Stock.count({
      where: { quantity: { [Op.lt]: 5 } }
    });

    const damagedStock = await Stock.count({
      where: { status: "DAMAGED" }
    });

    const repairableStock = (await Stock.sum("quantity", {
      where: { status: "REPAIRABLE" }
    })) || 0;

    // =========================
    // CATEGORY BAR CHART
    // =========================
    const categoryChartRaw = await Stock.findAll({
      attributes: [
        "category",
        [sequelize.fn("SUM", sequelize.col("quantity")), "currentStock"]
      ],
      group: ["category"],
      raw: true
    });

    const categoryChart = categoryChartRaw.map(item => ({
      name: item.category,
      currentStock: Number(item.currentStock),
      stockIn: Math.floor(Number(item.currentStock) * 0.6),
      stockOut: Math.floor(Number(item.currentStock) * 0.4),
      aging: Math.floor(Number(item.currentStock) * 0.2)
    }));

    // =========================
    // STOCK MOVEMENT (MONTHLY)
    // =========================
    const monthlyTrendRaw = await Stock.findAll({
      attributes: [
        [
          sequelize.fn("TO_CHAR", sequelize.col("created_at"), "YYYY-MM"),
          "month"
        ],
        [sequelize.fn("SUM", sequelize.col("quantity")), "stockIn"]
      ],
      group: [
        sequelize.fn("TO_CHAR", sequelize.col("created_at"), "YYYY-MM")
      ],
      order: [
        [
          sequelize.fn("TO_CHAR", sequelize.col("created_at"), "YYYY-MM"),
          "ASC"
        ]
      ],
      raw: true
    });

    const movementData = monthlyTrendRaw.map(item => ({
      month: item.month,
      stockIn: Number(item.stockIn),
      stockOut: Math.floor(Number(item.stockIn) * 0.4)
    }));

    // =========================
    // INVENTORY TABLE
    // =========================
    const stocks = await Stock.findAll({
      include: [
        {
          model: Branch,
          as: "branch",
          attributes: ["id", "name", "location"]
        }
      ],
      order: [["created_at", "DESC"]]
    });

    res.json({
      stats: {
        totalStock,
        totalValue,
        lowStock,
        damagedStock,
        repairableStock
      },
      charts: {
        categoryChart,
        movementData
      },
      stocks
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSuperStockManagerLocationDashboard = async (req, res) => {
  try {
    const { location } = req.params;


    const branches = await Branch.findAll({
      where: { location },
      attributes: ["id"]
    });

    const branchIds = branches.map(b => b.id);

    if (branchIds.length === 0) {
      return res.json({
        location,
        stats: {},
        charts: {},
        stocks: []
      });
    }

 
    const totalStock = (await Stock.sum("quantity", {
      where: { branch_id: branchIds }
    })) || 0;

    const totalValue = (await Stock.sum("value", {
      where: { branch_id: branchIds }
    })) || 0;

    const lowStock = await Stock.count({
      where: {
        branch_id: branchIds,
        quantity: { [Op.lt]: 5 }
      }
    });

    const damagedStock = await Stock.count({
      where: {
        branch_id: branchIds,
        status: "DAMAGED"
      }
    });

 
    const categoryChart = await Stock.findAll({
      where: { branch_id: branchIds },
      attributes: [
        "category",
        [sequelize.fn("SUM", sequelize.col("quantity")), "qty"]
      ],
      group: ["category"],
      raw: true
    });

    const monthlyTrend = await Stock.findAll({
      where: { branch_id: branchIds },
      attributes: [
        [
          sequelize.fn("TO_CHAR", sequelize.col("created_at"), "YYYY-MM"),
          "month"
        ],
        [sequelize.fn("SUM", sequelize.col("quantity")), "stock"]
      ],
      group: [
        sequelize.fn("TO_CHAR", sequelize.col("created_at"), "YYYY-MM")
      ],
      order: [
        [
          sequelize.fn("TO_CHAR", sequelize.col("created_at"), "YYYY-MM"),
          "ASC"
        ]
      ],
      raw: true
    });

  
    const stocks = await Stock.findAll({
      where: { branch_id: branchIds },
      include: [
        {
          model: Branch,
          as: "branch",
          attributes: ["id", "name"]
        }
      ],
      order: [["created_at", "DESC"]]
    });

    res.json({
      location,
      stats: {
        totalStock,
        totalValue,
        lowStock,
        damagedStock
      },
      charts: {
        categoryChart,
        monthlyTrend
      },
      stocks
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.getSuperBranchDashboard = async (req, res) => {
  try {
    const { branchId } = req.params;

    const branch = await Branch.findByPk(branchId);
    if (!branch) {
      return res.status(404).json({ error: "Branch not found" });
    }

    
    const totalStock =
      (await Stock.sum("quantity", {
        where: { branch_id: branchId }
      })) || 0;

    const totalValue =
      (await Stock.sum("value", {
        where: { branch_id: branchId }
      })) || 0;

    const lowStock = await Stock.count({
      where: {
        branch_id: branchId,
        quantity: { [Op.lt]: 5 }
      }
    });

    const damagedStock = await Stock.count({
      where: {
        branch_id: branchId,
        status: "DAMAGED"
      }
    });

    const repairableStock =
      (await Stock.sum("quantity", {
        where: {
          branch_id: branchId,
          status: "REPAIRABLE"
        }
      })) || 0;

    // =========================
    // CATEGORY GRAPH
    // =========================
    const categoryChart = await Stock.findAll({
      where: { branch_id: branchId },
      attributes: [
        "category",
        [sequelize.fn("SUM", sequelize.col("quantity")), "qty"]
      ],
      group: ["category"],
      raw: true
    });

    // =========================
    // MONTHLY TREND
    // =========================
    const monthlyTrend = await Stock.findAll({
      where: { branch_id: branchId },
      attributes: [
        [
          sequelize.fn("TO_CHAR", sequelize.col("created_at"), "YYYY-MM"),
          "month"
        ],
        [sequelize.fn("SUM", sequelize.col("quantity")), "stock"]
      ],
      group: [
        sequelize.fn("TO_CHAR", sequelize.col("created_at"), "YYYY-MM")
      ],
      order: [
        [
          sequelize.fn("TO_CHAR", sequelize.col("created_at"), "YYYY-MM"),
          "ASC"
        ]
      ],
      raw: true
    });

    // =========================
    // STOCK TABLE
    // =========================
    const stocks = await Stock.findAll({
      where: { branch_id: branchId },
      order: [["created_at", "DESC"]]
    });

    res.json({
      branchInfo: branch,
      stats: {
        totalStock,
        totalValue,
        lowStock,
        damagedStock,
        repairableStock
      },
      charts: {
        categoryChart,
        monthlyTrend
      },
      stocks
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

//not called yet 
exports.getItemBranchAnalytics = async (req, res) => {
  try {
    const { branchId, itemName } = req.params;

    // 1️⃣ Total Stats
    const totalStock =
      (await Stock.sum("quantity", {
        where: { branch_id: branchId, item: itemName }
      })) || 0;

    const totalValue =
      (await Stock.sum("value", {
        where: { branch_id: branchId, item: itemName }
      })) || 0;

    // 2️⃣ Aging Distribution
    const agingChart = await Stock.findAll({
      where: { branch_id: branchId, item: itemName },
      attributes: [
        "aging",
        [sequelize.fn("SUM", sequelize.col("quantity")), "qty"]
      ],
      group: ["aging"],
      order: [["aging", "ASC"]],
      raw: true
    });

    // 3️⃣ Monthly Movement (PostgreSQL Safe)
    const monthlyTrend = await Stock.findAll({
      where: { branch_id: branchId, item: itemName },
      attributes: [
        [
          sequelize.fn("TO_CHAR", sequelize.col("created_at"), "YYYY-MM"),
          "month"
        ],
        [sequelize.fn("SUM", sequelize.col("quantity")), "stock"]
      ],
      group: [
        sequelize.fn("TO_CHAR", sequelize.col("created_at"), "YYYY-MM")
      ],
      order: [
        [
          sequelize.fn("TO_CHAR", sequelize.col("created_at"), "YYYY-MM"),
          "ASC"
        ]
      ],
      raw: true
    });

    // 4️⃣ Status Distribution
    const statusChart = await Stock.findAll({
      where: { branch_id: branchId, item: itemName },
      attributes: [
        "status",
        [sequelize.fn("SUM", sequelize.col("quantity")), "qty"]
      ],
      group: ["status"],
      raw: true
    });

    res.json({
      branchId,
      item: itemName,
      stats: {
        totalStock,
        totalValue
      },
      charts: {
        agingChart,
        monthlyTrend,
        statusChart
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



exports.getAgingAnalytics = async (req, res) => {
  try {
    const { branchId } = req.params;

    if (!branchId) {
      return res.status(400).json({ error: "Branch ID required" });
    }

  
    const totalItems =
      (await Stock.sum("quantity", {
        where: { branch_id: branchId }
      })) || 0;

 
    const freshStocks =
      (await Stock.sum("quantity", {
        where: {
          branch_id: branchId,
          aging: { [Op.between]: [0, 180] }
        }
      })) || 0;

    
    const critical =
      (await Stock.sum("quantity", {
        where: {
          branch_id: branchId,
          aging: { [Op.gt]: 730 }
        }
      })) || 0;

   
    const avgAging =
      (await Stock.findOne({
        where: { branch_id: branchId },
        attributes: [
          [sequelize.fn("AVG", sequelize.col("aging")), "average"]
        ],
        raw: true
      })) || { average: 0 };


    const agingDistribution = {
      "0-180":
        (await Stock.sum("quantity", {
          where: {
            branch_id: branchId,
            aging: { [Op.between]: [0, 180] }
          }
        })) || 0,

      "181-365":
        (await Stock.sum("quantity", {
          where: {
            branch_id: branchId,
            aging: { [Op.between]: [181, 365] }
          }
        })) || 0,

      "366-730":
        (await Stock.sum("quantity", {
          where: {
            branch_id: branchId,
            aging: { [Op.between]: [366, 730] }
          }
        })) || 0,

      "730+":
        (await Stock.sum("quantity", {
          where: {
            branch_id: branchId,
            aging: { [Op.gt]: 730 }
          }
        })) || 0
    };


    res.json({
      branchId,
      stats: {
        totalItems,
        freshStocks,
        critical,
        averageAging: parseFloat(avgAging.average || 0).toFixed(2)
      },
      charts: {
        agingDistribution
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};