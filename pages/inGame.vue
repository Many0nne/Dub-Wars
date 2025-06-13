<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Gameplay from './../components/gameplay.vue'

const { $socket, $keycloakPromise } = useNuxtApp()
const route = useRoute()
const router = useRouter()
const partyId = ref(route.query.partyId as string)
const members = ref<{ id: string, username: string }[]>([])
const masterId = ref('')
const loading = ref(true)
const keycloak = ref<any>(null)
const username = ref('')
const userId = keycloak.value?.tokenParsed?.sub

onMounted(async () => {
  keycloak.value = await $keycloakPromise
  loading.value = false

  if (keycloak.value?.tokenParsed?.preferred_username) {
    username.value = keycloak.value.tokenParsed.preferred_username
  }

  if (partyId.value && username.value && userId) {
      $socket.emit('joinParty', { partyId: partyId.value, userId, username: username.value })
  }

  $socket.emit('getPartyMembers', { partyId: partyId.value })

  $socket.on('partyUpdate', (data: { members: { id: string, username: string }[], masterId: string }) => {
    members.value = data.members
    masterId.value = data.masterId
  })
})

function leaveGame() {
  const userId = keycloak.value?.tokenParsed?.sub
  $socket.emit('leaveParty', { partyId: partyId.value, userId })

  // Nettoie la liste des membres locaux
  members.value = []
  masterId.value = ''
  localStorage.removeItem('currentPartyId')
  localStorage.removeItem('currentRoomPage')

  // Retire les listeners pour éviter de recevoir des updates de la room
  $socket.off('partyUpdate')
  $socket.off('gameStarted')

  router.push({ path: '/' })
}
</script>

<template>
    <div v-if="loading" class="flex items-center justify-center min-h-screen">
        <div role="status">
            <svg aria-hidden="true" class="w-8 h-8 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor"/>
                <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentFill"/>
            </svg>
            <span class="sr-only">Loading...</span>
        </div>
    </div>
    <div v-else class="flex min-h-screen bg-gray-700">
        <!-- Sidebar -->
        <aside class="w-48 bg-gray-800 text-white p-4">
            <h2 class="text-lg font-bold mb-4">Joueurs</h2>
            <ul>
                <li v-for="m in members" :key="m.id" class="mb-2 flex items-center gap-2">
                    {{ m.username }}
                    <span
                      v-if="m.id === masterId"
                      class="ml-2 px-2 py-0.5 bg-yellow-400 text-xs text-black rounded"
                    >
                      Master
                    </span>
                </li>
            </ul>
            <div class="mt-4">
                <button @click="leaveGame" class="w-full bg-red-600 text-white font-semibold py-2 px-4 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50">Quitter la partie</button>
            </div>
        </aside>
        <!-- Main content -->
        <main class="flex-1 p-8">
            <Gameplay />
        </main>
    </div>
</template>