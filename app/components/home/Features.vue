<script setup lang="ts">
import { AreaChart, FileJson, Globe, Hourglass, Languages, Link, Paintbrush, QrCode, ServerOff, Share2, Smartphone, Sparkles } from '@lucide/vue'

const { t } = useI18n()

// The first three entries lead the grid and get a wider cell on large screens.
const features = computed(() => [
  {
    title: t('home.features.url_shortening.title'),
    description: t('home.features.url_shortening.description'),
    icon: Link,
    featured: true,
  },
  {
    title: t('home.features.analytics.title'),
    description: t('home.features.analytics.description'),
    icon: AreaChart,
    featured: true,
  },
  {
    title: t('home.features.realtime_analytics.title'),
    description: t('home.features.realtime_analytics.description'),
    icon: Globe,
    featured: true,
  },
  {
    title: t('home.features.serverless.title'),
    description: t('home.features.serverless.description'),
    icon: ServerOff,
    featured: false,
  },
  {
    title: t('home.features.customizable_slug.title'),
    description: t('home.features.customizable_slug.description'),
    icon: Paintbrush,
    featured: false,
  },
  {
    title: t('home.features.ai_slug.title'),
    description: t('home.features.ai_slug.description'),
    icon: Sparkles,
    featured: false,
  },
  {
    title: t('home.features.link_expiration.title'),
    description: t('home.features.link_expiration.description'),
    icon: Hourglass,
    featured: false,
  },
  {
    title: t('home.features.device_routing.title'),
    description: t('home.features.device_routing.description'),
    icon: Smartphone,
    featured: false,
  },
  {
    title: t('home.features.og_preview.title'),
    description: t('home.features.og_preview.description'),
    icon: Share2,
    featured: false,
  },
  {
    title: t('home.features.qr_code.title'),
    description: t('home.features.qr_code.description'),
    icon: QrCode,
    featured: false,
  },
  {
    title: t('home.features.import_export.title'),
    description: t('home.features.import_export.description'),
    icon: FileJson,
    featured: false,
  },
  {
    title: t('home.features.multi_language.title'),
    description: t('home.features.multi_language.description'),
    icon: Languages,
    featured: false,
  },
])
</script>

<template>
  <section
    class="
      bg-background py-16 text-foreground
      md:py-24
    "
  >
    <div
      class="
        mx-auto max-w-6xl space-y-12 px-6
        md:space-y-16
      "
    >
      <div class="mx-auto max-w-xl space-y-4 text-center">
        <p
          class="
            text-xs font-medium tracking-widest text-muted-foreground uppercase
          "
        >
          {{ $t('home.features.title') }}
        </p>
        <h2
          class="
            text-3xl font-medium text-balance
            md:text-4xl
          "
        >
          {{ $t('home.features.subtitle') }}
        </h2>
      </div>

      <div
        class="
          grid gap-3
          sm:grid-cols-2
          lg:grid-cols-3
        "
      >
        <div
          v-for="item in features"
          :key="item.title"
          class="
            group flex flex-col gap-3 rounded-xl border bg-card p-6
            text-card-foreground transition-colors
            hover:border-ring
            md:p-8
          "
          :class="item.featured ? `
            sm:col-span-2
            lg:col-span-1
          ` : ''"
        >
          <span
            class="
              flex size-9 items-center justify-center rounded-lg bg-muted
              text-muted-foreground transition-colors
              group-hover:bg-primary group-hover:text-primary-foreground
            "
          >
            <component
              :is="item.icon"
              class="size-4 shrink-0"
              aria-hidden="true"
            />
          </span>
          <h3 class="text-base font-medium">
            {{ item.title }}
          </h3>
          <p class="text-sm text-pretty text-muted-foreground">
            {{ item.description }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
