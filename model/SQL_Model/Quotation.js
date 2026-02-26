// models/Quotation.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../config/sqlcon");

const Quotation = sequelize.define("Quotation", {
  client_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  branch_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  total_amount: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  gst_amount: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM("pending", "approved", "rejected"),
    defaultValue: "pending",
  },
  
}, {
  tableName: "quotations",
  timestamps: true,
});

module.exports = Quotation;


// models/QuotationItem.js
const { DataTypes } = require("sequelize");
const sequelize = require("../../config/sqlcon");
const Quotation = require("./Quotation");

const QuotationItem = sequelize.define("QuotationItem", {
  quotation_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  product_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  unit_price: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  specifications: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  subtotal: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
}, {
  tableName: "quotation_items",
  timestamps: true,
});

Quotation.hasMany(QuotationItem, { foreignKey: "quotation_id", as: "items" });
QuotationItem.belongsTo(Quotation, { foreignKey: "quotation_id" });

module.exports = QuotationItem;