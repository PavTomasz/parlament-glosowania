// Public-data edition: no account, token or Supabase connection is required.
export async function requestJSON(url,options={}) {
  const headers=new Headers(options.headers);
  headers.set('Accept','application/json');
  if(options.body && !headers.has('Content-Type'))headers.set('Content-Type','application/json');
  const response=await fetch(url,{...options,headers,credentials:'omit',signal:options.signal||AbortSignal.timeout(60000)});
  const data=await response.json();
  if(!response.ok || data?.ok===false)throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}
