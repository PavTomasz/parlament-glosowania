// Accounts are deferred; this endpoint never reads or writes user records.
export default function handler(req,res){res.setHeader('Cache-Control','no-store');return res.status(410).json({ok:false,code:'ACCOUNTS_DISABLED',error:'Konta są na razie wyłączone.'});}
