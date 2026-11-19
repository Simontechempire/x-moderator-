const config = require("../config");
const style = require("../style");

function menu(pushName) {
  return `
╭━━〔 🛡️ ${config.BOT_NAME} 〕
┃
┃ 👋 Hello, ${pushName}
┃
┃ 🤖 BOT INFORMATION
┃
┃ ◈ Name: ${config.BOT_NAME}
┃ ◈ Developer: ${config.OWNER_NAME}
┃ ◈ Prefix: ${config.PREFIX}
┃ ◈ Mode: Public
┃
╰━━━━━━━━━━━━━━━━━━━━

╭━━〔 ⚡ GENERAL MENU 〕
┃
┃ ${config.PREFIX}menu
┃ ${config.PREFIX}ping
┃ ${config.PREFIX}alive
┃ ${config.PREFIX}owner
┃ ${config.PREFIX}info
┃
╰━━━━━━━━━━━━━━━━━━━━

╭━━〔 👥 GROUP MENU 〕
┃
┃ ${config.PREFIX}tagall
┃ ${config.PREFIX}hidetag
┃ ${config.PREFIX}groupinfo
┃ ${config.PREFIX}link
┃ ${config.PREFIX}admins
┃
╰━━━━━━━━━━━━━━━━━━━━

╭━━〔 🛡️ MODERATOR MENU 〕
┃
┃ ${config.PREFIX}kick
┃ ${config.PREFIX}promote
┃ ${config.PREFIX}demote
┃ ${config.PREFIX}warn
┃ ${config.PREFIX}warnings
┃ ${config.PREFIX}resetwarn
┃
╰━━━━━━━━━━━━━━━━━━━━

╭━━〔 🔒 SECURITY MENU 〕
┃
┃ ${config.PREFIX}antilink on/off
┃ ${config.PREFIX}antispam on/off
┃ ${config.PREFIX}welcome on/off
┃ ${config.PREFIX}goodbye on/off
┃
╰━━━━━━━━━━━━━━━━━━━━

╭━━〔 ⚙️ GROUP SETTINGS 〕
┃
┃ ${config.PREFIX}close
┃ ${config.PREFIX}open
┃ ${config.PREFIX}mute
┃ ${config.PREFIX}unmute
┃ ${config.PREFIX}delete
┃
╰━━━━━━━━━━━━━━━━━━━━

${style.line}
       POWERED BY ${config.OWNER_NAME}
${style.line}
`;
}

module.exports = menu;
