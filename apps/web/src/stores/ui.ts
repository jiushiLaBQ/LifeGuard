import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', () => {
  const searchOpen = ref(false)
  const uploadOpen = ref(false)
  const matterOpen = ref(false)
  const mobileNavOpen = ref(false)

  function closeOverlays() {
    searchOpen.value = false
    uploadOpen.value = false
    matterOpen.value = false
    mobileNavOpen.value = false
  }

  return { searchOpen, uploadOpen, matterOpen, mobileNavOpen, closeOverlays }
})
