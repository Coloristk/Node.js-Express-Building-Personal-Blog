import express from "express";
import cors from "cors";
import { pool } from "./utils/db.mjs";
import { validatePost } from "./middleware/postValidattion.mjs";

const app = express();
const port = process.env.PORT || 4001;

app.use(cors());
app.use(express.json());

app.get("/posts", async (req, res) => {
  try {
    // 1) Access ข้อมูลใน Body จาก Request ด้วย req.body
    const category = req.query.category || "";
    const keyword = req.query.keyword || "";
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 6;
    // 2) ทำให้แน่ใจว่า query parameter page และ limit จะมีค่าอย่างต่ำเป็น 1
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, Math.min(100, limit));
    const offset = (safePage - 1) * safeLimit;
    // offset คือค่าที่ใช้ในการข้ามจำนวนข้อมูลบางส่วนตอน query ข้อมูลจาก database
    // ถ้า page = 2 และ limit = 6 จะได้ offset = (2 - 1) * 6 = 6 หมายความว่าต้องข้ามแถวไป 6 แถวแรก และดึงแถวที่ 7-12 แทน
    // 3) เขียน Query เพื่อ Insert ข้อมูลโพสต์ ด้วย Connection Pool
    let query = `
      SELECT posts.id, posts.image, categories.name AS category, posts.title, posts.description, posts.date, posts.content, statuses.status, posts.likes_count
      FROM posts
      INNER JOIN categories ON posts.category_id = categories.id
      INNER JOIN statuses ON posts.status_id = statuses.id
    `;
    let values = [];
    // 4) เขียน query จากเงื่อนไขของการใส่ query parameter category และ keyword
    if (category && keyword) {
      query += `
        WHERE categories.name ILIKE $1 
        AND (posts.title ILIKE $2 OR posts.description ILIKE $2 OR posts.content ILIKE $2)
      `;
      values = [`%${category}%`, `%${keyword}%`];
    } else if (category) {
      query += " WHERE categories.name ILIKE $1";
      values = [`%${category}%`];
    } else if (keyword) {
      query += `
        WHERE posts.title ILIKE $1 
        OR posts.description ILIKE $1 
        OR posts.content ILIKE $1
      `;
      values = [`%${keyword}%`];
    }
    // 5) เพิ่มการ odering ตามวันที่, limit และ offset
    query += ` ORDER BY posts.date DESC LIMIT $${values.length + 1} OFFSET $${
      values.length + 2
    }`;
    values.push(safeLimit, offset);
    // 6) Execute the main query (ดึงข้อมูลของบทความ)
    const result = await connectionPool.query(query, values);
    // 7) สร้าง Query สำหรับนับจำนวนทั้งหมดตามเงื่อนไข พื่อใช้สำหรับ pagination metadata
    let countQuery = `
      SELECT COUNT(*)
      FROM posts
      INNER JOIN categories ON posts.category_id = categories.id
      INNER JOIN statuses ON posts.status_id = statuses.id
    `;
    let countValues = values.slice(0, -2); // ลบค่า limit และ offset ออกจาก values
    if (category && keyword) {
      countQuery += `
        WHERE categories.name ILIKE $1 
        AND (posts.title ILIKE $2 OR posts.description ILIKE $2 OR posts.content ILIKE $2)
      `;
    } else if (category) {
      countQuery += " WHERE categories.name ILIKE $1";
    } else if (keyword) {
      countQuery += `
        WHERE posts.title ILIKE $1 
        OR posts.description ILIKE $1 
        OR posts.content ILIKE $1
      `;
    }
    const countResult = await connectionPool.query(countQuery, countValues);
    const totalPosts = parseInt(countResult.rows[0].count, 10);
    // 8) สร้าง response พร้อมข้อมูลการแบ่งหน้า (pagination)
    const results = {
      totalPosts,
      totalPages: Math.ceil(totalPosts / safeLimit),
      currentPage: safePage,
      limit: safeLimit,
      posts: result.rows,
    };
    // เช็คว่ามีหน้าถัดไปหรือไม่
    if (offset + safeLimit < totalPosts) {
      results.nextPage = safePage + 1;
    }
    // เช็คว่ามีหน้าก่อนหน้าหรือไม่
    if (offset > 0) {
      results.previousPage = safePage - 1;
    }
    // 9) Return ตัว Response กลับไปหา Client ว่าสร้างสำเร็จ
    return res.status(200).json(results);
  } catch {
    return res.status(500).json({
      message: "Server could not read post because database issue",
    });
  }
});

app.get("/posts/:postId", async (req, res) => {
  const postIdFromClient = req.params.postId;
  let result = {};
  try {
    result = await pool.query(
      `SELECT posts.id, image, categories.name AS category, title, description, date, content, statuses.status, likes_count 
      FROM posts 
      INNER JOIN categories ON posts.category_id = categories.id
      INNER JOIN statuses ON posts.status_id = statuses.id
      WHERE posts.id = $1`,
      [postIdFromClient]
    );
  } catch (error) {
    return res.status(500).json({
      message: `Server could not read post because database connection`,
    });
  }
  // ไว้เช็คว่า Request ที่ส่งมาว่ามี Data ที่ Client ขอมาไหม ถ้าไม่มีให้ Return 400
  if (!result.rows.length) {
    return res.status(404).json({
      message: "Server could not find a requested post",
    });
  }

  return res.status(201).json({
    data: result.rows,
  });
});

app.post("/posts", [validatePost], async (req, res) => {
  const newPost = req.body;

  // ต้องเอาเงื่อนไขที่เช็คว่าข้อมูลที่ส่งมามีข้อมูลครบไหม ขึ้นก่อนไม่งั้นจะเข้า error 500
  if (
    !newPost.title ||
    !newPost.image ||
    !newPost.category_id ||
    !newPost.description ||
    !newPost.content ||
    !newPost.status_id
  ) {
    return res.status(400).json({
      message:
        "Server could not create post because there are missing data from client",
    });
  }

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
      message: `Server could not create post because database connection`,
    });
  }

  return res.status(201).json({ message: "Created post sucessfully" });
});

app.put("/posts/:postId", [validatePost], async (req, res) => {
  const postIdFromClient = req.params.postId;
  const updatedPost = { ...req.body, date: new Date() };
  try {
    await pool.query(
      `Update posts SET title = $2, image =$3, category_id =$4, description =$5, content =$6, status_id =$7, date =$8
      WHERE id = $1`,
      [
        postIdFromClient,
        updatedPost.title,
        updatedPost.image,
        updatedPost.category_id,
        updatedPost.description,
        updatedPost.content,
        updatedPost.status_id,
        updatedPost.date,
      ]
    );
    // ไว้เช็ค Request ที่ส่งมาว่ามี postId ที่ Client ขอมาไหม
    const postCheck = await pool.query("SELECT * FROM posts WHERE id = $1", [
      postIdFromClient,
    ]);
    // ถ้าไม่มี postId ที่ Client ขอมาให้ return 400
    if (!postCheck.rows.length) {
      return res.status(404).json({
        message: "Server could not find a requested post to update",
      });
    }
  } catch (error) {
    return res.status(500).json({
      message: `Server could not update post because database connection`,
    });
  }

  return res.status(200).json({ message: "Updated post sucessfully" });
});

app.delete("/posts/:postId", async (req, res) => {
  const postIdFromClient = req.params.postId;

  try {
    // ไว้เช็ค Request ที่ส่งมาว่ามี postId ที่ Client ขอมาไหม
    const postCheck = await pool.query("SELECT * FROM posts WHERE id = $1", [
      postIdFromClient,
    ]);
    // ถ้าไม่มี postId ที่ Client ขอมาให้ return 400
    if (!postCheck.rows.length) {
      return res
        .status(404)
        .json({ message: "Server could not find a requested post to delete" });
    }
    // Query ไว้ลบข้อมูลที่ Request มา
    await pool.query(`DELETE from posts WHERE id = $1`, [postIdFromClient]);
  } catch (error) {
    return res.status(500).json({
      message: "Server could not delete post because database connection",
    });
  }
  return res.status(200).json({ message: "Deleted post sucessfully" });
});

app.listen(port, () => {
  console.log(`Server is running at ${port}`);
});
