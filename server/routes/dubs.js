import express from 'express'
import mariadb from 'mariadb'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import 'dotenv/config'

let io

const router = express.Router()

const pool = mariadb.createPool({
  host: process.env.NUXT_HOST,
  user: process.env.NUXT_USER,
  password: process.env.NUXT_PASSWORD,
  database: process.env.NUXT_DATABASE,
})

// Configure Multer pour stocker les fichiers audio dans /uploads/dubs
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(process.cwd(), 'uploads', 'dubs')
    fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: function (req, file, cb) {
    // Format: partyId_userId_timestamp.webm
    const { partyId, userId } = req.body
    const ext = path.extname(file.originalname) || '.webm'
    cb(null, `${partyId}_${userId}_${Date.now()}${ext}`)
  }
})
const upload = multer({ storage })

// POST /api/dubs : enregistre un doublage
router.post('/', upload.single('audio'), async (req, res) => {
  const { partyId, userId, username, videoUrl } = req.body
  if (!partyId || !userId || !username || !req.file) {
    return res.status(400).json({ error: 'Missing fields or file' })
  }
  const audioUrl = `/uploads/dubs/${req.file.filename}`

  let conn
  try {
    conn = await pool.getConnection()
    // Un doublage par user/party (remplace si existe déjà)
    await conn.query(
        `INSERT INTO dubs (party_id, user_id, username, audio_url, video_url, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE audio_url = VALUES(audio_url), video_url = VALUES(video_url), created_at = NOW()`,
        [partyId, userId, username, audioUrl, videoUrl]
    )

    // Vérifie combien de doublages sont présents pour cette partie
    const [dubsCountRow] = await conn.query(
      'SELECT COUNT(*) as count FROM dubs WHERE party_id = ?',
      [partyId]
    )
    const dubsCount = dubsCountRow.count

    // Récupère le nombre de membres de la partie
    const [membersCountRow] = await conn.query(
      'SELECT COUNT(*) as count FROM party_members WHERE party_id = ?',
      [partyId]
    )
    const membersCount = membersCountRow.count

    // Si tout le monde a envoyé, notifie via socket
    if (io && dubsCount === membersCount && dubsCount > 0) {
      // Récupère tous les doublages pour la partie
      const dubs = await conn.query(
        'SELECT user_id, username, audio_url, video_url FROM dubs WHERE party_id = ?',
        [partyId]
      )
      io.to(partyId).emit('allDubsReady', { dubs })
    }

    res.json({ success: true, audioUrl })
  } catch (err) {
    console.error('Erreur MariaDB:', err)
    res.status(500).json({ error: err.message })
  } finally {
    if (conn) conn.release()
  }
})

// GET /api/dubs/:partyId : récupère tous les doublages d'une partie
router.get('/:partyId', async (req, res) => {
  const { partyId } = req.params
  let conn
  try {
    conn = await pool.getConnection()
    const rows = await conn.query(
        'SELECT user_id, username, audio_url, video_url FROM dubs WHERE party_id = ?',
        [partyId]
    )
    res.json({ dubs: rows })
  } catch (err) {
    console.error('Erreur MariaDB:', err)
    res.status(500).json({ error: err.message })
  } finally {
    if (conn) conn.release()
  }
})

export function setIo(socketIo) {
  io = socketIo
}

export default router