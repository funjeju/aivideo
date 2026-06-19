
import { createCanvas } from "@napi-rs/canvas";
import fs from "fs";
const mask = createCanvas(1080, 1920);
const mctx = mask.getContext("2d");
mctx.lineWidth = 191;
mctx.strokeStyle = "black";
mctx.beginPath();
mctx.moveTo(500, 500);
mctx.lineTo(600, 1500);
mctx.stroke();

const finalMask = createCanvas(1080, 1920);
const bctx = finalMask.getContext("2d");
bctx.filter = "blur(144px)";
bctx.drawImage(mask, 0, 0);

fs.writeFileSync("test-blur-large.png", finalMask.toBuffer("image/png"));

