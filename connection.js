const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const fs = require("fs");
const path = require("path");

const config = require("./config");
const menu = require("./lib/menu");
const db = require("./lib/function");

let sock;
let connecting = false;
let reconnectTimer;
let lastPairingCode = null;

async function connectBot(phoneNumber = "") {
  // FIX 1: If already connected, return sock, no throw error
  if (sock && sock.user) {
    return { pairingCode: null, socket: sock, alreadyConnected: true };
  }

  // FIX 2: If still connecting, return last code instead of throwing
  if (connecting) {
    return { pairingCode: lastPairingCode, socket: sock, alreadyConnecting: true };
  }

  connecting = true;

  try {
    fs.mkdirSync(config.SESSION_DIR, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(config.SESSION_DIR);

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      browser: ["X-MODERATOR-BOT", "Chrome", "1.0.0"]
    });

    sock.ev.on("creds.update", saveCreds);

    let pairingCode = null;

    // FIX 3: Only request pairing code if NOT registered
    if (!state.creds.registered && phoneNumber) {
      const number = phoneNumber.replace(/\D/g, "");
      if (number.length < 10 || number.length > 15) {
        connecting = false;
        sock = null;
        throw new Error("Invalid phone number.");
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
      try {
        pairingCode = await sock.requestPairingCode(number);
        lastPairingCode = pairingCode;
        console.log("PAIRING CODE:", pairingCode);
      } catch (e) {
        // If pairing fails because already registered, don't throw
        console.log("Pairing code failed, maybe already registered:", e.message);
      }
    }

    sock.ev.on("connection.update", async update => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        connecting = false;
        lastPairingCode = null;
        console.log("X-MODERATOR-BOT CONNECTED");
      }

      if (connection === "close") {
        connecting = false;
        lastPairingCode = null;
        const wasSock = sock;
        sock = null;

        const statusCode = lastDisconnect?.error?.output?.statusCode;

        if (config.AUTO_RECONNECT && statusCode !== DisconnectReason.loggedOut) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            connectBot().catch(console.error);
          }, 5000);
        }
        // If logged out, delete session so new pairing can work
        if (statusCode === DisconnectReason.loggedOut) {
          try {
            if (fs.existsSync(config.SESSION_DIR)) {
              fs.rmSync(config.SESSION_DIR, { recursive: true, force: true });
              fs.mkdirSync(config.SESSION_DIR, { recursive: true });
            }
          } catch(e){ console.log("Session clear error:", e.message) }
        }
      }
    });

    sock.ev.on("group-participants.update", async event => {
      try {
        const group = await sock.groupMetadata(event.id);
        const settings = db.getGroup(event.id);
        for (const participant of event.participants) {
          if (event.action === "add" && settings.welcome) {
            await sock.sendMessage(event.id, {
              text: `👋 Welcome @${participant.split("@")[0]}\nWelcome to *${group.subject}*`,
              mentions: [participant]
            });
          }
          if (event.action === "remove" && config.GOODBYE) {
            await sock.sendMessage(event.id, {
              text: `👋 @${participant.split("@")[0]} has left the group.`,
              mentions: [participant]
            });
          }
        }
      } catch (error) {
        console.error("Participant update:", error);
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const message of messages) {
        try { await handleMessage(message); } catch (error) { console.error("Command error:", error); }
      }
    });

    return { pairingCode, socket: sock };

  } catch (error) {
    connecting = false;
    sock = null;
    lastPairingCode = null;
    throw error;
  }
}

// FIX 4: NEW FUNCTIONS - For panel to use
function getStatus() {
  if (sock && sock.user) return { status: "connected", user: sock.user.id, connecting: false };
  if (connecting) return { status: "connecting", connecting: true, pairingCode: lastPairingCode };
  return { status: "disconnected", connecting: false };
}

async function disconnectBot() {
  try {
    if (sock) {
      try { await sock.logout(); } catch(e){}
      try { sock.end(); } catch(e){}
    }
  } catch(e){}
  sock = null;
  connecting = false;
  lastPairingCode = null;
  clearTimeout(reconnectTimer);
  // Delete session so new pairing code can work
  try {
    if (fs.existsSync(config.SESSION_DIR)) {
      fs.rmSync(config.SESSION_DIR, { recursive: true, force: true });
      fs.mkdirSync(config.SESSION_DIR, { recursive: true });
    }
  } catch(e){ console.log(e.message) }
  return true;
}

function getSocket() { return sock; }

async function handleMessage(message) {
  if (!message.message || message.key.fromMe) return;
  const jid = message.key.remoteJid;
  if (!jid || jid === "status@broadcast") return;
  const sender = db.getSender(message);
  const text = db.getText(message).trim();
  const prefix = config.PREFIX;
  const isGroup = db.isGroup(jid);
  const isOwner = sender.split("@")[0] === config.OWNER_NUMBER.replace(/\D/g, "");
  if (!isGroup) return;
  const metadata = await sock.groupMetadata(jid);
  const participants = metadata.participants;
  const botJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
  const senderAdmin = participants.some(p => p.id === sender && ["admin", "superadmin"].includes(p.admin));
  const botAdmin = participants.some(p => p.id === botJid && ["admin", "superadmin"].includes(p.admin));
  const groupSettings = db.getGroup(jid);

  if (config.ANTI_LINK && groupSettings.antilink && !senderAdmin && !isOwner && db.isLink(text)) {
    await sock.sendMessage(jid, { delete: message.key });
    await sock.sendMessage(jid, { text: "🛡️ Group links are not allowed." });
    return;
  }
  if (config.ANTI_SPAM && groupSettings.antispam && text.length > 3000) {
    if (!senderAdmin && !isOwner) {
      await sock.sendMessage(jid, { text: "⚠️ Please avoid excessively long messages." });
      return;
    }
  }
  if (!text.startsWith(prefix)) return;
  const args = text.slice(prefix.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();
  const reply = async text => sock.sendMessage(jid, { text }, { quoted: message });
  const requireAdmin = async () => {
    if (!botAdmin) { await reply("❌ Bot must be a group admin."); return false; }
    if (!senderAdmin && !isOwner) { await reply("❌ Only group admins can use this command."); return false; }
    return true;
  };
  const mentioned = db.getMentioned(text, message);
  const targets = mentioned.length ? mentioned : [];
  switch (command) {
    case "menu": case "help": await reply(menu(message.pushName || "User")); break;
    case "ping": await reply("🏓 Pong!\nX-MODERATOR-BOT is online."); break;
    case "alive": await reply("✅ X-MODERATOR-BOT is active."); break;
    case "owner": await reply(`👑 Developer: ${config.OWNER_NAME}\n📞 ${config.OWNER_NUMBER}`); break;
    case "info": await reply(`🤖 ${config.BOT_NAME}\nDeveloper: ${config.OWNER_NAME}\nPrefix: ${prefix}`); break;
    case "tagall": case "hidetag": {
      if (!(await requireAdmin())) return;
      const mentions = participants.map(p => p.id);
      await sock.sendMessage(jid, {
        text: command === "tagall" ? `📢 GROUP ANNOUNCEMENT\n\n${args.join(" ") || "Attention everyone!"}\n\n` + mentions.map(id => `@${id.split("@")[0]}`).join(" ") : args.join(" ") || "📢 Attention everyone!",
        mentions
      }, { quoted: message });
      break;
    }
    case "groupinfo": await reply(`📋 GROUP INFORMATION\n\nName: ${metadata.subject}\nMembers: ${participants.length}\nOwner: ${metadata.owner || "Unknown"}`); break;
    case "link":
      if (!(await requireAdmin())) return;
      try { const invite = await sock.groupInviteCode(jid); await reply(`🔗 Group link:\nhttps://chat.whatsapp.com/${invite}`); } catch { await reply("❌ Unable to get group link."); }
      break;
    case "admins": {
      const admins = participants.filter(p => ["admin", "superadmin"].includes(p.admin));
      await reply("👑 GROUP ADMINS\n\n" + admins.map(p => `• @${p.id.split("@")[0]}`).join("\n"));
      break;
    }
    case "kick": case "promote": case "demote": {
      if (!(await requireAdmin())) return;
      if (!targets.length) { await reply(`Tag or reply to a user: ${prefix}${command} @user`); return; }
      for (const target of targets) {
        if (target === botJid) continue;
        if (command === "kick") await sock.groupParticipantsUpdate(jid, [target], "remove");
        else await sock.groupParticipantsUpdate(jid, [target], command === "promote" ? "promote" : "demote");
      }
      await reply(`✅ ${command.toUpperCase()} command completed.`);
      break;
    }
    case "warn": {
      if (!(await requireAdmin())) return;
      if (!targets.length) { await reply("Tag a user to warn."); return; }
      const database = db.loadDB();
      for (const target of targets) {
        const key = `${jid}:${target}`;
        database.users[key] = (database.users[key] || 0) + 1;
        await sock.sendMessage(jid, { text: `⚠️ Warning issued to @${target.split("@")[0]}\nWarnings: ${database.users[key]}/${config.MAX_WARNINGS}`, mentions: [target] });
      }
      db.saveDB(database);
      break;
    }
    case "warnings": {
      const target = targets[0] || sender;
      const database = db.loadDB();
      const count = database.users[`${jid}:${target}`] || 0;
      await reply(`⚠️ Warnings: ${count}/${config.MAX_WARNINGS}`);
      break;
    }
    case "resetwarn": {
      if (!(await requireAdmin())) return;
      const target = targets[0];
      if (!target) { await reply("Tag a user."); return; }
      const database = db.loadDB();
      delete database.users[`${jid}:${target}`];
      db.saveDB(database);
      await reply("✅ Warnings reset.");
      break;
    }
    case "antilink": case "antispam": case "welcome": case "goodbye": {
      if (!(await requireAdmin())) return;
      const value = args[0]?.toLowerCase();
      if (!["on", "off"].includes(value)) { await reply(`Usage: ${prefix}${command} on/off`); return; }
      const setting = command === "goodbye" ? "goodbye" : command === "welcome" ? "welcome" : command;
      db.updateGroup(jid, setting, value === "on");
      await reply(`✅ ${command} turned ${value}.`);
      break;
    }
    case "close": case "open":
      if (!(await requireAdmin())) return;
      await sock.groupSettingUpdate(jid, command === "close" ? "announcement" : "not_announcement");
      await reply(`✅ Group successfully ${command === "close" ? "closed" : "opened"}.`);
      break;
    case "mute": case "unmute":
      if (!(await requireAdmin())) return;
      db.updateGroup(jid, "muted", command === "mute");
      await reply(`🔇 Group command filter ${command === "mute" ? "enabled" : "disabled"}.`);
      break;
    case "delete":
      if (!(await requireAdmin())) return;
      if (!message.message?.extendedTextMessage?.contextInfo?.stanzaId) { await reply("Reply to a message with .delete"); return; }
      await sock.sendMessage(jid, { delete: { remoteJid: jid, fromMe: false, id: message.message.extendedTextMessage.contextInfo.stanzaId, participant: message.message.extendedTextMessage.contextInfo.participant } });
      break;
  }
}

module.exports = { connectBot, getSocket, getStatus, disconnectBot };
