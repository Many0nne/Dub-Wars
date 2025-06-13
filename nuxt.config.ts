// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-05-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint', '@nuxt/icon', '@nuxtjs/tailwindcss', '@pinia/nuxt'],
  plugins: [
    '~/plugins/keycloak.client.ts',
  ],
  runtimeConfig: {
    public: {
      keycloakUrl: process.env.NUXT_KEYCLOAK_URL,
      keycloakRealm: process.env.NUXT_KEYCLOAK_REALM,
      keycloakClientId: process.env.NUXT_KEYCLOAK_CLIENT_ID,
      socketIoUrl: process.env.NUXT_SOCKET_IO_URL,
    }
  }
})