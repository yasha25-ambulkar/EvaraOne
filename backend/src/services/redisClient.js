const Redis = require("ioredis");
const logger = require("../utils/logger.js");

const client = new Redis(process.env.REDIS_URL || "redis://localhost:6379");


client.on("error", (err) => {
    logger.error("Redis Client Error", err);
});

// ioredis connects automatically


module.exports = client;
