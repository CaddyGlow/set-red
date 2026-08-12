<script setup lang="ts">
/**
 * Set brand mark: an open ring with an offset point.
 * The ring inherits the surrounding text color; the point keeps the brand red
 * in both themes, so it is intentionally not a design token.
 */
withDefaults(defineProps<{ title?: string }>(), { title: undefined })
</script>

<template>
  <svg
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    stroke-width="4"
    stroke-linecap="round"
    :role="title ? 'img' : undefined"
    :aria-hidden="title ? undefined : 'true'"
  >
    <title v-if="title">{{ title }}</title>
    <path d="M 34 14.5 A 14 14 0 1 1 24 10 A 14 14 0 0 1 30 11.3" />
    <circle cx="35.5" cy="12.5" r="4.5" fill="#e23434" stroke="none" />
  </svg>
</template>
