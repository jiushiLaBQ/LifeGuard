<script setup lang="ts">
import LoadingState from '@/components/LoadingState.vue'
import ToastStack from '@/components/ToastStack.vue'
</script>

<template>
  <Suspense>
    <template #default><RouterView /></template>
    <template #fallback><div class="p-6"><LoadingState /></div></template>
  </Suspense>
  <ToastStack />
</template>
