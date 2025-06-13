import type { KeycloakInstance, KeycloakTokenParsed } from 'keycloak-js'
import type { Ref } from 'vue'

declare module '#app' {
  interface NuxtApp {
    keycloak: KeycloakInstance
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    keycloak: KeycloakInstance
  }
}