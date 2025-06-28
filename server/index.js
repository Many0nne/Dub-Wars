import express from 'express';
import { Server } from 'socket.io';
import http from 'http';
import usersRouter from './routes/users.js';
import partiesRouter from './routes/parties.js';
import dubsRouter from './routes/dubs.js';
import votesRouter from './routes/votes.js';
import cors from 'cors';
import 'dotenv/config';
import path from 'path';

const availableVideos = [
  'http://localhost:3001/videos/TiboInshape.mp4',
  'http://localhost:3001/videos/Breaking bad.mp4',
  'http://localhost:3001/videos/GameMixTreize.mp4',
  'http://localhost:3001/videos/Les Simpsons - homer.mp4',
  'http://localhost:3001/videos/Regegorilla.mov',
];
const app = express()
const allowedOrigins = ['http://localhost:3000', process.env.NGROK_CLIENT];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
app.use('/videos', express.static(path.join(process.cwd(), 'public/videos')));
const BASE_URL = process.env.NUXT_SOCKET_IO_URL || 'http://localhost:3001';
app.use(express.json())
app.use('/api/users', usersRouter)
app.use('/api/parties', partiesRouter)
app.use('/api/dubs', dubsRouter)
app.use('/api/votes', votesRouter)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'] // Force les transports
});

const parties = {}

io.on('connection', (socket) => {  
  // Create a party
  socket.on('createParty', async({ partyId, userId, username }) => {
    const videos = availableVideos.map(url => ({ url, dubbed: false }));
    parties[partyId] = {
      members: [{ id: userId, username }],
      state: 'starting',
      masterId: userId,
      submittedDubs: [],
      currentVotingDub: null,
      votedMembers: [],
      videos,
      currentVideoIndex: 0,
      currentVideo: videos[0].url,
    }
    socket.join(partyId)
    socket.emit('partyCreated', partyId)
    io.to(partyId).emit('partyUpdate', {
      members: parties[partyId].members,
      state: parties[partyId].state,
      masterId: parties[partyId].masterId,
      currentVotingDub: parties[partyId].currentVotingDub,
      submittedDubs: parties[partyId].submittedDubs,
      votedMembers: parties[partyId].votedMembers
    })

    await fetch(`${BASE_URL}/api/parties/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partyId, masterId: userId })
    })
    await fetch(`${BASE_URL}/api/parties/add-member`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partyId, userId, username })
    })
  })

  socket.on('getCurrentVideo', ({ partyId }) => {
    if (parties[partyId]) {
      socket.emit('currentVideo', parties[partyId].currentVideo);
    }
  });

  // Ajout d'une gestion de file d'attente des doublages à voter
  socket.on('dubSubmitted', async ({ partyId, userId }) => {
    if (!parties[partyId]) return;

    if (!parties[partyId].submittedDubs) {
      parties[partyId].submittedDubs = [];
    }

    if (!parties[partyId].submittedDubs.includes(userId)) {
      parties[partyId].submittedDubs.push(userId);
    }

    const currentMembers = parties[partyId].members.map(m => m.id);
    const allSubmitted = currentMembers.every(id => 
      parties[partyId].submittedDubs.includes(id)
    );

    if (allSubmitted) {
      parties[partyId].phase = 'voting';
      // Correction : utiliser la bonne route pour récupérer les doublages
      const dubsResponse = await fetch(`${BASE_URL}/api/dubs/${partyId}`);
      const dubsData = await dubsResponse.json();
      if (!dubsData.dubs || !Array.isArray(dubsData.dubs)) {
        parties[partyId].phase = 'results';
        io.to(partyId).emit('allVotesCompleted');
        return;
      }
      // Filtrer les doublages pour ne garder que ceux de la vidéo courante
      const currentVideo = parties[partyId].currentVideo;
      const filteredDubs = dubsData.dubs.filter(dub => dub.video_url === currentVideo || dub.videoUrl === currentVideo);
      if (filteredDubs.length === 0) {
        parties[partyId].phase = 'results';
        io.to(partyId).emit('allVotesCompleted');
        return;
      }
      // On crée une file d'attente des doublages à voter
      parties[partyId].dubsToVote = filteredDubs.map(dub => ({
        userId: dub.user_id || dub.userId,
        username: dub.username,
        audioUrl: dub.audio_url || dub.audioUrl,
        videoUrl: dub.video_url || dub.videoUrl,
      }));
      parties[partyId].currentDubIndex = 0;
      parties[partyId].votedMembers = [];
      // On lance le vote sur le premier doublage
      const firstDub = parties[partyId].dubsToVote[0];
      parties[partyId].currentVotingDub = firstDub;
      // Vérifie s'il y a au moins un votant possible (pas l'auteur)
      const eligibleVoters = parties[partyId].members.filter(m => m.id !== firstDub.userId);
      if (eligibleVoters.length === 0) {
        // Personne ne peut voter, passe au doublage suivant
        skipToNextDubOrResults(partyId);
      } else {
        io.to(partyId).emit('startVoting', firstDub);
      }
    }
  });

  socket.on('submitVote', async ({ partyId, voterId, dubUserId, rating, videoUrl }) => {
    if (!parties[partyId]) return;

    // Empêche un joueur de voter plusieurs fois pour le même doublage dans ce round
    if (parties[partyId].votedMembers && parties[partyId].votedMembers.includes(voterId)) {
      return;
    }


    const voteResponse = await fetch(`${BASE_URL}/api/votes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partyId, voterId, dubUserId, rating, videoUrl }) // Ajout de videoUrl
    });
    
    if (!voteResponse.ok) throw new Error('Vote failed');

    // Mettre à jour l'état local
    if (!parties[partyId].votedMembers) parties[partyId].votedMembers = [];
    parties[partyId].votedMembers.push(voterId);

    const currentDub = parties[partyId].currentVotingDub;
    const allMembers = parties[partyId].members.map(m => m.id);
    const votersNeeded = allMembers.filter(id => id !== currentDub.userId);
    const allVoted = votersNeeded.every(id => parties[partyId].votedMembers.includes(id));

    if (allVoted) {
      // Passe au doublage suivant dans la file
      parties[partyId].votedMembers = [];
      parties[partyId].currentDubIndex = (parties[partyId].currentDubIndex || 0) + 1;
      const dubsToVote = parties[partyId].dubsToVote || [];
      if (parties[partyId].currentDubIndex < dubsToVote.length) {
        const nextDub = dubsToVote[parties[partyId].currentDubIndex];
        parties[partyId].currentVotingDub = nextDub;
        // Vérifie s'il y a au moins un votant possible (pas l'auteur)
        const eligibleVoters = parties[partyId].members.filter(m => m.id !== nextDub.userId);
        if (eligibleVoters.length === 0) {
          // Personne ne peut voter, passe au doublage suivant
          skipToNextDubOrResults(partyId);
        } else {
          io.to(partyId).emit('startVoting', nextDub);
        }
      } else {
        parties[partyId].phase = 'results';
        io.to(partyId).emit('allVotesCompleted');
      }
    }
  });

  socket.on('joinParty', async({ partyId, userId, username }) => {
    if (parties[partyId]) {
      if (parties[partyId].state !== 'starting') {
        socket.emit('partyNotJoinable', partyId)
        return
      }
      if (!parties[partyId].members.some(m => m.id === userId)) {
        parties[partyId].members.push({ id: userId, username })
        socket.join(partyId)
        socket.emit('partyJoined', partyId)
        io.to(partyId).emit('partyUpdate', {
          members: parties[partyId].members,
          state: parties[partyId].state,
          masterId: parties[partyId].masterId,
          currentVotingDub: parties[partyId].currentVotingDub,
          submittedDubs: parties[partyId].submittedDubs,
          votedMembers: parties[partyId].votedMembers
        })

        await fetch(`${BASE_URL}/api/parties/add-member`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ partyId, userId, username })
        })
      } else {
        socket.emit('alreadyInParty', partyId)
      }
    } else {
      socket.emit('partyNotFound')
    }
  })

  socket.on('leaveParty', async({ partyId, userId }) => {
    if (parties[partyId]) {
      const wasMaster = parties[partyId].masterId === userId

      parties[partyId].members = parties[partyId].members.filter(m => m.id !== userId)
      socket.leave(partyId)
      if (wasMaster && parties[partyId].members.length > 0) {
        parties[partyId].masterId = parties[partyId].members[0].id
      }
      io.to(partyId).emit('partyUpdate', {
        members: parties[partyId].members,
        state: parties[partyId].state,
        masterId: parties[partyId].masterId,
        currentVotingDub: parties[partyId].currentVotingDub,
        submittedDubs: parties[partyId].submittedDubs,
        votedMembers: parties[partyId].votedMembers
      })

      await fetch(`${BASE_URL}/api/parties/remove-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partyId, userId })
      })

      if (parties[partyId].members.length === 0) {
        delete parties[partyId]
        await fetch(`${BASE_URL}/api/parties/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ partyId })
        })
      }
    }
  })

  socket.on('getPartyMembers', ({ partyId }) => {
    if (parties[partyId]) {
      socket.emit('partyUpdate', {
        members: parties[partyId].members,
        state: parties[partyId].state,
        masterId: parties[partyId].masterId,
        currentVotingDub: parties[partyId].currentVotingDub,
        submittedDubs: parties[partyId].submittedDubs,
        votedMembers: parties[partyId].votedMembers
      })
    }
  })

  socket.on('startGame', ({ partyId, userId }) => {
    if (parties[partyId]) {
      if (parties[partyId].members.length < 2) {
        socket.emit('startGameError', { reason: 'not-enough-players' })
        return
      }
      parties[partyId].state = 'in-game'
      io.to(partyId).emit('gameStarted', { partyId })
    }
  })

  // Ajout de la gestion du passage à la vidéo suivante et du marquage "dubbed"
  socket.on('nextRound', ({ partyId }) => {
    const party = parties[partyId];
    if (!party) return;
    // Marque la vidéo courante comme doublée
    const current = party.videos[party.currentVideoIndex];
    if (current) current.dubbed = true;
    // Passe à la suivante
    const nextIndex = party.videos.findIndex(v => !v.dubbed);
    if (nextIndex !== -1) {
      party.currentVideoIndex = nextIndex;
      party.currentVideo = party.videos[nextIndex].url;
      // Réinitialise l’état de la partie pour la nouvelle manche
      party.submittedDubs = [];
      party.currentVotingDub = null;
      party.votedMembers = [];
      party.phase = 'dubbing';
      io.to(partyId).emit('newVideo', party.currentVideo);
    } else {
      // Plus de vidéos disponibles, fin de la partie
      party.phase = 'results';
      io.to(partyId).emit('allDubsCompleted')
      io.to(partyId).emit('allVotesCompleted');
    }
  });

  // Handle disconnect
  socket.on('disconnect', async() => {
    for (const [partyId, party] of Object.entries(parties)) {
      const wasMaster = party.masterId === socket.id
      party.members = party.members.filter(m => m.id !== socket.id)
      if (wasMaster && party.members.length > 0) {
        party.masterId = party.members[0].id
      }
      io.to(partyId).emit('partyUpdate', {
        members: party.members,
        state: party.state,
        masterId: party.masterId,
        currentVotingDub: party.currentVotingDub,
        submittedDubs: party.submittedDubs,
        votedMembers: party.votedMembers
      })

      if (party.members.length === 0) {
        delete parties[partyId]        
      }
    }
  })
})

server.listen(3001, () => {
})