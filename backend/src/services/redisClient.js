const Redis = require("ioredis");
const logger = require("../utils/logger.js");

// Only attempt connection if REDIS_URL is provided to avoid ECONNREFUSED on localhost
const redisUrl = process.env.REDIS_URL;
let client = null;

if (redisUrl) {
    client = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        retryStrategy: () => null // Fail fast if connection fails
    });

    client.on("error", (err) => {
        logger.warn("Redis Client Error (will fallback to memory):", err.message);
    });
} else {
    logger.debug("REDIS_URL not set - redisClient will remain inactive.");
}

module.exports = client;

