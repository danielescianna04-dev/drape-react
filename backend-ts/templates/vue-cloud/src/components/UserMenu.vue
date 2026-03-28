<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { signOut, useSession } from '../lib/auth-client'

const { data: session } = useSession()
const open = ref(false)
const menuRef = ref<HTMLDivElement | null>(null)
const router = useRouter()

const user = computed(() => session.value?.user ?? null)

const initials = computed(() => {
  const u = user.value
  if (!u) return ''
  return (u.name || u.email || 'U')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
})

function handleClickOutside(e: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('mousedown', handleClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', handleClickOutside))

async function handleLogout() {
  await signOut()
  router.push('/login')
}
</script>

<template>
  <div v-if="user" class="relative" ref="menuRef">
    <button
      @click="open = !open"
      class="flex items-center gap-2 rounded-full hover:opacity-80 transition"
    >
      <img v-if="user.image" :src="user.image" alt="" class="w-8 h-8 rounded-full" />
      <div
        v-else
        class="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium"
      >
        {{ initials }}
      </div>
    </button>

    <div
      v-if="open"
      class="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50"
    >
      <div class="px-4 py-2 border-b border-gray-100">
        <p class="text-sm font-medium text-gray-900 truncate">{{ user.name }}</p>
        <p class="text-xs text-gray-500 truncate">{{ user.email }}</p>
      </div>
      <button
        @click="handleLogout"
        class="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition"
      >
        Sign out
      </button>
    </div>
  </div>
</template>
