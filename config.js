module.exports = {
  BOT_NAME: "X-MODERATOR-BOT",
  OWNER_NAME: "SIMON TECH INC",
  OWNER_NUMBER: "234XXXXXXXXXX",

  PREFIX: ".",
  PORT: process.env.PORT || 3000,

  SESSION_DIR: "./sessions",
  DATABASE: "./database/data.json",

  AUTO_RECONNECT: true,
  WELCOME: true,
  GOODBYE: true,

  ANTI_LINK: true,
  ANTI_SPAM: true,

  MAX_WARNINGS: 3,

  TIMEZONE: "Africa/Lagos"
};
