<script setup lang="ts">
import { ref, watch, onMounted, defineExpose } from 'vue'

const props = defineProps<{
  src: string
  isMaster: boolean
  syncTime?: number
}>()

const emit = defineEmits(['sync', 'requestSync', 'duration'])

const videoRef = ref<HTMLVideoElement | null>(null)

defineExpose({
  play: () => videoRef.value?.play(),
  pause: () => videoRef.value?.pause(),
  videoRef
})

// Quand le master joue, pause ou seek, il émet l'état aux autres
function onPlay() {
  if (props.isMaster) emit('sync', { action: 'play', time: videoRef.value?.currentTime })
}
function onPause() {
  if (props.isMaster) emit('sync', { action: 'pause', time: videoRef.value?.currentTime })
}
function onSeeked() {
  if (props.isMaster) emit('sync', { action: 'seek', time: videoRef.value?.currentTime })
}
function onTimeUpdate() {
  // Optionnel : pour la synchro fine, on peut émettre régulièrement le temps
  // if (props.isMaster) emit('sync', { action: 'time', time: videoRef.value?.currentTime })
}

function onLoadedMetadata() {
  if (videoRef.value) {
    emit('duration', videoRef.value.duration)
  }
}

// Quand le master change l'état, les autres suivent
watch(() => props.syncTime, (newTime) => {
  if (!props.isMaster && videoRef.value && typeof newTime === 'number') {
    videoRef.value.currentTime = newTime
  }
})

onMounted(() => {
  // Si on n'est pas master, on demande la synchro au master au montage
  if (!props.isMaster) emit('requestSync')
})
</script>

<template>
  <div class="video-player">
    <video
      ref="videoRef"
      :src="src"
      controls
      @play="onPlay"
      @pause="onPause"
      @seeked="onSeeked"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onLoadedMetadata"
      width="640"
      height="360"
    />
  </div>
</template>

<style scoped="css">
:deep(video) {
  max-height: 60svh;
}
</style>