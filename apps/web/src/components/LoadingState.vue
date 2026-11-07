<template>
  <div class="card p-5" role="status" aria-label="正在加载">
    <div class="flex items-center gap-3">
      <span class="size-5 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden="true" />
      <span class="text-sm text-muted">正在加载工作区…</span>
    </div>
    <div class="mt-5 space-y-3">
      <div class="h-4 w-2/5 animate-pulse rounded bg-line" />
      <div class="h-16 animate-pulse rounded-xl bg-canvas" />
      <div class="h-16 animate-pulse rounded-xl bg-canvas" />
    </div>
  </div>
</template>
