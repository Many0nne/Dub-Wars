import express from 'express'
import mariadb from 'mariadb'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import 'dotenv/config'

let io

const router = express.Router()
const BASE_URL = process.env.NUXT_SOCKET_IO_URL || 'http://localhost:3001';
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

router.post('/', upload.single('audio'), async (req, res) => {
  const { partyId, userId, username, videoUrl } = req.body
  if (!partyId || !userId || !username || !req.file) {
    return res.status(400).json({ error: 'Missing fields or file' })
  }
  const audioUrl = `${BASE_URL}/uploads/dubs/${req.file.filename}`;

  let conn
  try {
    conn = await pool.getConnection()
    await conn.query(
        `INSERT INTO dubs (party_id, user_id, username, audio_url, video_url, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE audio_url = VALUES(audio_url), video_url = VALUES(video_url), created_at = NOW()`,
        [partyId, userId, username, audioUrl, videoUrl]
    )

    const [dubsCountRow] = await conn.query(
      'SELECT COUNT(*) as count FROM dubs WHERE party_id = ?',
      [partyId]
    )
    const dubsCount = dubsCountRow.count

    const [membersCountRow] = await conn.query(
      'SELECT COUNT(*) as count FROM party_members WHERE party_id = ?',
      [partyId]
    )
    const membersCount = membersCountRow.count

    if (io && dubsCount === membersCount && dubsCount > 0) {
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

router.get('/random', async (req, res) => {
  let conn;
  try {
    const { partyId } = req.query;
    
    if (!partyId) {
      return res.status(400).json({ 
        success: false, 
        error: 'partyId est requis' 
      });
    }

    conn = await pool.getConnection();

    const rows = await conn.query(`
      SELECT user_id as userId, username, audio_url as audioUrl, video_url as videoUrl 
      FROM dubs 
      WHERE party_id = ? AND has_been_voted = FALSE
      ORDER BY RAND() LIMIT 1
    `, [partyId]);

    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Aucun doublage disponible',
        dubs: [] 
      });
    }

    const dub = rows[0];
    res.json({ 
      success: true,
      userId: dub.userId,
      username: dub.username,
      audioUrl: dub.audioUrl,
      videoUrl: dub.videoUrl
    });
  } catch (error) {
    console.error('ERREUR CRITIQUE dans /random:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  } finally {
    if (conn) conn.release();
  }
});

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