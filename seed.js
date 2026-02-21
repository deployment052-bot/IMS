// const { sequelize, Role, User, Branch, Stock } =
//   require("./model/SQL_Model");

// const seedData = async () => {
//   try {
//     console.log("🚀 Seeding started...");

//     await sequelize.sync({ force: true });

//     /*
//     ================= ROLES =================
//     */
//     const roles = [
//       "super_admin",
//       "admin",
//       "stock_manager",
//       "sales_manager",
//       "purchase_manager",
//       "finance"
//     ];

//     const roleMap = {};

//     for (const r of roles) {
//       const role = await Role.create({ name: r });
//       roleMap[r] = role.id;
//     }

//     console.log("✅ Roles created");

//     /*
//     ================= SUPER ADMIN =================
//     */
//     const superAdmin = await User.create({
//       name: "Super Admin",
//       email: "super@ims.com",
//       password: "123456",
//       role_id: roleMap.super_admin
//     });

//     console.log("✅ Super Admin created");

//     /*
//     ================= CITY DATA =================
//     */
//     const cities = [
//       { city: "Hyderabad", state: "Telangana" },
//       { city: "Kolkata", state: "West Bengal" },
//       { city: "Patna", state: "Bihar" },
//       { city: "Ahmedabad", state: "Gujarat" },
//       { city: "Mumbai", state: "Maharashtra" },
//       { city: "Bangalore", state: "Karnataka" }
//     ];

//     /*
//     ================= CREATE CITY HUB + BRANCHES =================
//     */
//     for (const c of cities) {

//       // ---------- CITY HUB ----------
//       const cityHub = await Branch.create({
//         name: `${c.city} Hub`,
//         code: `HUB-${c.city.toUpperCase()}`,
//         location: c.city,
//         state: c.state,
//         type: "WAREHOUSE",
//         status: "ACTIVE",
//         contact_number: "9999999999",
//         email: `${c.city.toLowerCase()}hub@ims.com`,
//         parent_branch_id: null
//       });

//       console.log(`🏙️ ${c.city} Hub created`);

//       // ---------- 3 BRANCHES PER CITY ----------
//       for (let i = 1; i <= 3; i++) {

//         const branch = await Branch.create({
//           name: `${c.city} Branch ${i}`,
//           code: `${c.city.slice(0,3).toUpperCase()}-${i}`,
//           location: c.city,
//           state: c.state,
//           type: "WAREHOUSE",
//           status: "ACTIVE",
//           contact_number: `99999999${i}`,
//           email: `${c.city.toLowerCase()}${i}@ims.com`,
//           parent_branch_id: cityHub.id
//         });

//         // ================= USERS =================
//         await User.create({
//           name: `${branch.name} Admin`,
//           email: `admin_${branch.code}@ims.com`,
//           password: "123456",
//           role_id: roleMap.admin,
//           branch_id: branch.id
//         });

//         await User.create({
//           name: `${branch.name} Stock Manager`,
//           email: `stock_${branch.code}@ims.com`,
//           password: "123456",
//           role_id: roleMap.stock_manager,
//           branch_id: branch.id
//         });

//         await User.create({
//           name: `${branch.name} Sales Manager`,
//           email: `sales_${branch.code}@ims.com`,
//           password: "123456",
//           role_id: roleMap.sales_manager,
//           branch_id: branch.id
//         });

//         await User.create({
//           name: `${branch.name} Purchase Manager`,
//           email: `purchase_${branch.code}@ims.com`,
//           password: "123456",
//           role_id: roleMap.purchase_manager,
//           branch_id: branch.id
//         });

//         await User.create({
//           name: `${branch.name} Finance`,
//           email: `finance_${branch.code}@ims.com`,
//           password: "123456",
//           role_id: roleMap.finance,
//           branch_id: branch.id
//         });

//         const stockItems = [];

//         for (let s = 1; s <= 100; s++) {
//           const qty = Math.floor(Math.random() * 100) + 1;
//           const rate = Math.floor(Math.random() * 5000) + 100;

//           stockItems.push({
//             branch_id: branch.id,
//             item: `Item-${s}`,
//             quantity: qty,
//             rate,
//             value: qty * rate,
//             owner_id: superAdmin.id
//           });
//         }

//         await Stock.bulkCreate(stockItems);

//         console.log(`🏢 ${branch.name} created with users + stock`);
//       }
//     }

//     console.log("🎉 ENTERPRISE IMS SETUP COMPLETE");
//     process.exit();

//   } catch (err) {
//     console.error("❌ Seed error:", err);
//     process.exit(1);
//   }
// };

// seedData();



// const { Stock } = require("./model/SQL_Model");

// const categories = [
//   "Electronics",
//   "Furniture",
//   "Raw Materials",
//   "Electrical"
// ];

// // HSN map
// const hsnMap = {
//   Electronics: "HSN-8471",
//   Furniture: "HSN-9403",
//   "Raw Materials": "HSN-2501",
//   Electrical: "HSN-8536"
// };

// async function updateStocks() {
//   try {

//     const stocks = await Stock.findAll();

//     for (const stock of stocks) {

//       // random category
//       const category =
//         categories[Math.floor(Math.random() * categories.length)];

//       // unique batch
//       const batchNo = `BATCH-${stock.branch_id}-${stock.id}`;

//       // GRN month based
//       const grn = `GRN-${new Date().getFullYear()}-${String(
//         new Date().getMonth() + 1
//       ).padStart(2, "0")}-${stock.id}`;

//       // aging auto calculate
//       const created = new Date(stock.created_at);
//       const aging =
//         Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));

//       await stock.update({
//         category,
//         hsn: hsnMap[category],
//         grn,
//         batch_no: batchNo,
//         aging,
//         status: "GOOD"
//       });
//     }

//     console.log("✅ Unique stock data updated");
//     process.exit();

//   } catch (err) {
//     console.error(err);
//     process.exit(1);
//   }
// }

// updateStocks();
const { sequelize, Role, User, Branch } = require("./model/SQL_Model");

const createHRAdmins = async () => {
  try {
    console.log("🚀 Creating HR Admins...");

    await sequelize.authenticate();

    // 🔹 Get hr_admin role
    const hrRole = await Role.findOne({ where: { name: "hr_admin" } });

    if (!hrRole) {
      console.log("❌ hr_admin role not found. Please create role first.");
      process.exit(1);
    }

    // 🔹 Get all branches
    const branches = await Branch.findAll();

    for (const branch of branches) {

      // Check if HR already exists
      const existingHR = await User.findOne({
        where: {
          branch_id: branch.id,
          role_id: hrRole.id
        }
      });

      if (existingHR) {
        console.log(`⚠️ HR already exists for ${branch.name}`);
        continue;
      }

      await User.create({
        name: `${branch.name} HR Admin`,
        email: `hr_${branch.code}@ims.com`,
        password: "123456",
        role_id: hrRole.id,
        branch_id: branch.id
      });

      console.log(`✅ HR Admin created for ${branch.name}`);
    }

    console.log("🎉 All HR Admins Created Successfully");
    process.exit();

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
};

createHRAdmins();