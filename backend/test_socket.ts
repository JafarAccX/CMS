import { io } from "socket.io-client";

// Get token from DB or use a known one. We need a token for Shadan.
import prisma from './src/utils/prisma.js';
import jwt from 'jsonwebtoken';

async function run() {
  const user = await prisma.user.findUnique({ where: { username: "shadan" } });
  if (!user) return console.log("no user");
  
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || "default_secret", { expiresIn: "1h" });
  
  const socket = io("http://localhost:4000", { auth: { token } });
  
  socket.on("connect", () => {
    console.log("Connected!", socket.id);
    
    // Join DM
    const convId = "ea4b1eca-fb43-4ffd-a7a0-e6cab215ba2f";
    socket.emit("join_dm", { conversationId: convId });
    
    setTimeout(() => {
      console.log("Sending DM...");
      socket.emit("send_dm", {
        conversationId: convId,
        content: "test message from script",
        tempId: "12345",
        attachments: []
      });
    }, 1000);
  });
  
  socket.on("receive_dm", (msg) => {
    console.log("RECEIVED DM!", msg);
    process.exit(0);
  });
  
  setTimeout(() => {
    console.log("Timeout!");
    process.exit(1);
  }, 5000);
}

run();
