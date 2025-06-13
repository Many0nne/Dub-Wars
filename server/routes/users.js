import express from 'express'
import mariadb from 'mariadb'
import 'dotenv/config'

const router = express.Router()

const pool = mariadb.createPool({
  host: process.env.NUXT_HOST,
  user: process.env.NUXT_USER,
  password: process.env.NUXT_PASSWORD,
  database: process.env.NUXT_DATABASE,
})

router.post('/register', async (req, res) => {
  const { keycloak_id, username } = req.body
  if (!keycloak_id || !username) {
    return res.status(400).json({ error: 'Missing fields' })
  }
  let conn
  try {
    conn = await pool.getConnection()
    await conn.query(
      'INSERT IGNORE INTO users (keycloak_id, username) VALUES (?, ?)',
      [keycloak_id, username]
    )
    res.json({ success: true })
  } catch (err) {
    console.error('Erreur MariaDB:', err)
    res.status(500).json({ error: err.message })
  } finally {
    if (conn) conn.release()
  }
})

export default router