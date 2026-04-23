
const fs = require("fs");
const logger = require("../utils/logger.js");

const file = "nodes.controller.js";
let content = fs.readFileSync(file, "utf8");

content = content.replace(/const tdsFieldKey\s*=\s*[\s\S]*?const tempFieldKey\s*=\s*[\s\S]*?\"field3\";/g, `let tdsFieldKey = Object.keys(fieldMapping).find(k => tdsKeys.includes(fieldMapping[k])) || "field2";
      let tempFieldKey = Object.keys(fieldMapping).find(k => tempKeys.includes(fieldMapping[k])) || "field3";

      if (metadata.tdsField) tdsFieldKey = metadata.tdsField;
      if (metadata.tempField || metadata.temperature_field) tempFieldKey = metadata.tempField || metadata.temperature_field;`);

fs.writeFileSync(file, content);
logger.debug("Replaced!");

