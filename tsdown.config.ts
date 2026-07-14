import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    vue: 'src/vue.ts',
    pierre: 'src/pierre.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  deps: {
    neverBundle: ['vue'],
  },
})
