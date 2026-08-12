<script setup lang="ts">
import { ArrowRight, BarChart3, Link2, QrCode } from '@lucide/vue'
import { GitHubIcon, XIcon } from 'vue3-simple-icons'

const { title, description, github, twitter } = useAppConfig()

// Decorative traffic bars for the preview card, not real analytics data.
const previewBars = [28, 46, 34, 62, 52, 78, 66, 90, 74, 96, 82, 100]
</script>

<template>
  <section class="relative isolate bg-background text-foreground">
    <!-- Ambient background: soft grid fading into the page surface -->
    <div
      aria-hidden="true"
      class="
        pointer-events-none absolute inset-0 -z-10
        bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)]
        mask-[radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]
        bg-size-[56px_56px] opacity-60
      "
    />

    <div
      class="
        mx-auto max-w-6xl px-6 pt-16 pb-12
        md:pt-24 md:pb-16
      "
    >
      <div class="flex flex-col items-center text-center">
        <!-- Twitter Follow Badge -->
        <a
          :href="twitter"
          target="_blank"
          rel="noopener"
          :title="$t('home.twitter.follow')"
          class="
            inline-flex w-fit items-center gap-2 rounded-full border bg-card p-1
            pr-3 text-card-foreground transition-colors
            hover:bg-accent hover:text-accent-foreground
            focus-visible:ring-2 focus-visible:ring-ring
          "
        >
          <span
            class="
              flex size-7 items-center justify-center rounded-full bg-primary
              text-xs text-primary-foreground
            "
          >
            <XIcon aria-hidden="true" class="size-3" />
          </span>
          <span class="text-sm">{{ $t('home.twitter.follow') }}</span>
          <span class="block h-4 w-px bg-border" />
          <ArrowRight aria-hidden="true" class="size-4" />
        </a>

        <h1
          class="
            mt-8 max-w-3xl text-4xl font-medium text-balance
            md:text-6xl
            xl:text-7xl
          "
        >
          {{ title }}
        </h1>
        <p
          class="
            mt-6 max-w-2xl text-lg text-pretty text-muted-foreground
            md:text-xl
          "
        >
          {{ description }}
        </p>

        <div
          class="
            mt-10 flex flex-col items-center justify-center gap-2
            sm:flex-row
          "
        >
          <Button
            as-child
            size="lg"
          >
            <NuxtLink to="/dashboard">
              <span class="text-nowrap">{{ $t('dashboard.title') }}</span>
              <ArrowRight aria-hidden="true" />
            </NuxtLink>
          </Button>
          <Button
            as-child
            size="lg"
            variant="ghost"
          >
            <a
              :href="github"
              target="_blank"
              rel="noopener noreferrer"
              :title="$t('layouts.footer.social.github')"
            >
              <GitHubIcon aria-hidden="true" />
              <span class="text-nowrap">{{ $t('home.hero.github_repo') }}</span>
            </a>
          </Button>
        </div>
      </div>

      <!-- Product preview: long destination collapsing into a short link -->
      <div
        class="
          relative mx-auto mt-14 max-w-3xl
          md:mt-20
        "
      >
        <div
          aria-hidden="true"
          class="
            absolute inset-x-8 -top-4 -z-10 h-full rounded-2xl border bg-card/60
          "
        />
        <Card>
          <CardContent class="space-y-6">
            <div class="flex items-center gap-2">
              <span class="size-2.5 rounded-full bg-destructive/60" />
              <span class="size-2.5 rounded-full bg-muted-foreground/40" />
              <span class="size-2.5 rounded-full bg-success/60" />
            </div>

            <div class="space-y-3">
              <p
                class="
                  truncate rounded-lg bg-muted px-3 py-2 text-left text-sm
                  text-muted-foreground
                "
              >
                https://example.com/blog/2026/how-we-migrated-everything-to-the-edge?utm_source=newsletter
              </p>
              <div class="flex items-center gap-3">
                <span
                  class="
                    flex size-8 shrink-0 items-center justify-center rounded-lg
                    bg-primary text-primary-foreground
                  "
                >
                  <Link2 aria-hidden="true" class="size-4" />
                </span>
                <p
                  class="
                    truncate text-left text-lg font-medium
                    md:text-xl
                  "
                >
                  sink.cool/edge
                </p>
                <div
                  class="
                    ml-auto flex shrink-0 items-center gap-2
                    text-muted-foreground
                  "
                >
                  <QrCode aria-hidden="true" class="size-4" />
                  <BarChart3 aria-hidden="true" class="size-4" />
                </div>
              </div>
            </div>

            <div
              aria-hidden="true"
              class="flex h-16 items-end gap-1.5 border-t pt-4"
            >
              <span
                v-for="(bar, index) in previewBars"
                :key="index"
                class="flex-1 rounded-sm bg-primary/20"
                :class="index === previewBars.length - 1 ? 'bg-primary' : ''"
                :style="{ height: `${bar}%` }"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </section>
</template>
