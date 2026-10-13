import { randomBytes, createHash,createCipheriv,createDecipheriv,timingSafeEqual } from 'node:crypto';
export const randomToken=()=>randomBytes(32).toString('hex');
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export function equalHash(value:string,hash:string){const candidate=Buffer.from(digest(value),'hex'),expected=Buffer.from(hash,'hex');return candidate.length===expected.length && timingSafeEqual(candidate,expected);}
export function encrypt(value:string,key:string,purpose='totp'){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);cipher.setAAD(Buffer.from(purpose));const body=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),body].map(b=>b.toString('base64')).join('.');}
export function decrypt(value:string,key:string,purpose='totp'){const [iv,tag,body]=value.split('.').map(v=>Buffer.from(v,'base64'));const decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);decipher.setAAD(Buffer.from(purpose));decipher.setAuthTag(tag);return Buffer.concat([decipher.update(body),decipher.final()]).toString('utf8');}
