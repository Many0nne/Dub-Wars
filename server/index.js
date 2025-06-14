import express from 'express'
import { Server } from 'socket.io'
import http from 'http'
import usersRouter from './routes/users.js'
import partiesRouter from './routes/parties.js'
import dubsRouter from './routes/dubs.js'
import votesRouter from './routes/votes.js'
import cors from 'cors'
import 'dotenv/config'
import path from 'path'

const app = express()
app.use(cors({ origin: 'http://localhost:3000' }))
app.use(express.json())
app.use('/api/users', usersRouter)
app.use('/api/parties', partiesRouter)
app.use('/api/dubs', dubsRouter)
app.use('/api/votes', votesRouter)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))
const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: '*' }
})

const parties = {}

io.on('connection', (socket) => {
  // Create a party
  socket.on('createParty', async({ partyId, userId, username }) => {
    parties[partyId] = {
      members: [{ id: userId, username }],
      state: 'starting',
      masterId: userId,
      submittedDubs: [],
      currentVotingDub: null,
      votedMembers: []
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

    await fetch('http://localhost:3001/api/parties/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partyId, masterId: userId })
    })
    await fetch('http://localhost:3001/api/parties/add-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partyId, userId, username })
    })
  })

  socket.on('submitVote', async ({ partyId, voterId, dubUserId, rating }) => {
    if (!parties[partyId]) return;

    console.log(`Vote received from ${voterId} for ${dubUserId}`); // Debug

    try {
      const voteResponse = await fetch('http://localhost:3001/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partyId, voterId, dubUserId, rating })
      });
      
      if (!voteResponse.ok) throw new Error('Vote failed');

      // Mettre à jour l'état local
      if (!parties[partyId].votedMembers) parties[partyId].votedMembers = [];
      parties[partyId].votedMembers.push(voterId);

      const allMembers = parties[partyId].members.map(m => m.id);
      const votersNeeded = allMembers.filter(id => id !== parties[partyId].currentVotingDub.userId);
      const allVoted = votersNeeded.every(id => parties[partyId].votedMembers.includes(id));
      
      if (allVoted) {
        await startNextVotingRound(partyId);
      }
    } catch (error) {
      console.error('Vote processing error:', error);
    }
  });

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
      
      const nextDub = await getRandomDub(partyId);
      
      if (nextDub) {
        parties[partyId].currentVotingDub = nextDub;
        io.to(partyId).emit('startVoting', nextDub);
      } else {
        parties[partyId].phase = 'results';
        io.to(partyId).emit('allVotesCompleted');
      }
    }
  });

  socket.on('getNextDubToVote', ({ partyId }) => {
    if (parties[partyId]) {
      const nextDub = getNextDubToVote(partyId);
      io.to(partyId).emit('startVoting', nextDub);
    }
  });

  async function getRandomDub(partyId) {
    try {
      const response = await fetch(`http://localhost:3001/api/dubs/random?partyId=${partyId}`);
      const data = await response.json();
      
      if (!data.success) {
        console.log('Aucun doublage disponible:', data.error);
        return null;
      }

      return {
        userId: data.userId,
        username: data.username,
        audioUrl: data.audioUrl,
        videoUrl: data.videoUrl,
      };
    } catch (error) {
      console.error('Échec dans getRandomDub:', error);
      return null;
    }
  }

  async function startNextVotingRound(partyId) {
    const party = parties[partyId];
    
    party.votedMembers = [];
    
    const nextDub = await getRandomDub(partyId);
    
    if (nextDub) {
      party.currentVotingDub = nextDub;
      io.to(partyId).emit('startVoting', nextDub);
    } else {
      party.phase = 'results';
      io.to(partyId).emit('allVotesCompleted');
    }
  }

  function getNextDubToVote(partyId) {
    return null;
  }

  // Join a party
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

        await fetch('http://localhost:3001/api/parties/add-member', {
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

      await fetch('http://localhost:3001/api/parties/remove-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partyId, userId })
      })

      if (parties[partyId].members.length === 0) {
        delete parties[partyId]
        await fetch('http://localhost:3001/api/parties/delete', {
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
      parties[partyId].state = 'in-game'
      io.to(partyId).emit('gameStarted', { partyId })
    }
  })

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
  console.log('Socket.IO server running on port 3001')
})