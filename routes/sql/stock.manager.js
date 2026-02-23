const express = require("express");
const router = express.Router();

const {
  getStockManagerDashboard,
  getBranchStocks,
  updateStockQuantity,
  getStockManagerAnalytics
} = require("../../controllers/sqlbase/manager/stock.manager");

const auth = require("../../middleware/auth");
const checkRole = require("../../middleware/role");

router.get(
  "/dashboard",
  auth,
  checkRole(["stock_manager"]),
  getStockManagerDashboard
);

router.get(
  "/stocks",
  auth,
  checkRole(["stock_manager"]),
  getBranchStocks
);

router.put(
  "/stock/:stockId",
  auth,
  checkRole(["stock_manager"]),
  updateStockQuantity
);

router.get(
  "/analytics",
  auth,
  checkRole(["stock_manager"]),
  getStockManagerAnalytics
);

module.exports = router;