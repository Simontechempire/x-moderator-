require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const config = require("./config");
const { connectBot, getSocket, getStatus, disconnectBot } = require("./connection");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

fs.mkdirSync(config.SESSION_DIR, { recursive: true });
fs.mkdirSync("./database", { recursive: true });

const rateLimit = require("express-rate-limit");

app.use("/pair", rateLimit({
  windowMs: 2 * 60 * 1000, // FIX: 15 mins too long, changed to 2 mins
  limit: 10,
  message: { success: false, message: "Too many pairing attempts. Wait 2 mins." }
}));

app.get("/api/status", (req, res) => {
  const st = getStatus();
  res.json({
    success: true,
    bot: config.BOT_NAME,
    connected: st.status === "connected",
    status: st.status === "connected" ? "Connected" : st.status === "connecting" ? "Connecting - Waiting for code" : "Disconnected",
    pairingCode: st.pairingCode || null,
    user: st.user || null
  });
});

app.post("/pair", async (req, res) => {
  try {
    const number = String(req.body.number || "").replace(/\D/g, "");

    if (number.length < 10 || number.length > 15) {
      return res.status(400).json({ success: false, message: "Enter a valid phone number with country code." });
    }

    // FIX: If already connected, tell user to disconnect first, don't just block
    const st = getStatus();
    if (st.status === "connected") {
      return res.status(409).json({
        success: false,
        message: "Bot is already connected as " + st.user + ". Click FORCE DISCONNECT first to link new number.",
        alreadyConnected: true
      });
    }

    // FIX: If already connecting, return the existing code instead of error
    if (st.status === "connecting" && st.pairingCode) {
      return res.json({
        success: true,
        pairingCode: st.pairingCode,
        message: "Pairing code already generated. Enter this code in WhatsApp."
      });
    }

    const result = await connectBot(number);

    // If already connected from previous session
    if (result.alreadyConnected) {
      return res.json({ success: true, message: "Bot already connected!", pairingCode: null });
    }

    res.json({
      success: true,
      pairingCode: result.pairingCode,
      message: result.pairingCode ? "Pairing code generated successfully." : "Already registered, connecting..."
    });

  } catch (error) {
    console.error("PAIR ERROR:", error);
    res.status(500).json({ success: false, message: error.message || "Pairing failed." });
  }
});

// NEW: FORCE DISCONNECT - This fixes your stuck error forever
app.post("/logout", async (req, res) => {
  try {
    await disconnectBot();
    res.json({ success: true, message: "Disconnected. Session cleared. You can generate new code now." });
  } catch(e){
    res.json({ success: false, message: e.message });
  }
});

// NEW: RESET - For when everything stuck
app.post("/reset", async (req, res) => {
  try {
    await disconnectBot();
    res.json({ success: true, message: "Bot reset. Try pairing again." });
  } catch(e){
    res.json({ success: false, message: e.message });
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

  // FIX: DON'T auto-connect on startup - Let user click GENERATE first
  // Old code auto-connected and caused "already connecting" error
  // If session exists, just tell user in console
  const files = fs.existsSync(config.SESSION_DIR) ? fs.readdirSync(config.SESSION_DIR) : [];
  if (files.length > 0) {
    console.log("⚠️ Old session found (" + files.length + " files).");
    console.log("👉 If you want fresh pairing, delete session folder or click FORCE DISCONNECT on panel.");
    console.log("👉 To auto-reconnect with old session, uncomment auto-connect below.");
    // To enable auto-reconnect, uncomment next 3 lines:
    // connectBot().catch(error => {
    //   console.error("AUTO CONNECTION:", error.message);
    // });
  } else {
    console.log("✅ No session. Ready for new pairing.");
  }
});
