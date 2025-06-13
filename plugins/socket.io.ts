import { io } from 'socket.io-client'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const socket = io(config.public.socketIoUrl || '')
  return {
    provide: {
      socket,
    },
  }
})