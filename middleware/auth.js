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
      include: { model: Role, as: "role", attributes: ["name"] },
    });

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("JWT ERROR:", err.message); // 🔥 IMPORTANT
    return res.status(401).json({ message: "Invalid token" });
  }
};

module.exports = auth;
