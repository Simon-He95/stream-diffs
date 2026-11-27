<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  modelValue: string
  label: string
  fileName: string
  language: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const textarea = ref<HTMLTextAreaElement>()
const gutter = ref<HTMLElement>()

const lines = computed(() => {
  const count = props.modelValue.split('\n').length
  return Array.from({ length: Math.max(count, 1) }, (_, index) => index + 1)
})

const lineCount = computed(() => {
  if (!props.modelValue)
    return 0
  return props.modelValue.endsWith('\n')
    ? props.modelValue.split('\n').length - 1
    : props.modelValue.split('\n').length
})

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}

function syncScroll() {
  if (textarea.value && gutter.value)
    gutter.value.scrollTop = textarea.value.scrollTop
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Tab')
    return
  event.preventDefault()
  const target = event.target as HTMLTextAreaElement
  const { selectionStart, selectionEnd, value } = target
  target.value = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`
  target.selectionStart = target.selectionEnd = selectionStart + 2
  emit('update:modelValue', target.value)
}
</script>

<template>
  <div class="sd-code-pane" :class="{ 'is-disabled': disabled }">
    <div class="sd-code-pane-head">
      <span class="sd-code-pane-label">{{ label }}</span>
      <code class="sd-code-pane-file">{{ fileName }}</code>
      <span class="sd-code-pane-meta">{{ lineCount }} lines</span>
    </div>
    <div class="sd-code-pane-body">
      <div ref="gutter" class="sd-gutter" aria-hidden="true">
        <span v-for="line in lines" :key="line">{{ line }}</span>
      </div>
      <textarea
        ref="textarea"
        class="sd-code-input"
        :value="modelValue"
        :disabled="disabled"
        :aria-label="`${label} source for ${fileName}`"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        wrap="off"
        @input="onInput"
        @scroll="syncScroll"
        @keydown="onKeydown"
      />
    </div>
  </div>
</template>
