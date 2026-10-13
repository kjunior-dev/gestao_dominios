"use client";
import {Button} from '@devtrust/ui';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="container section"><h1>Não foi possível carregar esta página.</h1><p>Verifique a ligação e tente novamente.</p><Button onClick={reset}>Tentar novamente</Button></main>;}
