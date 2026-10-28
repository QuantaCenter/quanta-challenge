<script setup lang="ts">
const props = defineProps<{ source: string }>();
const { html, update } = useMarkdown({ codeHeader: true });

watch(
   () => props.source,
   (source) => void update(source),
   { immediate: true },
);
</script>

<template>
   <LearningArticleBody :html="html" />
</template>
