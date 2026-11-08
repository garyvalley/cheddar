/**
 * v-focus: focuses a field when it appears. The `autofocus` attribute works
 * only on page load, not on a field a tap reveals (a password step, a code).
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('focus', {
    mounted: (el: HTMLElement) => el.focus(),
    getSSRProps: () => ({}),
  })
})
