"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Users,Building2} from 'lucide-react';
import {PageHeader,StatCard,Card,LoadingState,Button} from '@devtrust/ui';
import {api} from '@/lib/api';
export function AdminDashboard(){const [stats,setStats]=useState<{users:number;organizations:number}|null>(null),[error,setError]=useState('');useEffect(()=>{api.stats().then(setStats).catch(e=>setError(e.message));},[]);return <><PageHeader title="Visão da plataforma" description="Dados reais para acompanhar a operação DevTrust."/>{error?<p role="alert" className="error">{error}</p>:!stats?<LoadingState/>:<div className="grid-2"><StatCard label="Utilizadores registados" value={stats.users} icon={<Users size={20}/>}/><StatCard label="Organizações" value={stats.organizations} icon={<Building2 size={20}/>}/></div>}<Card className="section-gap"><h3>Administração com responsabilidade</h3><p>As alterações de estados e permissões são auditadas. Os serviços comerciais permanecem em preparação.</p><Button asChild variant="secondary"><Link href="/admin/auditoria">Consultar auditoria</Link></Button></Card></>;}
