<script setup lang="ts">
import { AreaChart, Link, QrCode } from '@lucide/vue'

const { t } = useI18n()

// Minimal landing page: three highlights only, not the full feature matrix.
const features = computed(() => [
  {
    title: t('home.features.url_shortening.title'),
    description: t('home.features.url_shortening.description'),
    icon: Link,
  },
  {
    title: t('home.features.analytics.title'),
    description: t('home.features.analytics.description'),
    icon: AreaChart,
  },
  {
    title: t('home.features.qr_code.title'),
    description: t('home.features.qr_code.description'),
    icon: QrCode,
  },
])
</script>

<template>
  <section
    class="
      border-t bg-muted/30 py-14 text-foreground
      md:py-20
    "
  >
    <div class="mx-auto max-w-5xl px-6">
      <div
        class="
          grid gap-3
          sm:grid-cols-3
        "
      >
        <div
          v-for="item in features"
          :key="item.title"
          class="
            flex flex-col gap-3 rounded-xl border bg-card p-6
            text-card-foreground
          "
        >
          <span
            class="
              flex size-9 items-center justify-center rounded-lg bg-muted
              text-muted-foreground
            "
          >
            <component
              :is="item.icon"
              class="size-4 shrink-0"
              aria-hidden="true"
            />
          </span>
          <h2 class="text-base font-medium">
            {{ item.title }}
          </h2>
          <p class="text-sm text-pretty text-muted-foreground">
            {{ item.description }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
