<template>
  <transition name="fade">
    <div
      v-if="show"
      class="fixed top-6 left-1/2 transform -translate-x-1/2 bg-orange-900 text-white px-6 py-3 rounded shadow-lg z-50"
    >
      {{ message }}
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'

const props = defineProps<{ message: string }>()
const show = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.message,
  (val) => {
    if (val) {
      show.value = true
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        show.value = false
      }, 2500)
    }
  }
)

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
</script>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>