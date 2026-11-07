import { EN } from '../i18n';
import { IconChevronDown } from './Icons';
import './edition-menu.css';

const editions=[
  {path:'/', ja:'Studio 日本語', en:'Studio Japanese'},
  {path:'/en/', ja:'Studio English', en:'Studio English'},
  {path:'/education/', ja:'Education 日本語', en:'Education Japanese'},
  {path:'/education/en/', ja:'Education English', en:'Education English'},
];
/** Only show links when the four editions have been built together. */
export default function EditionMenu() {
  if(import.meta.env.VITE_PAGES_MULTISITE !== 'true') return null;
  return <details className="edition-menu"><summary><span>{EN?'Change edition':'ページを切替'}</span><IconChevronDown size={14}/></summary><nav aria-label={EN?'Choose an edition':'ページを選ぶ'}>
    {editions.map(item=><a key={item.path} href={item.path} aria-current={import.meta.env.BASE_URL===item.path?'page':undefined} onClick={e=>{if(import.meta.env.BASE_URL===item.path){e.preventDefault();return;}if(!window.confirm(EN?'Switching pages reloads the app. Unsaved editor work and API keys may be lost. Continue?':'ページを切り替えると再読み込みされ、未保存の作品やAPIキーが失われる場合があります。移動しますか？'))e.preventDefault();}}>{EN?item.en:item.ja}</a>)}
  </nav></details>;
}
