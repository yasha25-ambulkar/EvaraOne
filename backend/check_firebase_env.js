// This script shows which Firebase environment is being used

const path = require("path");
const dotenv = require("dotenv");

const nodeEnv = process.env.NODE_ENV || "development";
console.log(`\n🔍 NODE_ENV: ${nodeEnv}`);

const envFile =
  nodeEnv === "development"
    ? path.resolve(__dirname, "../.env.development")
    : path.resolve(__dirname, "../.env");
console.log(`📁 Loading from: ${envFile}`);

const result = dotenv.config({ path: envFile });

if (result.error) {
  console.log(`❌ Error loading .env file: ${result.error.message}`);
} else {
  console.log(`✅ .env file loaded successfully`);
}

console.log(`\n🔐 Firebase Configuration:`);
console.log(`   PROJECT_ID: ${process.env.FIREBASE_PROJECT_ID}`);
console.log(`   CLIENT_EMAIL: ${process.env.FIREBASE_CLIENT_EMAIL}`);
console.log(`   DATABASE_URL: ${process.env.FIREBASE_DATABASE_URL}`);

if (process.env.FIREBASE_PROJECT_ID === "evaratech-dev") {
  console.log(`\n✅ SUCCESS - Using TESTING (evaratech-dev)`);
} else if (process.env.FIREBASE_PROJECT_ID === "evaraone") {
  console.log(`\n❌ WRONG - Using PRODUCTION (evaraone)`);
} else {
  console.log(`\n⚠️  UNKNOWN - ${process.env.FIREBASE_PROJECT_ID}`);
}
