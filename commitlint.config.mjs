export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [0, 'always'],
    'subject-case': [2, 'always', ['lower-case', 'sentence-case']],
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'],
    ],
    'scope-enum': [
      1,
      'always',
      ['core', 'stream', 'diff', 'edit', 'vue', 'markstream', 'docs', 'site', 'examples', 'ci', 'deps', 'release'],
    ],
  },
}
