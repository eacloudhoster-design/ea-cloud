/** Resolve only an original linked account or the authenticated legacy selection.
 * An explicit inventory disconnect/other owner always overrides legacy settings.
 */
export function receivingAccount(session:any,clientId:number,inventory:any[],legacy:any){
 if(session.owner_kind!=='client'||session.owner_id!==clientId)return null;
 const exact=inventory.find(r=>r.login===String(session.login)&&r.server===session.server);
 if(exact)return exact.owner_kind==='client'&&exact.owner_id===clientId&&exact.state==='linked'&&exact.account_role==='client'&&exact.broker===session.broker&&exact.account_mode===session.mode?exact:null;
 if(!legacy||legacy.mt5Connected!==true||legacy.mt5Login!==String(session.login)||legacy.mt5Server!==session.server||!legacy.encryptedMt5Password)return null;
 return {login:legacy.mt5Login,server:legacy.mt5Server,broker:session.broker,account_mode:session.mode,encrypted_password:legacy.encryptedMt5Password};
}
