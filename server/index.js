import express from 'express'
import { Server } from 'socket.io'
import http from 'http'
import usersRouter from './routes/users.js'
import partiesRouter from './routes/parties.js'
import cors from 'cors'
import 'dotenv/config'

const app = express()
app.use(cors({ origin: 'http://localhost:3000' }))
app.use(express.json())
app.use('/api/users', usersRouter)
app.use('/api/parties', partiesRouter)
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
      masterId: userId
    }
    socket.join(partyId)
    socket.emit('partyCreated', partyId)
    io.to(partyId).emit('partyUpdate', {
      members: parties[partyId].members,
      state: parties[partyId].state,
      masterId: parties[partyId].masterId
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
          masterId: parties[partyId].masterId
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
        masterId: parties[partyId].masterId
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
        masterId: parties[partyId].masterId
      })
    }
  })

  socket.on('startGame', ({ partyId, userId }) => {
    console.log('startGame called', { partyId, userId, masterId: parties[partyId]?.masterId })
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
        masterId: party.masterId
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