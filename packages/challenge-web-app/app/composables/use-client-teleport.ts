export const useClientTeleport = () => {
   const teleported = ref(false);
   onMounted(() => {
      teleported.value = true;
   });
   return teleported;
};
