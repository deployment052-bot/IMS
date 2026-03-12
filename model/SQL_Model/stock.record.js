const { DataTypes } = require("sequelize");
const sequelize = require("../../config/sqlcon");

const Stock = sequelize.define(
  "Stock",
  {
    item: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    category: {                      // NEW
      type: DataTypes.STRING,
      allowNull: true,
    },

    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    rate: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },

    value: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },

    hsn: {                           // NEW
      type: DataTypes.STRING,
      allowNull: true,
    },

    grn: {                           // NEW
      type: DataTypes.STRING,
      allowNull: true,
    },

    batch_no: {                      // NEW
      type: DataTypes.STRING,
      allowNull: true,
    },

    aging: {                         // NEW (days)
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    status: {                        // NEW
      type: DataTypes.ENUM("GOOD", "DAMAGED", "REPAIRABLE"),
      defaultValue: "GOOD",
    },
     po_number:{
      type:DataTypes.STRING,
     allowNull:false,
      defaultValue: "N/A",
     },
    owner_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    branch_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: "stocks",
    underscored: true,
  }
);

// ===============================
// AUTO CALCULATE VALUE
// ===============================
Stock.beforeCreate((s) => {
  s.value = s.quantity * s.rate;
});

module.exports = Stock;
