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

    // ========================
    // GLOBAL STATS
    // ========================
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