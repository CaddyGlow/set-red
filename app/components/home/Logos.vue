<template>
  <section
    class="
      border-y bg-muted/30 py-10 text-foreground
      md:py-14
    "
  >
    <div class="mx-auto max-w-6xl px-6">
      <p
        class="
          text-center text-xs font-medium tracking-widest text-muted-foreground
          uppercase
        "
      >
        {{ $t('home.logos.title') }}
      </p>
      <div
        class="
          mx-auto mt-8 grid max-w-2xl grid-cols-2 items-center gap-8
          sm:gap-16
        "
      >
        <img
          class="
            h-auto w-full min-w-0 opacity-80 transition-opacity
            hover:opacity-100
          "
          alt="Cloudflare"
          src="@/assets/images/cloudflare.png"
          fetchpriority="high"
          width="350"
          height="176"
        >
        <img
          class="
            h-auto w-full min-w-0 opacity-80 transition-opacity
            hover:opacity-100
          "
          alt="Nuxt.js"
          src="@/assets/images/nuxtjs.png"
          fetchpriority="high"
          width="350"
          height="176"
        >
      </div>
    </div>
  </section>
</template>
