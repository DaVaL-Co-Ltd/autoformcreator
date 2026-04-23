const HELPER_INSTALLER_FILE_NAME = 'Naver-RPA-Setup.exe'
const LOCAL_DOWNLOAD_PATH = `/downloads/${HELPER_INSTALLER_FILE_NAME}`
const DEFAULT_REMOTE_DOWNLOAD_URL =
  `https://github.com/DaVaL-Co-Ltd/autoformcreator/releases/latest/download/${HELPER_INSTALLER_FILE_NAME}`

const configuredDownloadHref =
  import.meta.env.VITE_DESKTOP_HELPER_DOWNLOAD_URL ||
  (import.meta.env.DEV ? LOCAL_DOWNLOAD_PATH : DEFAULT_REMOTE_DOWNLOAD_URL)

export const DESKTOP_HELPER = {
  downloadHref: configuredDownloadHref,
  fileName: HELPER_INSTALLER_FILE_NAME,
  title: '블로그 서버 설치',
  version: '1.0.0',
  isExternal: /^https?:\/\//.test(configuredDownloadHref),
}
