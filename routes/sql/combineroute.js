const express = require("express");
const router = express.Router();

const {
  getInventoryDashboard,
  getInventoryDashboardCharts,
  getBranchOverview,
  getBranchDashboard,getFullInventoryDashboard,getInventoryTable,getPurchaseSalesSummary,getPurchaseItems,getDamageStock
  
} = require("../../controllers/sqlbase/combine/combinemanager");

const auth = require("../../middleware/auth");
const checkRole = require("../../middleware/role");
// =====================================
// GLOBAL INVENTORY DASHBOARD
// =====================================

// Table inventory data
router.get("/dashboard/inventory",auth,checkRole(["super_inventory_manager"]), getInventoryDashboard);

// Charts (line + donut)
router.get("/dashboard/charts",auth,checkRole(["super_inventory_manager"]), getInventoryDashboardCharts);


// =====================================
// BRANCH OVERVIEW (All branches)
// =====================================

router.get("/dashboard/branches", auth,checkRole(["super_inventory_manager"]),getFullInventoryDashboard);


// =====================================
// SINGLE BRANCH DASHBOARD
// Example: /dashboard/branch/Maharashtra
// =====================================

router.get("/dashboard/branch/:branch", getBranchDashboard);
router.get("/inventory-table", getDamageStock);

// getPurchaseSalesSummary

module.exports = router;