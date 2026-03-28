<script setup lang="ts">
import { provide, computed } from 'vue'
import { useSession } from '../lib/auth-client'

const { data: session, isPending } = useSession()

const user = computed(() => session.value?.user ?? null)
const isLoading = computed(() => isPending.value)
const isAuthenticated = computed(() => !!session.value?.user)

provide('auth', {
  user,
  isLoading,
  isAuthenticated,
})
</script>

<template>
  <slot />
</template>
