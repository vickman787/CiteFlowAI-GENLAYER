import eslintConfig from 'eslint-config-next'

const config = [
  ...eslintConfig,
  {
    ignores: ['.next/**', '.next-dev/**', 'node_modules/**'],
  },
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
    },
  },
]

export default config
