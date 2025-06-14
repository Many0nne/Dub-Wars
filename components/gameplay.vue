<script setup lang="ts">
import { ref, computed } from 'vue'
import VideoPlayer from '~/components/videoPlayer.vue'
import type { KeycloakUser, Dub, ResultItem } from './../types/general'

const props = defineProps<{
  videoUrl?: string
  isMaster?: boolean
  syncTime?: number
}>()

// Vidéo
const videoUrl = computed(() => props.videoUrl || 'https://www.w3schools.com/html/mov_bbb.mp4')
const isMaster = computed(() => props.isMaster ?? false)
const syncTime = computed(() => props.syncTime ?? undefined)
const videoDuration = ref(0)
const videoPlayerRef = ref<InstanceType<typeof VideoPlayer> | null>(null)
const voteVideoPlayerRef = ref<InstanceType<typeof VideoPlayer> | null>(null)

// Barre d'action (audio)
const isRecording = ref(false)
const audioBlob = ref<Blob | null>(null)
const elapsed = ref(0)
let mediaRecorder: MediaRecorder | null = null
let timer: number | null = null
const isPlaying = ref(false)
const currentAudio = ref<HTMLAudioElement | null>(null)

const waveformCanvas = ref<HTMLCanvasElement | null>(null)
let audioContext: AudioContext | null = null
let analyser: AnalyserNode | null = null
let dataArray: Uint8Array | null = null
let source: MediaStreamAudioSourceNode | null = null
let animationId: number | null = null
const waveformBars = ref<number[]>([])
const MAX_BARS = 250

const route = useRoute()
const { $keycloakPromise } = useNuxtApp()
const partyId = route.query.partyId as string
const { $socket } = useNuxtApp()
const phase = ref<'dubbing' | 'waiting' | 'voting' | 'results'>('dubbing');
const currentDub = ref<Dub | null>(null);
const rating = ref(0);
const results = ref<ResultItem[]>([]);

function startRecording() {
    elapsed.value = 0
    isRecording.value = true
    audioBlob.value = null

    if (videoPlayerRef.value && videoPlayerRef.value.videoRef) {
        videoPlayerRef.value.videoRef.currentTime = 0
        videoPlayerRef.value.pause()
    }

    navigator.mediaDevices.getUserMedia({ 
        audio: {
            echoCancellation: false,
            noiseSuppression: false, 
            autoGainControl: true,
        }
     }).then(stream => {
        mediaRecorder = new MediaRecorder(stream)
        const chunks: BlobPart[] = []
        mediaRecorder.ondataavailable = e => chunks.push(e.data)
        mediaRecorder.onstop = () => {
        audioBlob.value = new Blob(chunks, { type: 'audio/webm' })
        stream.getTracks().forEach(track => track.stop())
        }
        mediaRecorder.onstart = () => {
            if (videoPlayerRef.value && typeof videoPlayerRef.value.play === 'function') {
                videoPlayerRef.value.play()
            }
        }
        mediaRecorder.start()
        audioContext = new window.AudioContext()
        analyser = audioContext.createAnalyser()
        source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)
        analyser.fftSize = 256
        dataArray = new Uint8Array(analyser.frequencyBinCount)
        drawWaveformBars()
        timer = window.setInterval(() => {
            elapsed.value++
            if (videoDuration.value && elapsed.value >= Math.ceil(videoDuration.value)) {
                stopRecording()
            }
        }, 1000)
    })
}

function drawWaveformBars() {
  if (!analyser || !waveformCanvas.value) return
  analyser.getByteTimeDomainData(dataArray!)
  // Calcule l'amplitude moyenne sur ce frame
  let sum = 0
  for (let i = 0; i < dataArray!.length; i++) {
    const v = dataArray![i] - 128
    sum += Math.abs(v)
  }
  const amplitude = sum / dataArray!.length
  // Ajoute la nouvelle amplitude à la fin du buffer
  waveformBars.value.push(amplitude)
  if (waveformBars.value.length > MAX_BARS) waveformBars.value.shift()

  // Dessine les barres
  const canvas = waveformCanvas.value
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const barWidth = canvas.width / MAX_BARS
  for (let i = 0; i < waveformBars.value.length; i++) {
    const barHeight = (waveformBars.value[i] / 128) * canvas.height
    ctx.fillStyle = '#06b6d4'
    ctx.fillRect(i * barWidth, (canvas.height - barHeight) / 2, barWidth * 0.8, barHeight)
  }
  animationId = requestAnimationFrame(drawWaveformBars)
}

function stopRecording() {
    isRecording.value = false
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
    if (timer) clearInterval(timer)
    if (animationId) cancelAnimationFrame(animationId)
    if (audioContext) audioContext.close()
    audioContext = null
    analyser = null
    source = null
    dataArray = null
    if (videoPlayerRef.value && typeof videoPlayerRef.value.pause === 'function') {
        videoPlayerRef.value.pause()
    }
}

function playAudio() {
  if (audioBlob.value) {
    // Nettoie la visualisation avant de rejouer
    waveformBars.value = []
    if (animationId) cancelAnimationFrame(animationId)
    if (waveformCanvas.value) {
      const ctx = waveformCanvas.value.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, waveformCanvas.value.width, waveformCanvas.value.height)
    }

    audioContext = new window.AudioContext()
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    dataArray = new Uint8Array(analyser.frequencyBinCount)
    const audio = new Audio(URL.createObjectURL(audioBlob.value))
    
    // Synchronisation précise
    const videoEl = videoPlayerRef.value?.$refs.videoRef as HTMLVideoElement | undefined
    if (videoEl) {
      // Réinitialise et démarre la vidéo
      videoEl.currentTime = 0
      const videoStartTime = performance.now()
      
      // Démarre l'audio avec un léger délai pour compenser le temps de traitement
      setTimeout(() => {
        const sourceNode = audioContext!.createMediaElementSource(audio)
        sourceNode.connect(analyser!)
        analyser!.connect(audioContext!.destination)
        
        audio.play().then(() => {
          // Ajuste la vidéo pour compenser le délai de démarrage
          const audioStartTime = performance.now()
          const delay = audioStartTime - videoStartTime
          videoEl.currentTime = delay / 1000
          videoEl.play()
        })
      }, 50)
    }

    drawWaveformBars()
    audio.onended = () => {
      if (animationId) cancelAnimationFrame(animationId)
      if (audioContext) audioContext.close()
      audioContext = null
      analyser = null
      dataArray = null
      if (videoEl) {
        videoEl.pause()
      }
    }
  }
}

function deleteAudio() {
    audioBlob.value = null
    elapsed.value = 0
    waveformBars.value = []
    // Nettoie le canvas
    if (waveformCanvas.value) {
        const ctx = waveformCanvas.value.getContext('2d')
        if (ctx) ctx.clearRect(0, 0, waveformCanvas.value.width, waveformCanvas.value.height)
    }
        // Remets la vidéo à 0
    if (videoPlayerRef.value && videoPlayerRef.value.videoRef) {
        videoPlayerRef.value.videoRef.currentTime = 0
        videoPlayerRef.value.pause()
    }
}

async function validateAudio() {
  if (!audioBlob.value) return alert('Aucun audio à valider.')
  const keycloak = await $keycloakPromise as KeycloakUser;
    const userId = keycloak?.tokenParsed?.sub
    const username = keycloak?.tokenParsed?.preferred_username
  if (!userId || !username || !partyId) {
    alert('Utilisateur non authentifié ou party inconnue.')
    return
  }

  const formData = new FormData()
  formData.append('partyId', partyId)
  formData.append('userId', userId)
  formData.append('username', username)
  formData.append('audio', audioBlob.value, 'dub.webm')
  formData.append('videoUrl', videoUrl.value)

  try {
    const res = await fetch('http://localhost:3001/api/dubs', {
      method: 'POST',
      body: formData,
    })
    const data = await res.json()
    if (data.success) {
      phase.value = 'waiting'
      $socket.emit('dubSubmitted', { partyId, userId })
    } else {
      alert('Erreur lors de l\'envoi du doublage.')
    }
  } catch (e) {
    alert('Erreur réseau lors de l\'envoi du doublage.')
  }
}

async function submitVote(selectedRating: number) {
  if (!currentDub.value) return;
  
  const keycloak = await $keycloakPromise as KeycloakUser;
  const userId = keycloak?.tokenParsed?.sub;
  
  if (!userId) return;

  if (userId === currentDub.value.userId) {
    alert("Vous ne pouvez pas voter pour votre propre doublage");
    return;
  }

  $socket.emit('submitVote', {
    partyId,
    voterId: userId,
    dubUserId: currentDub.value.userId,
    rating: selectedRating
  });
  
  phase.value = 'waiting';
}

async function fetchResults() {
  try {
    const response = await fetch(`http://localhost:3001/api/votes/${partyId}`);
    const data = await response.json();
    
    if (data.success) {
      results.value = data.results.summary.map((item: any) => ({
        ...item,
        average_rating: Number(item.average_rating), // Conversion en nombre
        vote_count: Number(item.vote_count) // Conversion en nombre
      }));
    }
  } catch (error) {
    console.error('Erreur lors de la récupération des résultats:', error);
  }
}

function playDubWithSync() {
  try {
    // Si déjà en cours de lecture, on ne fait rien
    if (isPlaying.value) return
    
    if (!currentDub.value) {
      throw new Error("Aucun doublage sélectionné")
    }
    
    const videoEl = voteVideoPlayerRef.value?.$refs.videoRef as HTMLVideoElement | undefined
    if (!videoEl) {
      throw new Error("Élément vidéo non trouvé")
    }
    
    // Arrête toute lecture précédente
    if (currentAudio.value) {
      currentAudio.value.pause()
      currentAudio.value = null
    }
    
    // Crée un nouvel élément audio
    const audio = new Audio(currentDub.value.audioUrl)
    currentAudio.value = audio
    isPlaying.value = true
    
    // Réinitialise les médias
    videoEl.currentTime = 0
    audio.currentTime = 0
    
    // Prépare les événements de synchronisation
    videoEl.onplaying = () => {
      audio.play().catch(e => {
        console.error("Erreur de lecture audio:", e)
        isPlaying.value = false
      })
    }
    
    // Gestion des erreurs vidéo
    videoEl.onerror = () => {
      console.error("Erreur de lecture vidéo")
      isPlaying.value = false
    }
    
    // Démarre la vidéo
    videoEl.play().catch(e => {
      console.error("Erreur de lecture vidéo:", e)
      isPlaying.value = false
    })
    
    const checkSync = setInterval(() => {
      const diff = Math.abs(videoEl.currentTime - audio.currentTime)
      if (diff > 0.1) { // Seuil de 100ms
        audio.currentTime = videoEl.currentTime
      }
    }, 500)
    
    // Nettoie à la fin
    const cleanup = () => {
      clearInterval(checkSync)
      isPlaying.value = false
      videoEl.pause()
      currentAudio.value = null
    }
    
    audio.onended = cleanup
    audio.onerror = cleanup
    videoEl.onended = cleanup
    
  } catch (error) {
    console.error("Erreur de synchronisation:", error)
    isPlaying.value = false
  }
}

function onVideoDuration(d: number) {
  videoDuration.value = d
}

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  if (audioContext) audioContext.close()
  if (currentAudio.value) {
    currentAudio.value.pause()
    currentAudio.value = null
  }
})

onMounted(() => {
  $socket.on('startVoting', (dub) => {
    phase.value = 'voting';
    currentDub.value = dub;
  });

  $socket.on('allVotesCompleted', async () => {
    phase.value = 'results';
    await fetchResults();
  });

  $socket.off('allDubsReady'); 
});
</script>

<!-- css plutôt que tailwind pour se fichier pour la lisibilité, trop de ligne :) -->

<template>
    <div v-if="phase === 'voting' && currentDub" class="voting-phase">
        <h3>Votez pour le doublage de {{ currentDub.username }}</h3>
        <div class="video-container">
            <VideoPlayer
                ref="voteVideoPlayerRef"
                :src="currentDub.videoUrl"
                :isMaster="false"
                :syncTime="0"
                @duration="onVideoDuration"
            />
        </div>
        <div class="sync-controls">
            <button 
                @click="playDubWithSync" 
                class="sync-button"
                :disabled="isPlaying"
            >
                <svg viewBox="0 0 24 24" class="icon">
                    <polygon points="8,5 16,12 8,19" fill="currentColor"/>
                    
                </svg>
                {{ isPlaying ? 'Lecture en cours...' : 'Jouer' }}
            </button>
        </div>
        <div class="rating-buttons">
            <button 
                v-for="i in 5" 
                :key="i"
                @click="submitVote(i)"
                :class="{ active: rating === i }"
            >
                {{ i }} ★
            </button>
        </div>
    </div>
    <div v-else-if="phase === 'waiting'" class="waiting-message">
        <p>En attente des autres joueurs...</p>
    </div>
    <div v-else-if="phase === 'results'" class="results-phase">
        <h3>Résultats finaux</h3>
        <div v-if="results.length > 0" class="results-list">
            <div v-for="(result, index) in results" :key="result.userId" class="result-item">
                <div class="result-rank">#{{ index + 1 }}</div>
                <div class="result-user">
                    <div class="username">{{ result.username }}</div>
                    <div class="stats">
                        <span class="average-rating">
                            Note moyenne: {{ typeof result.average_rating === 'number' ? result.average_rating.toFixed(2) : 'N/A' }} ★
                        </span>
                        <span class="vote-count">
                            ({{ result.vote_count }} vote{{ result.vote_count > 1 ? 's' : '' }})
                        </span>
                    </div>
                </div>
            </div>
        </div>
        <p v-else>Aucun résultat disponible</p>
    </div>
    <div v-else class="gameplay-container">
        <!-- Lecteur vidéo synchronisé -->
        <div class="video-container">
            <VideoPlayer
                ref="videoPlayerRef"
                :src="videoUrl"
                :isMaster="isMaster"
                :syncTime="syncTime"
                @duration="onVideoDuration"
            />
        </div>

        <!-- Barre d'action -->
        <div class="player-container">
            <div class="waveform-container">
                <canvas
                    ref="waveformCanvas"
                    width="500"
                    height="50"
                    class="waveform-canvas"
                ></canvas>
                <div class="time-display">
                    <span class="current-time">{{ elapsed ? new Date(elapsed * 1000).toISOString().substr(14, 5) : '00:00' }}</span>
                    <span class="duration">{{ videoDuration ? new Date(Math.ceil(videoDuration) * 1000).toISOString().substr(14, 5) : '00:00' }}</span>
                </div>
            </div>

            <div class="controls-container">
                <!-- Contrôles principaux -->
                <div class="main-controls">
                    <button
                        v-if="!isRecording && !audioBlob"
                        @click="startRecording"
                        class="control-button record-button"
                        aria-label="S'enregistrer"
                    >
                        <svg viewBox="0 0 24 24" class="icon">
                            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
                        </svg>
                    </button>

                    <div v-if="isRecording" class="recording-controls">
                        <button
                            @click="stopRecording"
                            class="control-button stop-button"
                            aria-label="Arrêter"
                        >
                            <svg viewBox="0 0 24 24" class="icon">
                                <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
                            </svg>
                        </button>
                        <span class="recording-indicator">Enregistrement • {{ elapsed }}s</span>
                    </div>

                    <div v-if="audioBlob" class="playback-controls">
                        <button @click="playAudio" class="control-button play-button" aria-label="Réécouter">
                            <svg viewBox="0 0 24 24" class="icon">
                                <polygon points="8,5 16,12 8,19" fill="currentColor"/>
                            </svg>
                        </button>
                        <button @click="deleteAudio" class="control-button delete-button" aria-label="Supprimer">
                            <svg viewBox="0 0 24 24" class="icon">
                                <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" stroke-width="2"/>
                            </svg>
                        </button>
                        <button @click="validateAudio" class="control-button validate-button" aria-label="Valider">
                            <svg viewBox="0 0 24 24" class="icon">
                                <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.gameplay-container,
.review-phase {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    background-color: #181818;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    width: fit-content;
}

.video-container {
    margin-bottom: 24px;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    display: flex;
    justify-content: center;
    width: fit-content;
}

.player-container {
    background-color: #282828;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    width: 640px;
}

.waveform-container {
    position: relative;
}

.waveform-canvas {
    width: 100%;
    height: 80px;
    border-radius: 6px;
    background-color: #121212;
    display: block;
}

.time-display {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
    font-size: 12px;
    color: #b3b3b3;
    font-family: 'Roboto', sans-serif;
}

.current-time {
    color: #1db954;
}

.controls-container {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.main-controls {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;
}

.control-button {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
    outline: none;
}

.control-button:hover {
    transform: scale(1.05);
}

.control-button:active {
    transform: scale(0.95);
}

.record-button {
    background-color: #1db954;
    color: white;
}

.record-button:hover {
    background-color: #1ed760;
}

.stop-button {
    background-color: #e22134;
    color: white;
}

.stop-button:hover {
    background-color: #f0283c;
}

.play-button {
    background-color: #1db954;
    color: white;
}

.play-button:hover {
    background-color: #1ed760;
}

.delete-button {
    background-color: #535353;
    color: white;
}

.delete-button:hover {
    background-color: #686868;
}

.validate-button {
    background-color: #4687d6;
    color: white;
}

.validate-button:hover {
    background-color: #5a95e0;
}

.icon {
    width: 24px;
    height: 24px;
}

.recording-controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}

.recording-indicator {
    color: #e22134;
    font-size: 12px;
    font-weight: 500;
}

.playback-controls {
    display: flex;
    gap: 16px;
    align-items: center;
}

.review-phase {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 500px;
}

.review-phase h3 {
    color: #1db954;
    margin-bottom: 16px;
    font-size: 1.5rem;
    font-weight: 600;
    text-align: center;
}

.review-phase .vote-buttons {
    display: flex;
    gap: 12px;
    margin: 16px 0;
    justify-content: center;
}

.review-phase .vote-buttons button {
    background-color: #282828;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 1.1rem;
    cursor: pointer;
    transition: background 0.2s;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

.review-phase .vote-buttons button:disabled {
    background-color: #444;
    color: #aaa;
    cursor: not-allowed;
}

.review-phase .vote-buttons button:not(:disabled):hover {
    background-color: #1db954;
    color: #fff;
}

.review-phase audio {
    margin: 16px 0 8px 0;
    width: 100%;
    max-width: 500px;
    background: #222;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.10);
}

.review-phase p {
    color: #b3b3b3;
    font-size: 1rem;
    margin: 8px 0;
    text-align: center;
}

.review-phase button {
    margin-top: 12px;
    background-color: #4687d6;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 8px 20px;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.2s;
}

.review-phase button:hover:not(:disabled) {
    background-color: #5a95e0;
}

.review-phase > div:last-child p {
    color: #1db954;
    font-weight: 600;
    font-size: 1.1rem;
    margin-top: 20px;
}

.voting-phase, .results-phase {
  text-align: center;
  padding: 20px;
}

.rating-buttons {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 20px;
}

.rating-buttons button {
  padding: 10px 15px;
  font-size: 1.2rem;
  background: #333;
  color: #fff;
  border: none;
  border-radius: 5px;
  cursor: pointer;
}

.rating-buttons button.active {
  background: #1db954;
}

.results-phase h3 {
  color: #1db954;
  margin-bottom: 10px;
}

.results-phase {
  text-align: center;
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.results-list {
  margin-top: 20px;
  text-align: left;
}

.result-item {
  display: flex;
  align-items: center;
  padding: 15px;
  margin-bottom: 15px;
  background-color: #282828;
  border-radius: 8px;
  gap: 15px;
}

.result-rank {
  font-size: 1.5rem;
  font-weight: bold;
  color: #1db954;
  min-width: 40px;
  text-align: center;
}

.result-user {
  flex-grow: 1;
}

.username {
  font-weight: bold;
  margin-bottom: 5px;
}

.stats {
  font-size: 0.9rem;
  color: #b3b3b3;
}

.average-rating {
  color: #1db954;
  margin-right: 10px;
}

.result-audio {
  width: 200px;
  flex-shrink: 0;
}

.voting-phase {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.voting-phase .video-container {
  width: 100%;
  max-width: 640px;
}

.dub-audio {
  width: 100%;
  max-width: 640px;
  margin: 10px 0;
}

.rating-buttons {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 20px;
  flex-wrap: wrap;
}

.rating-buttons button {
  padding: 12px 18px;
  font-size: 1.2rem;
  background: #333;
  color: #fff;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.rating-buttons button:hover {
  transform: scale(1.05);
}

.rating-buttons button.active {
  background: #1db954;
  transform: scale(1.1);
}


.sync-controls {
  margin: 20px 0;
  display: flex;
  justify-content: center;
}

.sync-button {
  padding: 12px 24px;
  background-color: #1db954;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.2s;
  display: flex;
}

.sync-button:hover {
  background-color: #1ed760;
}

.sync-button:disabled {
  background-color: #535353;
  cursor: not-allowed;
  opacity: 0.7;
}
</style>