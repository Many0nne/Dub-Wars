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

// Créer une party
router.post('/create', async (req, res) => {
  const { partyId, masterId } = req.body
  let conn
  try {
    conn = await pool.getConnection()
    await conn.query(
      'INSERT INTO parties (id, master_id) VALUES (?, ?)',
      [partyId, masterId]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  } finally {
    if (conn) conn.release()
  }
})

// Ajouter un membre à une party
router.post('/add-member', async (req, res) => {
  const { partyId, userId, username } = req.body
  let conn
  try {
    conn = await pool.getConnection()
    await conn.query(
      'INSERT IGNORE INTO party_members (party_id, user_id, username) VALUES (?, ?, ?)',
      [partyId, userId, username]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  } finally {
    if (conn) conn.release()
  }
})

router.post('/remove-member', async (req, res) => {
  const { partyId, userId } = req.body
  let conn
  try {
    conn = await pool.getConnection()
    await conn.query(
      'DELETE FROM party_members WHERE party_id = ? AND user_id = ?',
      [partyId, userId]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  } finally {
    if (conn) conn.release()
  }
})

router.post('/delete', async (req, res) => {
  const { partyId } = req.body
  let conn
  try {
    conn = await pool.getConnection()
    await conn.query(
      'DELETE FROM parties WHERE id = ?',
      [partyId]
    )
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  } finally {
    if (conn) conn.release()
  }
})

export default router