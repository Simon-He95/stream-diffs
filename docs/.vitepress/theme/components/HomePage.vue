<script setup lang="ts">
import { withBase } from 'vitepress'
import { onBeforeUnmount, onMounted } from 'vue'

let revealObserver: IntersectionObserver | undefined

onMounted(() => {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return

  const elements = [...document.querySelectorAll('.home-page .sd-reveal')]
  for (const element of elements) {
    if (element.getBoundingClientRect().top < window.innerHeight * 0.92)
      element.classList.add('is-visible')
  }

  document.documentElement.classList.add('sd-motion-ready')
  revealObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting)
        continue
      entry.target.classList.add('is-visible')
      revealObserver?.unobserve(entry.target)
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' })

  for (const element of elements) {
    if (!element.classList.contains('is-visible'))
      revealObserver.observe(element)
  }
})

onBeforeUnmount(() => {
  revealObserver?.disconnect()
  document.documentElement.classList.remove('sd-motion-ready')
})
</script>

<template>
  <div class="sd-home">
    <section class="sd-hero">
      <div class="sd-container sd-hero-inner">
        <div class="sd-hero-copy">
          <p class="sd-kicker">Stream-native code rendering</p>
          <h1>Render the stream.<br><span>Land the diff.</span></h1>
          <p class="sd-lede">
            Syntax highlighting and review-ready diffs for AI output. No Monaco, no workers, editable when you need it.
          </p>
          <div class="sd-cta-row">
            <a class="sd-btn sd-btn-primary sd-btn-lg" :href="withBase('/playground.html')">Open playground</a>
            <a class="sd-btn sd-btn-lg" :href="withBase('/guide/introduction.html')">Read the guide</a>
          </div>
        </div>
        <HeroDemo />
      </div>
    </section>

    <section class="sd-strip">
      <div class="sd-container sd-strip-inner">
        <span>Built on <a href="https://diffs.com" target="_blank" rel="noreferrer">@pierre/diffs</a> and Shiki</span>
        <span>Vue, React, Svelte, vanilla</span>
        <span>0 Monaco workers</span>
        <span>MIT licensed</span>
      </div>
    </section>

    <section class="sd-container sd-states sd-reveal">
      <h2>One stream, three usable states.</h2>
      <p class="sd-section-lede">
        Start with append-only rendering. Upgrade to a review surface only when the content is complete.
      </p>

      <div class="sd-state-rail">
        <article class="sd-state">
          <div class="sd-state-label">Append</div>
          <h3>Plain text first</h3>
          <p>Deltas land in one pre. No text model, no worker, no layout thrash while the answer is still moving.</p>
          <pre class="sd-mini"><code>for await (const delta of stream)
  output.append(delta)

output.getStats()
<span class="sd-token-comment">// renderMode: 'plain-text'</span></code></pre>
        </article>

        <article class="sd-state">
          <div class="sd-state-label">Finalize</div>
          <h3>Highlighted file</h3>
          <p>One final snapshot becomes an interactive file with Shiki highlighting. The stream already sits on the final metrics, so the text does not move.</p>
          <pre class="sd-mini"><code>await output.finalize({
  view: 'file',
  enableLineSelection: true,
})</code></pre>
          <div class="sd-mini-file" aria-hidden="true">
            <span><i>1</i><b>export function</b> <em>categorize</em>(amount) {</span>
            <span><i>2</i>  <b>if</b> (amount &lt; 0) <b>return</b> <span class="sd-mini-str">'refund'</span></span>
            <span><i>3</i>  <b>return</b> amount &gt; 500 ? <span class="sd-mini-str">'large'</span> : <span class="sd-mini-str">'standard'</span></span>
            <span><i>4</i>}</span>
          </div>
        </article>

        <article class="sd-state">
          <div class="sd-state-label">Review</div>
          <h3>Accurate diff</h3>
          <p>Generate the diff from the final text, not the partial tokens. Select, annotate, accept, or reject a hunk.</p>
          <pre class="sd-mini"><code>await output.finalize({
  view: 'diff',
  original: previous,
  diffStyle: 'split',
})</code></pre>
          <div class="sd-mini-diff" aria-hidden="true">
            <span class="is-del"><i>-</i>return response.json()</span>
            <span class="is-add"><i>+</i>if (!response.ok)</span>
            <span class="is-add"><i>+</i>  throw new Error('Request failed')</span>
            <span class="is-add"><i>+</i>return response.json()</span>
          </div>
        </article>
      </div>
    </section>

    <section class="sd-container sd-features sd-reveal">
      <h2>Review surfaces, not just colored text.</h2>
      <p class="sd-section-lede">
        Every capability below ships in the controller. The playground uses the same API.
      </p>

      <div class="sd-bento">
        <article class="sd-cell sd-cell-edit">
          <div class="sd-cell-copy">
            <h3>Edit in place</h3>
            <p>
              Read-only by default. <code>startEditing()</code> loads the editor lazily, waits for hydration, and hands you a real document with undo and redo.
            </p>
            <a class="sd-text-link" :href="withBase('/guide/editing.html')">Editing guide</a>
          </div>
          <pre class="sd-cell-code"><code>const editor = await surface.startEditing({
  onChange: event => queueSave(event.file),
}, 'review-draft')</code></pre>
          <div class="sd-edit-stage" aria-hidden="true">
            <span class="sd-edit-line"><i>+</i>  if (!Number.isFinite(amount))</span>
            <span class="sd-edit-line"><i>+</i>    throw new TypeError('amount')</span>
            <span class="sd-edit-caret" />
          </div>
        </article>

        <article class="sd-cell sd-cell-annotations">
          <h3>Annotations that align</h3>
          <p>Attach review comments to a line. They survive rerenders and move with the edit session.</p>
          <div class="sd-annotation-card">
            <strong>Mina</strong>
            <p>Keep the empty-id check before the request so the network layer never sees a bad key.</p>
            <span>additions line 4</span>
          </div>
          <pre class="sd-cell-code"><code>surface.setAnnotations([
  { side: 'additions', lineNumber: 4, metadata },
])</code></pre>
        </article>

        <article class="sd-cell sd-cell-selection">
          <h3>Selection and decisions</h3>
          <p>Controlled line selection, token hover, accept and reject. The resolved file is yours to save.</p>
          <div class="sd-selection-chips" aria-hidden="true">
            <span>additions 8-12</span>
            <span>token: validate</span>
          </div>
          <pre class="sd-cell-code"><code>review.acceptReject(0, 'accept')
review.getResolvedFile()?.contents</code></pre>
        </article>

        <article class="sd-cell sd-cell-merge">
          <h3>Merge conflicts</h3>
          <p>Resolve current, incoming, or both without leaving the page.</p>
          <div class="sd-conflict" aria-hidden="true">
            <span class="is-current">&lt;&lt;&lt;&lt;&lt;&lt;&lt; current</span>
            <span>timeoutMs: 2_000</span>
            <span class="is-incoming">=======</span>
            <span>timeoutMs: 5_000</span>
            <span class="is-incoming">&gt;&gt;&gt;&gt;&gt;&gt;&gt; incoming</span>
          </div>
        </article>

        <article class="sd-cell sd-cell-markdown">
          <div>
            <h3>Drop-in for markstream-vue</h3>
            <p>If both renderers are installed, stream-diffs wins. Existing CodeBlockNode usage stays the same.</p>
          </div>
          <pre class="sd-cell-code"><code>&lt;MarkdownRender
  :content="markdown"
  :loading="streaming"
/&gt;</code></pre>
          <a class="sd-text-link" :href="withBase('/markstream-vue.html')">Integration notes</a>
        </article>
      </div>
    </section>

    <section class="sd-container sd-proof sd-reveal">
      <div class="sd-proof-copy">
        <h2>Fast enough to leave in the chat path.</h2>
        <p>
          On the measured Chrome benchmark, stream-diffs put a visible code surface on screen 92% sooner than stream-monaco and used 92% fewer renderer DOM nodes.
        </p>
        <p class="sd-proof-source">
          Chrome 150, 1440x1000, three repetitions. Methodology and commands live in the performance notes.
        </p>
        <a class="sd-text-link" :href="withBase('/performance.html')">Read the benchmark</a>
      </div>
      <div class="sd-proof-metrics">
        <div class="sd-metric">
          <strong>72.4<span>ms</span></strong>
          <p>median cold fallback visible</p>
          <small>stream-monaco: 913.0 ms</small>
        </div>
        <div class="sd-metric sd-metric-soft">
          <strong>17.3<span>kB</span></strong>
          <p>first-party runtime gzip</p>
          <small>Excludes the lazy renderer payload</small>
        </div>
        <div class="sd-metric sd-metric-soft">
          <strong>0</strong>
          <p>Monaco models or workers</p>
          <small>Append-only streaming path</small>
        </div>
      </div>
    </section>

    <section class="sd-container sd-shot sd-reveal">
      <div class="sd-shot-copy">
        <h2>The playground, at full size.</h2>
        <p>
          Edit two sources, switch unified and split, annotate a line, then start an inline editor on the rendered diff.
        </p>
      </div>
      <a class="sd-shot-frame" :href="withBase('/playground.html')" aria-label="Open the interactive diff playground">
        <img
          :src="withBase('/playground.png')"
          alt="The stream-diffs playground showing two source editors above a rendered split diff with review controls"
          loading="lazy"
          width="1392"
          height="763"
        >
      </a>
    </section>

    <section class="sd-container sd-final sd-reveal">
      <div>
        <h2>One controller for the whole code block.</h2>
        <p>Stream plain text, land a highlighted file or diff, then edit in place.</p>
      </div>
      <div class="sd-final-actions">
        <a class="sd-btn sd-btn-primary sd-btn-lg" :href="withBase('/guide/getting-started.html')">Get started</a>
        <a class="sd-btn sd-btn-lg" href="https://github.com/Simon-He95/stream-diffs" target="_blank" rel="noreferrer">Star on GitHub</a>
      </div>
    </section>
  </div>
</template>
