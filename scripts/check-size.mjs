import { stat } from "node:fs/promises";

const maximumBytes = 100 * 1024;
const { size } = await stat("dist/ai-file-detector.js");
if (size > maximumBytes) {
  console.error(`dist/ai-file-detector.js is ${size} bytes; maximum is ${maximumBytes}`);
  process.exit(1);
}
console.log(`bundle size: ${size} bytes (maximum ${maximumBytes})`);
