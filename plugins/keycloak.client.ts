import Keycloak from 'keycloak-js'

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const BASE_URL = config.public.NUXT_SOCKET_IO_URL || 'http://localhost:3001'
  const keycloakConfig = {
    url: config.public.keycloakUrl,
    realm: config.public.keycloakRealm,
    clientId: config.public.keycloakClientId,
  }

  const keycloak = new Keycloak(keycloakConfig)

  const keycloakPromise = keycloak.init({
    onLoad: 'login-required',
    checkLoginIframe: false,
    pkceMethod: 'S256',
    flow: 'standard',
    redirectUri: window.location.origin,
    responseMode: 'query',
  }).then(async (auth) => {
    nuxtApp.provide('keycloak', keycloak)

    if (keycloak.authenticated) {
      await fetch(`${BASE_URL}/api/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keycloak_id: keycloak.tokenParsed?.sub,
          username: keycloak.tokenParsed?.preferred_username
        })
      })
    }

    return keycloak
  })

  nuxtApp.provide('keycloakPromise', keycloakPromise)
})