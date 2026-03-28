<script setup lang="ts">
import { RouterView } from 'vue-router'
import Navbar from './components/NavBar.vue'
import Footer from './components/FooterSection.vue'
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <Navbar />
    <main class="flex-1">
      <RouterView />
    </main>
    <Footer />
  </div>
</template>
