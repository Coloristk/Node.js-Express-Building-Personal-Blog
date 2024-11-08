import * as pg from "pg";

const { Pool } = pg.default;

const pool = new Pool({
  connectionString:
    "postgresql://postgres:975200@localhost:5432/my-personal-blog-post",
});

export { pool };
