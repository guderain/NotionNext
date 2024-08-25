import { siteConfig } from '@/lib/config'
import { useGlobal } from '@/lib/global'
import { saveDarkModeToLocalStorage } from '@/themes/theme'
import CONFIG from '../config'
import {
  MoonOutlined,
  SunOutlined
} from '@ant-design/icons';
import { FloatButton } from 'antd';

/**
 * 深色模式按钮
 */
export default function ButtonDarkModeFloat() {
  const { isDarkMode, updateDarkMode } = useGlobal()

  if (!siteConfig('HEXO_WIDGET_DARK_MODE', null, CONFIG)) {
    return <></>
  }

  // 用户手动设置主题
  const handleChangeDarkMode = () => {
    const newStatus = !isDarkMode
    saveDarkModeToLocalStorage(newStatus)
    updateDarkMode(newStatus)
    const htmlElement = document.getElementsByTagName('html')[0]
    htmlElement.classList?.remove(newStatus ? 'light' : 'dark')
    htmlElement.classList?.add(newStatus ? 'dark' : 'light')
  }
  return (
    <div
      onClick={handleChangeDarkMode}
      className={
        'justify-center items-center w-7 h-7 text-center transform hover:scale-105 duration-200'
      }>
      <FloatButton
      icon={isDarkMode ? <SunOutlined /> : <MoonOutlined/>}
      id='darkModeButton'
      description={isDarkMode ? '白天' : '夜晚'}
      shape="square"
      style={{ insetInlineEnd: 24, position: 'fixed', top: '50%', transform: 'translateY(-50%)'}}
    />
    </div>
  )
}
