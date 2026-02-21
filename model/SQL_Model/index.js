const sequelize = require("../../config/sqlcon");

const User = require("./user");
const Role = require("./role");
const Stock = require("./stock.record");
const Branch = require("./branch");

// Role relations
User.belongsTo(Role, { foreignKey: "role_id", as: "role" });
Role.hasMany(User, { foreignKey: "role_id", as: "users" });

// Branch relations
Branch.hasMany(User, { foreignKey: "branch_id", as: "users" });
User.belongsTo(Branch, { foreignKey: "branch_id", as: "branch" });

// Stock relations
User.hasMany(Stock, { foreignKey: "owner_id", as: "stocks" });
Stock.belongsTo(User, { foreignKey: "owner_id", as: "owner" });

Branch.hasMany(Stock, { foreignKey: "branch_id", as: "stocks" });
Stock.belongsTo(Branch, { foreignKey: "branch_id", as: "branch" });

const initDB = async () => {
  await sequelize.authenticate();
  await sequelize.sync({ alter: true });

  const roles = [
    "super_admin",
    "admin",
    "hr_admin",
    "stock_manager",
    "sales_manager",
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
  Branch
};
