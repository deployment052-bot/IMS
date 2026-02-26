const sequelize = require("../../config/sqlcon");

const User = require("./user");
const Role = require("./role");
const Stock = require("./stock.record");
const Branch = require("./branch");
const StockMovement = require("./stockmovement");
const Ledger = require("./ladger");

// ✅ ADD THESE
const Client = require("./client");
const ClientLedger = require("./client.ladger");


Stock.hasMany(StockMovement, { foreignKey: "stock_id" });
StockMovement.belongsTo(Stock, { foreignKey: "stock_id" });



User.belongsTo(Role, { foreignKey: "role_id", as: "role" });
Role.hasMany(User, { foreignKey: "role_id", as: "users" });


Branch.hasMany(User, { foreignKey: "branch_id", as: "users" });
User.belongsTo(Branch, { foreignKey: "branch_id", as: "branch" });

Branch.hasMany(Stock, { foreignKey: "branch_id", as: "stocks" });
Stock.belongsTo(Branch, { foreignKey: "branch_id", as: "branch" });


User.hasMany(Stock, { foreignKey: "owner_id", as: "stocks" });
Stock.belongsTo(User, { foreignKey: "owner_id", as: "owner" });



Branch.hasMany(Ledger, { foreignKey: "branch_id", as: "ledgerEntries" });
Ledger.belongsTo(Branch, { foreignKey: "branch_id", as: "branch" });

Stock.hasMany(Ledger, { foreignKey: "stock_id", as: "ledgerEntries" });
Ledger.belongsTo(Stock, { foreignKey: "stock_id", as: "stock" });

User.hasMany(Ledger, { foreignKey: "created_by", as: "ledgerCreated" });
Ledger.belongsTo(User, { foreignKey: "created_by", as: "creator" });



Branch.hasMany(Client, { foreignKey: "branch_id", as: "clients" });
Client.belongsTo(Branch, { foreignKey: "branch_id", as: "branch" });

Client.hasMany(ClientLedger, { foreignKey: "client_id", as: "ledger" });
ClientLedger.belongsTo(Client, { foreignKey: "client_id", as: "client" });

Branch.hasMany(ClientLedger, { foreignKey: "branch_id", as: "clientLedger" });
ClientLedger.belongsTo(Branch, { foreignKey: "branch_id", as: "branch" });


const initDB = async () => {
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });

  const roles = [
    "super_admin",
    "admin",
    "hr_admin",
    "stock_manager",
    "sales_manager",
    "super_stock_manager",
    "purchase_manager",
    "finance"
  ];

  for (const name of roles) {
    await Role.findOrCreate({ where: { name } });
  }

  console.log("✅ DB connected");
};


module.exports = {
  sequelize,
  initDB,
  User,
  Role,
  Stock,
  Branch,
  Ledger,
  Client,         
  ClientLedger    
};