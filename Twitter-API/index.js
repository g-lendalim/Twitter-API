let express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const { queryObjects } = require("v8");
const { DATABASE_URL } = process.env;
require("dotenv").config();

let app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function getPostgresVersion() {
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT version()");
    console.log(res.rows[0]);
  } finally {
    client.release();
  }
}
getPostgresVersion();

app.get("/posts/user/:user_id", async (req, res) => {
  const { user_id } = req.params;
  const client = await pool.connect();

  try {
    const posts = await client.query("SELECT * FROM posts WHERE user_id = $1", [
      user_id,
    ]);
    if (posts.rowCount > 0) {
      res.json(posts.rows);
    } else {
      res.status(404).json({ error: "No posts found for this user" });
    }
  } catch (error) {
    console.error("Error", error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.post("/posts", async (req, res) => {
  const { title, content, user_id } = req.body;
  const client = await pool.connect();
  try {
    //Check if user exists
    const userExists = await client.query("SELECT * FROM users WHERE id = $1", [
      user_id,
    ]);
    if (userExists.rows.length > 0) {
      //User exists, add post
      const post = await client.query(
        "INSERT INTO posts (title, content, user_id, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING *",
        [title, content, user_id],
      );
      //Send new post data back to client
      res.json(post.rows[0]);
    } else {
      //User does not exist
      res.status(400).json({ error: "User does not exist" });
    }
  } catch (err) {
    console.log(err.stack);
    res
      .status(500)
      .json({ error: "Something went wrong, please try again later!" });
  } finally {
    client.release();
  }
});

//Endpoint to like a post
app.post("/likes", async (req, res) => {
  const { user_id, post_id } = req.body;
  const client = await pool.connect();

  try {
    //check if an inactive like for this user and post already exists
    const prevLike = await client.query(
      `
      SELECT * FROM likes WHERE user_id = $1 AND post_id = $2 AND active = false
    `,
      [user_id, post_id],
    );

    if (prevLike.rowCount > 0) {
      //if the inactive like exists, update it to active
      const newLike = await client.query(
        `
        UPDATE likes SET active = true WHERE user_id = $1 RETURNING *
      `,
        [prevLike.rows[0].id],
      );
      res.json(newLike.rows[0]);
    } else {
      //if it doesn't exist, insert new like row with active as true
      const newLike = await client.query(
        `
        INSERT INTO likes (user_id, post_id, created_at, active) 
        VALUES ($1, $2, CURRENT_TIMESTAMP, true) 
        RETURNING *
      `,
        [user_id, post_id],
      );
      res.json(newLike.rows[0]);
    }
  } catch (error) {
    console.error("Error", error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.delete("/likes/:id", async (req, res) => {
  const { id } = req.params;

  const client = await pool.connect();

  try {
    await client.query("DELETE FROM likes WHERE id = $1", [id]);
    res.json({ message: "Like Deleted Successfully" });
  } catch (err) {
    console.log(err.stack);
    res.status(500).send("An error occurred, please try again.");
  } finally {
    client.release();
  }
});

//Endpoint to get likes for a specific post
app.get("/likes/post/:post_id", async (req, res) => {
  const { post_id } = req.params;
  const client = await pool.connect();
  try {
    const likes = await client.query(
      `
      SELECT users.username, users.id AS user_id, likes.id AS likes_id
      FROM likes
      INNER JOIN users ON likes.user_id = users.id
      WHERE likes.post_id = $1 AND active = true
    `,
      [post_id],
    );
    res.json(likes.rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

//Endpoint to unlike a post
app.put("/likes/:userId/:postId", async (req, res) => {
  const { userId, postId } = req.params;
  const client = await pool.connect();

  try {
    //Update the like row to inactive
    await client.query(
      `
      UPDATE likes
      SET active = false
      WHERE user_id = $1 AND post_id = $2 AND active = true
    `,
      [userId, postId],
    );
    res.json({ message: "The like has been removed successfully!" });
  } catch (error) {
    console.error("Error", error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.get("/", (req, res) => {
  res.status(200).json({ message: "Welcome to the twitter API!" });
});

app.listen(3000, () => {
  console.log("App is listening on port 3000");
});

