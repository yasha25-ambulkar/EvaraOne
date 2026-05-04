require('dotenv').config();
const { db } = require("./src/config/firebase.js");

const logger = require("./src/utils/logger.js");


async function verify() {
  const doc = await db.collection("devices").doc("EV-OPS-001").get();
  if (doc.exists) {
    console.log("Firestore Name:", doc.data().label);
    console.log("Firestore Category:", doc.data().category);
  } else {
    console.log("Device not found!");
  }
  process.exit(0);
}

verify();
