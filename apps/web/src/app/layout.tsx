import type {Metadata} from 'next';
import './globals.css';
import {Providers} from '@/components/providers';
export const metadata:Metadata={title:{default:'DevTrust Domains — A sua presença começa aqui',template:'%s | DevTrust Domains'},description:'Plataforma de domínios e gestão de organizações da DevTrust, Cabo Verde.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt" suppressHydrationWarning><body><Providers>{children}</Providers></body></html>;}
