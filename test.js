require('dotenv').config();
const nodemailer = require('nodemailer');

(async () => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp-relay.brevo.com",
      port: 587,
      secure: false,
      auth: { user: process.env.BREVO_USER, pass: process.env.BREVO_PASS }
    });

    await transporter.verify();
    console.log("SMTP ✅");

    await transporter.sendMail({
      from: process.env.BREVO_USER,
      to: process.env.EMAIL_USER,
      subject: "Test",
      text: "Test from server"
    });

    console.log("Email sent ✅");
  } catch (err) {
    console.error("Email failed ❌", err);
  }
})();
