import {defineConfig} from 'vite'

// GitHub Pages는 https://<user>.github.io/<repo>/ 아래에서 열리므로 상대 경로로 빌드한다.
export default defineConfig({
  base: './',
})
