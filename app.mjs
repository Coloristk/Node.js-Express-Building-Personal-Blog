import express from "express";
import cors from "cors";
import { pool } from "./utils/db.mjs";

const app = express();
const port = process.env.PORT || 4001;

app.use(cors());
app.use(express.json());

app.get("/profiles", (req, res) => {
  return res.json({
    data: {
      name: "john",
      age: 20,
    },
  });
});

app.post("/posts", async (req, res) => {
  const newPost = req.body;
  try {
    await pool.query(
      `insert into posts(title, image, category_id, description, content, status_id) 
      values($1, $2, $3, $4, $5, $6)`,
      [
        newPost.title,
        newPost.image,
        newPost.category_id,
        newPost.description,
        newPost.content,
        newPost.status_id,
      ]
    );
  } catch (error) {
    return res.status(500).json({
      message: `Server could not create post because database connection ${error}`,
    });
  }

  if (!newPost) {
    return res.status(400).json({
      message:
        "Server could not create post because there are missing data from client",
    });
  }

  return res.status(201).json({ message: "Created post sucessfully" });
});

app.listen(port, () => {
  console.log(`Server is running at ${port}`);
});
