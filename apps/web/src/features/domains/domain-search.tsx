"use client";
import {useState} from 'react';
import {Search,ArrowRight} from 'lucide-react';
import {Button} from '@devtrust/ui';
export function DomainSearch(){const [message,setMessage]=useState('');return <><form className="search-box" onSubmit={e=>{e.preventDefault();setMessage('A pesquisa de disponibilidade será disponibilizada na Fase 2. Não foi efetuada uma consulta.');}}><Search size={22} aria-hidden/><label className="sr-only" htmlFor="domain">Nome de domínio</label><input id="domain" placeholder="Encontre o nome da sua próxima ideia" required maxLength={253}/><Button>Explorar domínio <ArrowRight size={16}/></Button></form><p className="search-note" aria-live="polite">{message||'Pesquisa em preparação. Ainda não efetuamos consultas de disponibilidade.'}</p></>;}
