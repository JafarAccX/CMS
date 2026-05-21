import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import { upload } from "../middlewares/upload.js";

const router = Router();

router.post("/", authenticate, upload.array("files", 10), (req, res) => {
  if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
    res.status(400).json({ error: "No files uploaded" });
    return;
  }

  const files = (req.files as Express.Multer.File[]).map((f) => ({
    file_url: `/uploads/${f.filename}`,
    file_name: f.originalname,
    file_size: f.size,
    mime_type: f.mimetype,
  }));

  res.status(200).json({ files });
});

export default router;
