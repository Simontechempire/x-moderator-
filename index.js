require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const config = require("./config");
const { connectBot, getSocket } = require("./connection");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

fs.mkdirSync(config.SESSION_DIR, { recursive: true });
fs.mkdirSync("./database", { recursive: true });

const rateLimit = require("express-rate-limit");

app.use("/pair", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: {
    success: false,
    message: "Too many pairing attempts. Try again later."
  }
}));

let pairingInProgress = false;

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    bot: config.BOT_NAME,
    connected: Boolean(getSocket()?.user),
    status: getSocket()?.user ? "Connected" : "Disconnected"
  });
});

app.post("/pair", async (req, res) => {
  try {
    const number = String(req.body.number || "").replace(/\D/g, "");

    if (number.length < 10 || number.length > 15) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid phone number with country code."
      });
    }

    if (getSocket()?.user) {
      return res.status(409).json({
        success: false,
        message: "A WhatsApp account is already connected."
      });
    }

    if (pairingInProgress) {
      return res.status(409).json({
        success: false,
        message: "A connection is already in progress."
      });
    }

    pairingInProgress = true;

    const result = await connectBot(number);

    pairingInProgress = false;

    res.json({
      success: true,
      pairingCode: result.pairingCode,
      message: "Pairing code generated successfully."
    });

  } catch (error) {
    pairingInProgress = false;

    console.error("PAIR ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Pairing failed."
    });
  }
});

app.get("/health", (req, res) => {
  res.send("X-MODERATOR-BOT SERVER ONLINE");
});

app.listen(config.PORT, () => {
  console.log(`
╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
┃       X-MODERATOR-BOT         ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ STATUS : SERVER ONLINE        ┃
┃ PORT   : ${config.PORT}                 ┃
┃ OWNER  : ${config.OWNER_NAME}      ┃
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯
  `);

  // Automatically reconnect using an existing session.
  if (fs.existsSync(config.SESSION_DIR)) {
    connectBot().catch(error => {
      console.error("AUTO CONNECTION:", error.message);
    });
  }
});
