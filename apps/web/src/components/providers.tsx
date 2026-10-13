"use client";
import {ThemeProvider,useTheme} from 'next-themes';
import {Toaster} from 'sonner';
import {Moon,Sun} from 'lucide-react';
import {Button} from '@devtrust/ui';
export function Providers({children}:{children:React.ReactNode}){return <ThemeProvider attribute="class" defaultTheme="system" enableSystem>{children}<Toaster richColors position="top-right"/></ThemeProvider>;}
export function ThemeToggle(){const {resolvedTheme,setTheme}=useTheme();return <Button variant="ghost" aria-label="Alternar tema" onClick={()=>setTheme(resolvedTheme==='dark'?'light':'dark')}><Sun size={18} className="dark:hidden"/><Moon size={18} className="hidden dark:block"/></Button>;}
