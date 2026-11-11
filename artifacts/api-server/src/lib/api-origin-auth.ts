import {timingSafeEqual} from "node:crypto";
import type {Request,Response,NextFunction} from "express";
/** Optional second boundary for the private Pages-to-management origin.
 * Browser identity still requires the original session; this token grants none.
 */
export function requireApiOrigin(req:Request,res:Response,next:NextFunction){
 const configured=process.env.EA_API_ORIGIN_TOKEN;
 if(configured===undefined){next();return;}
 if(!/^[A-Za-z0-9_-]{43,128}$/.test(configured)){res.status(503).json({code:"ORIGIN_AUTH_UNAVAILABLE"});return;}
 // Liveness has no account data and must remain independently observable.
 if((req.method==="GET"||req.method==="HEAD")&&req.path==="/api/healthz"){next();return;}
 const supplied=req.get("x-ea-cloud-origin-token")||"";
 const a=Buffer.from(supplied),b=Buffer.from(configured);
 if(a.length!==b.length||!timingSafeEqual(a,b)){res.status(401).json({code:"ORIGIN_AUTH_REQUIRED"});return;}
 next();
}
