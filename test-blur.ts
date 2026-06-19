
import { createCanvas } from "@napi-rs/canvas";
import fs from "fs";
const canvas = createCanvas(200, 200);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "white";
ctx.fillRect(0, 0, 200, 200);
ctx.filter = "blur(10px)";
ctx.lineWidth = 10;
ctx.strokeStyle = "black";
ctx.lineCap = "round";
ctx.lineJoin = "round";
ctx.beginPath();
ctx.moveTo(50, 50);
ctx.lineTo(150, 150);
ctx.stroke();
fs.writeFileSync("test-blur.png", canvas.toBuffer("image/png"));

