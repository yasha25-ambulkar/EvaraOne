
import fs from "fs";
const file = "EvaraTDSAnalytics.tsx";
let content = fs.readFileSync(file, "utf8");

content = content.replace(/<ResponsiveContainer width=\"100%\" height=\"100%\">/g, "<ResponsiveContainer width=\"100%\" height={250}>");

fs.writeFileSync(file, content);
console.log("Fixed Recharts UI element!");

