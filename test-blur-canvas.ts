
import { createCanvas } from "@napi-rs/canvas";
import fs from "fs";
const mask = createCanvas(200, 200);
const mctx = mask.getContext("2d");
mctx.lineWidth = 10;
mctx.strokeStyle = "black";
mctx.beginPath();
mctx.moveTo(50, 50);
mctx.lineTo(150, 150);
mctx.stroke();

const finalMask = createCanvas(200, 200);
const bctx = finalMask.getContext("2d");
bctx.filter = "blur(10px)";
bctx.drawImage(mask, 0, 0);

fs.writeFileSync("test-blur-canvas.png", finalMask.toBuffer("image/png"));

