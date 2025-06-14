import express from 'express';
import mariadb from 'mariadb';
import 'dotenv/config';

const pool = mariadb.createPool({
  host: process.env.NUXT_HOST,
  user: process.env.NUXT_USER,
  password: process.env.NUXT_PASSWORD,
  database: process.env.NUXT_DATABASE,
});

const router = express.Router();

// Middleware pour gérer les BigInt dans les réponses JSON
BigInt.prototype.toJSON = function() {
  return this.toString();
};

router.post('/', async (req, res) => {
  let conn;
  try {
    const { partyId, voterId, dubUserId, rating } = req.body;
    conn = await pool.getConnection();

    // Validation des données
    if (!partyId || !voterId || !dubUserId || !rating) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tous les champs sont requis (partyId, voterId, dubUserId, rating)' 
      });
    }

    // Empêcher l'auteur de voter pour son propre doublage même si il y a une vérif côté client
    if (voterId === dubUserId) {
      return res.status(403).json({ 
        success: false, 
        error: 'Vous ne pouvez pas voter pour votre propre doublage' 
      });
    }


    // Validation que la note est entre 1 et 5
    const numericRating = parseInt(rating);
    if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ 
        success: false, 
        error: 'La note doit être un nombre entre 1 et 5' 
      });
    }

    // Vérifier que l'utilisateur n'a pas déjà voté
    const existingVote = await conn.query(
      'SELECT id FROM votes WHERE party_id = ? AND voter_id = ? AND dub_user_id = ?',
      [partyId, voterId, dubUserId]
    );

    if (existingVote && existingVote.length > 0) {
      return res.status(409).json({ 
        success: false, 
        error: 'Vous avez déjà voté pour ce doublage' 
      });
    }

    // Enregistrement du vote
    const result = await conn.query(
      'INSERT INTO votes (party_id, voter_id, dub_user_id, note) VALUES (?, ?, ?, ?)',
      [partyId, voterId, dubUserId, numericRating]
    );

    // Mettre à jour le flag has_been_voted
    await conn.query(
      'UPDATE dubs SET has_been_voted = TRUE WHERE party_id = ? AND user_id = ?',
      [partyId, dubUserId]
    );

    // Solution définitive pour gérer les BigInt
    const responseData = { 
      success: true,
      voteId: result.insertId.toString()
    };

    res.json(responseData);

  } catch (error) {
    console.error('Erreur lors de l\'enregistrement du vote:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur lors de l\'enregistrement du vote',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (conn) conn.release();
  }
});

router.get('/:partyId', async (req, res) => {
  let conn;
  try {
    const { partyId } = req.params;
    conn = await pool.getConnection();

    const results = await conn.query(`
      SELECT 
        d.user_id,
        d.username,
        AVG(v.note) as average_rating,
        COUNT(v.id) as vote_count,
        d.audio_url
      FROM votes v
      JOIN dubs d ON v.dub_user_id = d.user_id AND v.party_id = d.party_id
      WHERE v.party_id = ?
      GROUP BY d.user_id, d.username, d.audio_url
      ORDER BY average_rating DESC
    `, [partyId]);

    const voteDetails = await conn.query(
      'SELECT voter_id, dub_user_id, note FROM votes WHERE party_id = ?',
      [partyId]
    );

    // Conversion des BigInt en string pour la réponse
    const responseData = {
      success: true,
      results: {
        summary: results.map(row => ({
          ...row,
          vote_count: row.vote_count.toString()
        })),
        details: voteDetails
      }
    };

    res.json(responseData);

  } catch (error) {
    console.error('Erreur lors de la récupération des résultats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur lors de la récupération des résultats',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (conn) conn.release();
  }
});

export default router;