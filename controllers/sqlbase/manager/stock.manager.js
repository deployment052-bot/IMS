const { Branch, User, Role, Stock, sequelize } = require("../../../model/SQL_Model");
const { Op } = require("sequelize");

exports.getStockManagerDashboard = async (req, res) => {
  try {
    const branchId = req.user.branch_id;

    const totalStock = await Stock.sum("quantity", {
      where: { branch_id: branchId }
    }) || 0;

    const totalValue = await Stock.sum("value", {
      where: { branch_id: branchId }
    }) || 0;

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

    res.json({
      branch_id: branchId,
      stats: {
        totalStock,
        totalValue,
        lowStock,
        damagedStock
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
exports.getBranchStocks = async (req, res) => {
  try {

    const stocks = await Stock.findAll({
      where: { branch_id: req.user.branch_id },
      include: [
        { association: "owner", attributes: ["id", "name"] }
      ],
      order: [["created_at", "DESC"]]
    });

    res.json({
      total: stocks.length,
      stocks
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateStockQuantity = async (req, res) => {
  try {
    const { stockId } = req.params;
    const { quantity } = req.body;

    const stock = await Stock.findOne({
      where: {
        id: stockId,
        branch_id: req.user.branch_id
      }
    });

    if (!stock) {
      return res.status(404).json({
        error: "Stock not found or unauthorized"
      });
    }

    stock.quantity = quantity;
    stock.value = quantity * stock.rate;

    await stock.save();

    res.json({
      message: "Stock updated successfully",
      stock
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getStockManagerAnalytics = async (req, res) => {
  try {
    const branchId = req.user.branch_id;

    const categoryDistribution = await Stock.findAll({
      where: { branch_id: branchId },
      attributes: [
        "category",
        [sequelize.fn("SUM", sequelize.col("quantity")), "total"]
      ],
      group: ["category"],
      raw: true
    });

    const statusDistribution = await Stock.findAll({
      where: { branch_id: branchId },
      attributes: [
        "status",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"]
      ],
      group: ["status"],
      raw: true
    });

    res.json({
      categoryDistribution,
      statusDistribution
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};




exports.getStockManagerFullDashboard = async (req, res) => {
  try {
    const branchId = req.user.branch_id;

    const totalStock = await Stock.sum("quantity", {
      where: { branch_id: branchId }
    }) || 0;

    const lowStock = await Stock.count({
      where: {
        branch_id: branchId,
        quantity: { [Op.lt]: 5 }
      }
    });

    const scrapItems = await Stock.count({
      where: {
        branch_id: branchId,
        status: "DAMAGED"
      }
    });

    const transitItems = await Stock.sum("quantity", {
      where: {
        branch_id: branchId,
        status: "REPAIRABLE"
      }
    }) || 0;

    // CATEGORY BAR CHART
    const categoryChart = await Stock.findAll({
      where: { branch_id: branchId },
      attributes: [
        "category",
        [sequelize.fn("SUM", sequelize.col("quantity")), "currentStock"]
      ],
      group: ["category"],
      raw: true
    });

    // AGING ANALYTICS
    const agingData = await Stock.findAll({
      where: { branch_id: branchId },
      attributes: [
        "aging",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"]
      ],
      group: ["aging"],
      raw: true
    });

    // MONTHLY MOVEMENT
    const monthlyTrend = await Stock.findAll({
      where: { branch_id: branchId },
      attributes: [
        [sequelize.fn("DATE_FORMAT", sequelize.col("created_at"), "%Y-%m"), "month"],
        [sequelize.fn("SUM", sequelize.col("quantity")), "stockIn"]
      ],
      group: ["month"],
      raw: true
    });

    res.json({
      stats: {
        totalStock,
        lowStock,
        scrapItems,
        transitItems
      },
      charts: {
        categoryChart,
        agingData,
        monthlyTrend
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};