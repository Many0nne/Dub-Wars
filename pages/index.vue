<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Toast from '../components/Toast.vue'

const { $socket } = useNuxtApp()
const partyId = ref('')
const members = ref<{ id: string, username: string }[]>([])
const status = ref('')
const { $keycloakPromise } = useNuxtApp()
const keycloak = ref<any>(null)
const loading = ref(true)
const router = useRouter()

const username = computed(() => keycloak.value?.tokenParsed?.preferred_username)

onMounted(async () => {
  keycloak.value = await $keycloakPromise
  loading.value = false

  const partyId = localStorage.getItem('currentPartyId')
  const page = localStorage.getItem('currentRoomPage')
  if (partyId && page) {
    router.replace({ path: `/${page}`, query: { partyId } })
  }
})

const logout = () => {
  keycloak.value.logout({
    redirectUri: window.location.origin,
  })
}

function showToast(message: string) {
  status.value = '' // force le watcher à se déclencher
  setTimeout(() => {
    status.value = message
  }, 10)
}

function createParty() {
  if (!username.value) return
  const id = Math.random().toString(36).substring(2, 8)
  const userId = keycloak.value?.tokenParsed?.sub
  $socket.emit('createParty', { partyId: id, userId, username: username.value })
}

function joinParty() {
  if (!username.value || !partyId.value) return
  const userId = keycloak.value?.tokenParsed?.sub
  $socket.emit('joinParty', { partyId: partyId.value, userId, username: username.value })
}

$socket.on('partyCreated', (id: string) => {
  partyId.value = id
  localStorage.setItem('currentUsername', username.value)
  status.value = 'Party created!'
  router.push({ 
    path: '/waitingRoom', 
    query: { partyId: id }
  })
})

$socket.on('partyJoined', (id: string) => {
  partyId.value = id
  localStorage.setItem('currentUsername', username.value)
  status.value = 'Joined party!'
  router.push({ 
    path: '/waitingRoom', 
    query: { partyId: id }
  })
})

$socket.on('partyUpdate', (currentMembers: { id: string, username: string }[]) => {
  members.value = currentMembers
})

$socket.on('partyNotFound', () => {
  localStorage.removeItem('currentPartyId')
  localStorage.removeItem('currentRoomPage')
  showToast('Party not found!')
})

$socket.on('alreadyInParty', (id: string) => {
  showToast('Vous êtes déjà dans cette partie !')
})

$socket.on('partyNotJoinable', (id: string) => {
  showToast("Impossible de rejoindre : la partie a déjà commencé ou est terminée.")
})
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
  <div v-else class="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
    <Toast :message="status" />
    <!-- Navbar -->
    <nav class="w-full flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-800 shadow">
      <div class="flex items-center gap-2">
        <NuxtIcon name="mdi:account" class="text-blue-600 dark:text-blue-400" />
        <span class="font-semibold text-gray-800 dark:text-gray-100">{{ username }}</span>
      </div>
      <button
        @click="logout"
        :disabled="!username"
        class="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <NuxtIcon name="mdi:logout" />
        Se déconnecter
      </button>
    </nav>
    <!-- Main Content -->
    <div class="flex flex-1 flex-col items-center justify-center">
      <div class="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8 w-full max-w-md mt-8">
        <div class="flex flex-col gap-4">
          <button
            @click="createParty"
            class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition"
          >
            Create Party
          </button>
          <div class="flex gap-2">
            <input
              v-model="partyId"
              placeholder="Party ID"
              class="flex-1 border border-gray-300 dark:border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <button
              @click="joinParty"
              class="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded transition"
            >
              Join Party
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>