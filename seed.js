const { sequelize, Role, User, Branch, Stock, Ledger, Client } = require("./model/SQL_Model");
const bcrypt = require("bcrypt");

const seedData = async () => {
  try {

    console.log("🚀 Seeding started...");

    // ================= SYNC TABLES =================
    await sequelize.sync({ force: true });
    console.log("✅ Tables recreated");

    // ================= ROLES =================
    const roles = [
      "super_admin",
      "admin",
      "stock_manager",
      "sales_manager",
      "purchase_manager",
      "finance",
      "inventory_manager"
    ];

    const roleMap = {};

    for (const r of roles) {
      const role = await Role.create({ name: r });
      roleMap[r] = role.id;
    }

    console.log("✅ Roles created");

    // ================= SUPER ADMIN =================
    const hashedPassword = await bcrypt.hash("123456", 10);

    const superAdmin = await User.create({
      name: "Super Admin",
      email: "super@ims.com",
      password: hashedPassword,
      role_id: roleMap.super_admin,
      is_active: true
    });

    console.log("✅ Super Admin created");

    // ================= CITY DATA =================
    const cities = [
      { city: "Hyderabad", state: "Telangana" },
      { city: "Kolkata", state: "West Bengal" },
      { city: "Patna", state: "Bihar" },
      { city: "Ahmedabad", state: "Gujarat" },
      { city: "Mumbai", state: "Maharashtra" },
      { city: "Bangalore", state: "Karnataka" }
    ];

    for (const c of cities) {

      // ================= CITY HUB =================
      const cityHub = await Branch.create({
        code: `HUB-${c.city.toUpperCase()}`,
        name: `${c.city} Hub`,
        location: c.city,
        state: c.state,
        type: "WAREHOUSE",
        status: "ACTIVE",
        contact_number: "9999999999",
        email: `${c.city.toLowerCase()}hub@ims.com`,
        parent_branch_id: null
      });

      console.log(`🏙 ${c.city} Hub created`);

      // ================= BRANCHES =================
      for (let i = 1; i <= 3; i++) {

        const branch = await Branch.create({
          code: `${c.city.slice(0,3).toUpperCase()}-${i}`,
          name: `${c.city} Branch ${i}`,
          location: c.city,
          state: c.state,
          type: "WAREHOUSE",
          status: "ACTIVE",
          contact_number: `99999999${i}`,
          email: `${c.city.toLowerCase()}${i}@ims.com`,
          parent_branch_id: cityHub.id
        });

        // ================= USERS =================
        const users = [
          { name:`${branch.name} Admin`, role:"admin", email:`admin_${branch.code}@ims.com` },
          { name:`${branch.name} Stock Manager`, role:"stock_manager", email:`stock_${branch.code}@ims.com` },
          { name:`${branch.name} Sales Manager`, role:"sales_manager", email:`sales_${branch.code}@ims.com` },
          { name:`${branch.name} Purchase Manager`, role:"purchase_manager", email:`purchase_${branch.code}@ims.com` },
          { name:`${branch.name} Finance`, role:"finance", email:`finance_${branch.code}@ims.com` },
          { name:`${branch.name} Inventory Manager`, role:"inventory_manager", email:`inventory_${branch.code}@ims.com` }
        ];

        for (const u of users) {

          await User.create({
            name: u.name,
            email: u.email,
            password: hashedPassword,
            role_id: roleMap[u.role],
            branch_id: branch.id,
            is_active: true
          });

        }

        // ================= STOCK =================
        const stockItems = [];

        for (let s = 1; s <= 50; s++) {

          const qty = Math.floor(Math.random() * 100) + 1;
          const rate = Math.floor(Math.random() * 5000) + 100;

          stockItems.push({
            branch_id: branch.id,
            item: `Item-${s}`,
            quantity: qty,
            rate,
            value: qty * rate,
            owner_id: superAdmin.id
          });

        }

        await Stock.bulkCreate(stockItems);

        // ================= CLIENTS =================
        const clients = [];

        for (let i = 1; i <= 20; i++) {

          clients.push({
            client_code: `CL-${branch.id}-${i}`,
            name: `Client ${branch.id}-${i}`,
            phone: `98${Math.floor(10000000 + Math.random()*90000000)}`,
            email: `client${branch.id}${i}@demo.com`,
            address: `Address ${branch.location}`,
            gst_number: `GST${Math.floor(100000000000 + Math.random()*900000000000)}`,
            credit_limit: 50000,
            branch_id: branch.id
          });

        }

        await Client.bulkCreate(clients);

        // ================= LEDGER =================
        const stocks = await Stock.findAll({ where:{ branch_id: branch.id } });

        const ledgerEntries = [];

        for (let i = 0; i < 25; i++) {

          const stock = stocks[Math.floor(Math.random()*stocks.length)];
          const qty = Math.floor(Math.random()*5)+1;

          ledgerEntries.push({
            branch_id: branch.id,
            stock_id: stock.id,
            type:"SALE",
            quantity: qty,
            rate: stock.rate,
            total: qty * stock.rate,
            reference_no:`INV-${Date.now()}-${Math.random()}`,
            created_by: superAdmin.id
          });

          ledgerEntries.push({
            branch_id: branch.id,
            stock_id: stock.id,
            type:"PURCHASE",
            quantity: qty+2,
            rate: stock.rate,
            total: (qty+2) * stock.rate,
            reference_no:`PUR-${Date.now()}-${Math.random()}`,
            created_by: superAdmin.id
          });

        }

        await Ledger.bulkCreate(ledgerEntries);

        console.log(`🏢 ${branch.name} setup complete`);

      }

    }

    console.log("🎉 ENTERPRISE IMS SEED COMPLETE");
    process.exit();

  } catch (err) {

    console.error("❌ Seed error:", err);
    process.exit(1);

  }
};

seedData();