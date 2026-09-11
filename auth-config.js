// No identity-provider configuration is loaded in the public-data edition.
export default function handler(req,res){res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,enabled:false,email:false,providers:[]});}
