import {requestJSON} from './data-client.js';
import {mountEconomy} from './economy-view.js';
import {t} from './i18n.js';
let cleanup;
export async function openEconomy(indicator){
 const root=document.getElementById('deficitMain');cleanup?.();root.innerHTML=`<p class="deficit-loading" role="status">${t('economy.loading')}</p>`;
 try{const response=await requestJSON('/api/economy');cleanup=mountEconomy(root,response.data,indicator);}
 catch{root.innerHTML=`<p class="deficit-loading" role="alert">${t('economy.error')}</p>`;}
}
