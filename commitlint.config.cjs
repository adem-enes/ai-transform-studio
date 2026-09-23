module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'build', 'ci', 'perf']],
    'header-max-length': [2, 'always', 130],
  },
};
