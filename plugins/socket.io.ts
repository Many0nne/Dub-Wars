import { io } from 'socket.io-client'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const socket = io(config.public.socketIoUrl, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    secure: true,
    rejectUnauthorized: false,
  })

  socket.on('connect', () => {
    console.log('Socket connected:', socket.id)
  })

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error)
  })

  return {
    provide: {
      socket,
    },
  }
})