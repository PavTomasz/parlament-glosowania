import { requestJSON } from './data-client.js';
import { mountDeficit } from './deficit-view.js';
import { t } from './i18n.js';
let cleanup=null,generation=0;
export async function openDeficit() {
  const request=++generation;
  const root=document.getElementById('deficitMain');
  cleanup?.();cleanup=null;
  root.innerHTML=`<p class="deficit-loading" role="status">${t('deficit.loading')}</p>`;
  try {
    const response=await requestJSON('/api/deficit');
    if(request!==generation)return;
    if(!response.ok || !response.data?.rows?.length)throw new Error('No data');
    cleanup=mountDeficit(root,response.data);
  }catch(error){
    if(request!==generation || error.name==='AbortError')return;
    root.innerHTML=`<p class="deficit-loading" role="alert">${t('deficit.error')}</p><button class="archive-btn" type="button">${t('auth.retry')}</button>`;
    root.querySelector('button').addEventListener('click',()=>void openDeficit());
  }
}
