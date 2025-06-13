<script setup lang="ts">
import { ref, computed } from 'vue'
import VideoPlayer from '~/components/videoPlayer.vue'

// Props à adapter selon ton usage
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

// Barre d'action (audio)
const isRecording = ref(false)
const audioBlob = ref<Blob | null>(null)
const elapsed = ref(0)
let mediaRecorder: MediaRecorder | null = null
let timer: number | null = null

const waveformCanvas = ref<HTMLCanvasElement | null>(null)
let audioContext: AudioContext | null = null
let analyser: AnalyserNode | null = null
let dataArray: Uint8Array | null = null
let source: MediaStreamAudioSourceNode | null = null
let animationId: number | null = null
const waveformBars = ref<number[]>([])
const MAX_BARS = 250

function startRecording() {
    elapsed.value = 0
    isRecording.value = true
    audioBlob.value = null

    if (videoPlayerRef.value && videoPlayerRef.value.videoRef) {
        videoPlayerRef.value.videoRef.currentTime = 0
        videoPlayerRef.value.pause()
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        mediaRecorder = new MediaRecorder(stream)
        const chunks: BlobPart[] = []
        mediaRecorder.ondataavailable = e => chunks.push(e.data)
        mediaRecorder.onstop = () => {
        audioBlob.value = new Blob(chunks, { type: 'audio/webm' })
        stream.getTracks().forEach(track => track.stop())
        }
        mediaRecorder.start()
        if (videoPlayerRef.value && typeof videoPlayerRef.value.play === 'function') {
            videoPlayerRef.value.play()
        }
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

    // Synchronise la vidéo
    if (videoPlayerRef.value && typeof videoPlayerRef.value.play === 'function') {
      // Remets la vidéo au début
      const videoEl = videoPlayerRef.value.$refs.videoRef as HTMLVideoElement | undefined
      if (videoEl) {
        videoEl.currentTime = 0
        videoEl.play()
      }
    }

    audioContext = new window.AudioContext()
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    dataArray = new Uint8Array(analyser.frequencyBinCount)
    const audio = new Audio(URL.createObjectURL(audioBlob.value))
    const sourceNode = audioContext.createMediaElementSource(audio)
    sourceNode.connect(analyser)
    analyser.connect(audioContext.destination)
    audio.play()
    drawWaveformBars()
    audio.onended = () => {
      if (animationId) cancelAnimationFrame(animationId)
      if (audioContext) audioContext.close()
      audioContext = null
      analyser = null
      dataArray = null
      // Mets la vidéo en pause à la fin de la lecture audio
      if (videoPlayerRef.value && typeof videoPlayerRef.value.pause === 'function') {
        const videoEl = videoPlayerRef.value.$refs.videoRef as HTMLVideoElement | undefined
        if (videoEl) {
          videoEl.pause()
        }
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

function validateAudio() {
  // À compléter : envoyer l'audio au serveur, passer en attente, etc.
  alert('Audio validé (à implémenter)')
}

// Synchronisation vidéo (à brancher sur Socket.IO)
function onSync(event: { action: string, time: number }) {
  // À compléter : émettre via socket aux autres joueurs
}
function onRequestSync() {
  // À compléter : envoyer l'état courant du master au joueur qui demande
}

function onVideoDuration(d: number) {
  videoDuration.value = d
}

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  if (audioContext) audioContext.close()
})
</script>

<!-- css plutôt que tailwind pour se fichier pour la lisibilité, trop de ligne :) -->

<template>
    <div class="gameplay-container">
        <!-- Lecteur vidéo synchronisé -->
        <div class="video-container">
            <VideoPlayer
                ref="videoPlayerRef"
                :src="videoUrl"
                :isMaster="isMaster"
                :syncTime="syncTime"
                @sync="onSync"
                @requestSync="onRequestSync"
                @duration="onVideoDuration"
            />
        </div>

        <!-- Barre d'action alignée à la vidéo -->
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
.gameplay-container {
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
</style>