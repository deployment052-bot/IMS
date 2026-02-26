const express = require("express");
const router = express.Router();
const salemanager=require('../../controllers/sqlbase/manager/sales.manager')

const auth = require("../../middleware/auth");
const checkRole = require("../../middleware/role");




router.post("/clients-create", auth, checkRole(["sales_manager","admin","super_admin"]), salemanager.createClient);
router.get("/clients", auth, checkRole(["sales_manager","admin","finance","super_stock_manager"]), salemanager.listClients);

router.post("/ledger/sale", auth, checkRole(["sales_manager","admin"]), salemanager.createSaleEntry);
router.post("/ledger/payment", auth, checkRole(["sales_manager","admin","finance"]), salemanager.addClientPayment);

router.get("/ledger/:clientId", auth, checkRole(["sales_manager","admin","finance","super_stock_manager","super_admin"]), salemanager.getClientLedger);

module.exports=router;