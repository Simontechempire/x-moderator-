const fs = require("fs");
const path = require("path");
const config = require("../config");

const dbPath = path.resolve(config.DATABASE);

function loadDB() {
  try {
    if (!fs.existsSync(dbPath)) {
      fs.mkdirSync(path.dirname(dbPath), {
        recursive: true
      });

      fs.writeFileSync(
        dbPath,
        JSON.stringify({
          groups: {},
          users: {},
          settings: {
            mode: "public",
            prefix: "."
          }
        }, null, 2)
      );
    }

    return JSON.parse(fs.readFileSync(dbPath, "utf8"));
  } catch (error) {
    console.error("Database error:", error);
    return {
      groups: {},
      users: {},
      settings: { mode: "public", prefix: "." }
    };
  }
}

function saveDB(data) {
  fs.mkdirSync(path.dirname(dbPath), {
    recursive: true
  });

  fs.writeFileSync(
    dbPath,
    JSON.stringify(data, null, 2)
  );
}

function getGroup(jid) {
  const db = loadDB();

  if (!db.groups[jid]) {
    db.groups[jid] = {
      welcome: true,
      antilink: true,
      antispam: true,
      warnings: {},
      muted: false
    };

    saveDB(db);
  }

  return db.groups[jid];
}

function updateGroup(jid, key, value) {
  const db = loadDB();

  if (!db.groups[jid]) {
    db.groups[jid] = {};
  }

  db.groups[jid][key] = value;
  saveDB(db);
}

function getText(message) {
  const msg = message.message || {};

  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    ""
  );
}

function getSender(message) {
  return message.key.participant || message.key.remoteJid;
}

function isGroup(jid) {
  return jid.endsWith("@g.us");
}

function isLink(text) {
  return /https?:\/\/|www\.|chat\.whatsapp\.com/i.test(text);
}

function getMentioned(text, message) {
  const mentioned =
    message.message?.extendedTextMessage
      ?.contextInfo?.mentionedJid || [];

  if (mentioned.length) return mentioned;

  const number = text.replace(/\D/g, "");

  return number
    ? [`${number}@s.whatsapp.net`]
    : [];
}

function formatNumber(jid) {
  return jid.split("@")[0];
}

module.exports = {
  loadDB,
  saveDB,
  getGroup,
  updateGroup,
  getText,
  getSender,
  isGroup,
  isLink,
  getMentioned,
  formatNumber
};
