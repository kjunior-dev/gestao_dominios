"use client";
import {createContext,useContext,useState,useEffect} from 'react';
import type {PublicUser,Organization} from '@devtrust/contracts';
import {api} from '@/lib/api';
type Context={user:PublicUser;setUser:(user:PublicUser)=>void;organizations:Organization[];organization:Organization|undefined;select:(id:string)=>void;refresh:()=>Promise<void>};
const Account=createContext<Context|null>(null);
export function AccountProvider({initialUser,children}:{initialUser:PublicUser;children:React.ReactNode}){const [user,setUser]=useState(initialUser),[organizations,setOrganizations]=useState<Organization[]>([]),[selected,select]=useState('');async function refresh(){const organizations=await api.organizations();setOrganizations(organizations);}useEffect(()=>{api.organizations().then(setOrganizations).catch(()=>{});},[]);return <Account.Provider value={{user,setUser,organizations,organization:organizations.find(o=>o.id===selected)||organizations[0],select,refresh}}>{children}</Account.Provider>;}
export function useAccount(){const value=useContext(Account);if(!value)throw new Error('Missing account context');return value;}
