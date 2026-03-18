const jwt = require("jsonwebtoken");
const { User, Role } = require("../model/SQL_Model");

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ["password"] },
      include: {
        model: Role,
        as: "role",
        attributes: ["name"],
      },
    });

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // 🔥🔥 IMPORTANT FIX (MERGE DATA)
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branch_id: user.branch_id,

      // ✅ JWT se lo
      branches: decoded.branches || [user.branch_id]
    };

    console.log("FINAL USER:", req.user); // 🔍 DEBUG

    next();

  } catch (err) {
    console.error("JWT ERROR:", err.message);
    return res.status(401).json({ message: "Invalid token" });
  }
};

module.exports = auth;