const express = require("express");
const router = express.Router();

const {
  getStockLocations,
  getBranchesByLocation,
  getBranchDashboard,
  updateStockQuantity,  getStockManagerHeadDashboard,getSuperStockManagerDashboard,getSuperBranchDashboard,getItemBranchAnalytics,getAgingAnalytics,getSuperStockManagerLocationDashboard

} = require("../../controllers/sqlbase/manager/stock.manager");

const auth = require("../../middleware/auth");
const checkRole = require("../../middleware/role");



router.get(
  "/locations",
  auth,
  checkRole(["stock_manager","super_stock_manager"]),
  getStockLocations
);



router.get(
  "/location/:location",
  auth,
  checkRole(["stock_manager"]),
  getBranchesByLocation
);



router.get(
  "/branch/:branchId",
  auth,
  checkRole(["stock_manager"]),
  getBranchDashboard
);



// router.put(
//   "/stock/:stockId",
//   auth,
//   checkRole(["stock_manager"]),
//   updateStockQuantity
// );

router.get(
  "/head-dashboard",
  auth,
  checkRole(["stock_manager"]),
  getStockManagerHeadDashboard
);
router.get(
  "/head-dashboards",
  auth,
  checkRole(["super_stock_manager"]),
  getSuperStockManagerDashboard
);
router.get(
  "/branch/:branchId",
  auth,
  checkRole(["super_stock_manager","stock_manager","super_admin","admin"]),
  getSuperBranchDashboard
);
router.get(
  "/analytics/item/:branchId/:itemName",
  auth,
  checkRole(["stock_manager", "super_stock_manager", "super_admin"]),
  getItemBranchAnalytics
);
router.get("/aging/:branchId", getAgingAnalytics);

router.get(
  "/locations-super/:location",
  auth,
  checkRole(["stock_manager","super_stock_manager"]),
  getSuperStockManagerLocationDashboard

);
// getSuperStockManagerLocationDashboard

module.exports = router;