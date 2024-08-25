import { AdSlot } from '@/components/GoogleAdsense'
import Announcement from './Announcement'
import Catalog from './Catalog'
import WWAds from '@/components/WWAds'
import ButtonDarkModeFloat from './ButtonFloatDarkMode'
/**
 * 侧边栏
 * @param {*} props
 * @returns
 */
export default function SideBar (props) {
  const { notice } = props
  return (<>

            <Catalog {...props} />

            <ButtonDarkModeFloat/>

            <Announcement post={notice} />

            <AdSlot/>
            <WWAds orientation="vertical" className="w-full" />

    </>)
}
