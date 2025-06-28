import { io } from 'socket.io-client'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const socket = io(config.public.socketIoUrl, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    secure: true,
    rejectUnauthorized: false,
  })

  return {
    provide: {
      socket,
    },
  }
})