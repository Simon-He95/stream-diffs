import type { Theme } from 'vitepress'
import TwoslashFloatingVue from '@shikijs/vitepress-twoslash/client'
import DefaultTheme from 'vitepress/theme'
import '@shikijs/vitepress-twoslash/style.css'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './custom.css'
import Playground from './components/Playground.vue'
import MergeLab from './components/MergeLab.vue'
import StreamLab from './components/StreamLab.vue'
import HomePage from './components/HomePage.vue'
import HeroDemo from './components/HeroDemo.vue'
import { installTypeLinks } from './type-links'

export default {
  extends: DefaultTheme,
  enhanceApp({ app, router }) {
    app.use(TwoslashFloatingVue)
    installTypeLinks(router)
    app.component('HomePage', HomePage)
    app.component('HeroDemo', HeroDemo)
    app.component('Playground', Playground)
    app.component('MergeLab', MergeLab)
    app.component('StreamLab', StreamLab)
  },
} satisfies Theme
